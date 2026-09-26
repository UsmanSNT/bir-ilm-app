/**
 * Ijtimoiy bo'lim domen mantiqi.
 *
 * Bu qatlam HTTP, Next.js va platformadan MUSTAQIL: kiruvchi ma'lumot allaqachon
 * tekshirilgan, `userId` allaqachon serverda hisoblangan. Shu sababli aynan shu
 * funksiyalar web, Android va iOS uchun bir xil natija beradi.
 */
import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { forbidden, notFound } from "@/server/http/errors";
import type {
  CreatePostInput,
  CreateReplyInput,
  FeedQuery,
  FocusSessionInput,
  FocusSummary,
  FollowInput,
  Page,
  Post,
  ReaderProfile,
  Reply,
  UpdateProfileInput,
} from "@/shared/contract";
import { decodeCursor, encodeCursor } from "./cursor";

const { users, readingPosts, postReplies, readerFollows, focusSessions } = schema;

/** Foydalanuvchi yozuvini kafolatlaydi. Har bir yozuv amalidan oldin chaqiriladi. */
export async function ensureUser(db: Database, userId: string, name?: string): Promise<void> {
  if (name) {
    await db
      .insert(users)
      .values({ id: userId, name })
      .onConflictDoUpdate({
        target: users.id,
        set: { name, updatedAt: sql`CURRENT_TIMESTAMP` },
      });
    return;
  }

  await db.insert(users).values({ id: userId }).onConflictDoNothing();
}

// Jadval nomlari to'g'ridan-to'g'ri yozilgan: drizzle ustun obyektlarini
// tanlov ro'yxati ichida jadvalsiz render qiladi va korrelyatsion subquery
// o'zini o'ziga solishtirib qolardi (natija har doim 0).
const postsCountSql = sql<number>`(select count(*) from reading_posts where reading_posts.user_id = users.id)`;
const followersCountSql = sql<number>`(select count(*) from reader_follows where reader_follows.followed_id = users.id)`;

/** Profil + hisoblangan ko'rsatkichlar. */
export async function getProfile(db: Database, userId: string): Promise<ReaderProfile | null> {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      bio: users.bio,
      posts: postsCountSql,
      followers: followersCountSql,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return rows[0] ?? null;
}

export async function updateProfile(
  db: Database,
  userId: string,
  input: UpdateProfileInput,
): Promise<ReaderProfile> {
  await ensureUser(db, userId, input.name);

  if (input.bio !== undefined) {
    await db
      .update(users)
      .set({ bio: input.bio, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(users.id, userId));
  }

  const profile = await getProfile(db, userId);
  if (!profile) throw notFound("Profil topilmadi.");
  return profile;
}

/** Kitobxonlar ro'yxati (kashf qilish uchun). */
export async function listReaders(db: Database, limit = 100): Promise<ReaderProfile[]> {
  return db
    .select({
      id: users.id,
      name: users.name,
      bio: users.bio,
      posts: postsCountSql,
      followers: followersCountSql,
    })
    .from(users)
    .where(sql`${users.id} LIKE 'reader_%'`)
    .orderBy(desc(postsCountSql), desc(users.createdAt))
    .limit(limit);
}

/** Lenta. Kursorli, shuning uchun mobil ilovada cheksiz varaqlash ishlaydi. */
export async function getFeed(
  db: Database,
  viewerId: string,
  query: FeedQuery,
): Promise<Page<Post>> {
  const conditions = [];

  if (query.scope === "following") {
    const followed = db
      .select({ id: readerFollows.followedId })
      .from(readerFollows)
      .where(eq(readerFollows.followerId, viewerId));
    conditions.push(inArray(readingPosts.userId, followed));
  }

  if (query.scope === "mine") {
    conditions.push(eq(readingPosts.userId, viewerId));
  }

  if (query.scope === "author" && query.author) {
    conditions.push(eq(readingPosts.userId, query.author));
  }

  const cursor = decodeCursor(query.cursor);
  if (cursor) {
    // (created_at, id) juftligi bo'yicha qat'iy kichik — bir xil vaqtli
    // yozuvlar ham takrorlanmaydi va tushib qolmaydi.
    const older = or(
      lt(readingPosts.createdAt, cursor.createdAt),
      and(eq(readingPosts.createdAt, cursor.createdAt), lt(readingPosts.id, cursor.id)),
    );
    if (older) conditions.push(older);
  }

  // Bittasini ortiqcha o'qiymiz: keyingi sahifa bor-yo'qligini shundan bilamiz.
  const rows = await db
    .select({
      id: readingPosts.id,
      userId: readingPosts.userId,
      name: users.name,
      book: readingPosts.book,
      body: readingPosts.body,
      createdAt: readingPosts.createdAt,
    })
    .from(readingPosts)
    .innerJoin(users, eq(users.id, readingPosts.userId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(readingPosts.createdAt), desc(readingPosts.id))
    .limit(query.limit + 1);

  const hasMore = rows.length > query.limit;
  const items = hasMore ? rows.slice(0, query.limit) : rows;
  const replies = await getRepliesFor(db, items.map((row) => row.id));
  const last = items[items.length - 1];

  return {
    items: items.map((row) => ({
      ...row,
      replies: replies.filter((reply) => reply.postId === row.id),
    })),
    nextCursor: hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null,
  };
}

async function getRepliesFor(db: Database, postIds: string[]): Promise<Reply[]> {
  if (!postIds.length) return [];

  return db
    .select({
      id: postReplies.id,
      postId: postReplies.postId,
      userId: postReplies.userId,
      name: users.name,
      body: postReplies.body,
      createdAt: postReplies.createdAt,
    })
    .from(postReplies)
    .innerJoin(users, eq(users.id, postReplies.userId))
    .where(inArray(postReplies.postId, postIds))
    .orderBy(postReplies.createdAt, postReplies.id);
}

export async function createPost(
  db: Database,
  userId: string,
  input: CreatePostInput,
): Promise<Post> {
  await ensureUser(db, userId);

  const [created] = await db
    .insert(readingPosts)
    .values({ id: crypto.randomUUID(), userId, book: input.book, body: input.body })
    .returning();

  return {
    id: created.id,
    userId: created.userId,
    name: await readerName(db, userId),
    book: created.book,
    body: created.body,
    createdAt: created.createdAt,
    replies: [],
  };
}

export async function deletePost(db: Database, userId: string, postId: string): Promise<void> {
  const owner = await db
    .select({ userId: readingPosts.userId })
    .from(readingPosts)
    .where(eq(readingPosts.id, postId))
    .limit(1);

  if (!owner.length) throw notFound("Post topilmadi.");
  if (owner[0].userId !== userId) {
    const actor = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { role: true } });
    if (actor?.role !== "admin" && actor?.role !== "moderator") throw forbidden("Bu post sizniki emas.");
  }

  // `post_replies` da ON DELETE CASCADE bor, lekin D1 da foreign key majburlash
  // o'chirilgan bo'lishi mumkin — izohlarni aniq o'chiramiz.
  await db.delete(postReplies).where(eq(postReplies.postId, postId));
  await db.delete(schema.postReports).where(eq(schema.postReports.postId, postId));
  await db.delete(readingPosts).where(eq(readingPosts.id, postId));
}

export async function createReply(
  db: Database,
  userId: string,
  postId: string,
  input: CreateReplyInput,
): Promise<Reply> {
  await ensureUser(db, userId);

  const post = await db
    .select({ id: readingPosts.id })
    .from(readingPosts)
    .where(eq(readingPosts.id, postId))
    .limit(1);

  if (!post.length) throw notFound("Post topilmadi.");

  const [created] = await db
    .insert(postReplies)
    .values({ id: crypto.randomUUID(), postId, userId, body: input.body })
    .returning();

  return {
    id: created.id,
    postId: created.postId,
    userId: created.userId,
    name: await readerName(db, userId),
    body: created.body,
    createdAt: created.createdAt,
  };
}

export async function setFollow(
  db: Database,
  userId: string,
  input: FollowInput,
): Promise<{ following: boolean }> {
  if (input.target === userId) throw forbidden("O'zingizga obuna bo'la olmaysiz.");

  const target = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, input.target))
    .limit(1);

  if (!target.length) throw notFound("Kitobxon topilmadi.");

  if (input.follow) {
    await db
      .insert(readerFollows)
      .values({ followerId: userId, followedId: input.target })
      .onConflictDoNothing();
  } else {
    await db
      .delete(readerFollows)
      .where(
        and(eq(readerFollows.followerId, userId), eq(readerFollows.followedId, input.target)),
      );
  }

  return { following: input.follow };
}

export async function listFollowing(db: Database, userId: string): Promise<string[]> {
  const rows = await db
    .select({ id: readerFollows.followedId })
    .from(readerFollows)
    .where(eq(readerFollows.followerId, userId));

  return rows.map((row) => row.id);
}

/** Fokus seansi. `sessionId` takroriy yuborilsa ikkinchi marta hisoblanmaydi. */
export async function recordFocusSession(
  db: Database,
  userId: string,
  input: FocusSessionInput,
): Promise<FocusSummary> {
  await ensureUser(db, userId);

  await db
    .insert(focusSessions)
    .values({ id: input.sessionId, userId, minutes: input.minutes })
    .onConflictDoNothing();

  return getFocusSummary(db, userId);
}

export async function getFocusSummary(db: Database, userId: string): Promise<FocusSummary> {
  const rows = await db
    .select({
      minutes: sql<number>`coalesce(sum(${focusSessions.minutes}), 0)`,
      sessions: sql<number>`count(*)`,
    })
    .from(focusSessions)
    .where(eq(focusSessions.userId, userId));

  return { minutes: rows[0]?.minutes ?? 0, sessions: rows[0]?.sessions ?? 0 };
}

export async function countFollowers(db: Database, userId: string): Promise<number> {
  const rows = await db
    .select({ total: sql<number>`count(*)` })
    .from(readerFollows)
    .where(eq(readerFollows.followedId, userId));

  return rows[0]?.total ?? 0;
}

async function readerName(db: Database, userId: string): Promise<string> {
  const rows = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return rows[0]?.name ?? "Kitobxon";
}
