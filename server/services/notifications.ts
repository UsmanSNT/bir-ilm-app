/**
 * Shaxsiy bildirishnomalar: postingizga reaksiya, izoh va izohingizga javob.
 *
 * Hodisa sodir bo'lganda (reaksiya, izoh) shu yerda yoziladi, egasi ochganda o'chiriladi —
 * qo'ng'iroqchada faqat o'qilmaganlar qoladi. O'zingizning amalingiz uchun bildirishnoma yo'q.
 * ID deterministik, shuning uchun takroriy chaqiruv (qayta reaksiya, qayta urinish) dublikat yaratmaydi.
 */
import { and, desc, eq, inArray, isNotNull, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { Database } from "@/server/db/client";
import { schema } from "@/server/db/client";
import {
  NOTIFICATION_EXCERPT,
  NOTIFICATION_PAGE,
  type AppNotification,
  type MarkNotificationsReadInput,
  type NotificationInbox,
  type ReceivedReaction,
} from "@/shared/contract";

const { notifications, postReactions, postReplies, readingPosts, users } = schema;

/** Faollik → Reaksiyalar ro'yxatining uzunligi. */
const RECEIVED_REACTIONS_LIMIT = 30;

const reactionKey = (postId: string, actorId: string) => `r:${postId}:${actorId}`;

/** Bir qatorli, uzunligi cheklangan parcha (bildirishnoma matni uchun). */
function excerpt(text: string | null | undefined): string {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  return flat.length > NOTIFICATION_EXCERPT ? `${flat.slice(0, NOTIFICATION_EXCERPT).trimEnd()}…` : flat;
}

const postExcerpt = (title: string, body: string) => excerpt(title || body);

// ── Hodisalar ───────────────────────────────────────────────────────

/** Reaksiya qo'yildi yoki almashtirildi: post egasiga bitta bildirishnoma (emoji yangilanadi). */
export async function notifyReaction(
  db: Database,
  event: { postId: string; ownerId: string; actorId: string; emoji: string },
): Promise<void> {
  if (event.ownerId === event.actorId) return;
  await db
    .insert(notifications)
    .values({
      id: reactionKey(event.postId, event.actorId),
      userId: event.ownerId,
      actorId: event.actorId,
      type: "reaction",
      postId: event.postId,
      emoji: event.emoji,
    })
    .onConflictDoUpdate({
      target: notifications.id,
      set: { emoji: event.emoji, createdAt: sql`CURRENT_TIMESTAMP` },
    });
}

/** Reaksiya olib tashlandi — «yoqtirdi» degan bildirishnoma ham qolmasin. */
export async function clearReaction(db: Database, postId: string, actorId: string): Promise<void> {
  await db.delete(notifications).where(eq(notifications.id, reactionKey(postId, actorId)));
}

/**
 * Yangi izoh: izohga javob bo'lsa — o'sha izoh egasiga, aks holda (yoki u boshqa odam bo'lsa) — post egasiga.
 * Post egasi javob berilgan izoh egasi ham bo'lsa, unga bitta (aniqroq) «izohingizga javob» boradi.
 */
export async function notifyReply(
  db: Database,
  event: { replyId: string; postId: string; postOwnerId: string; actorId: string; parentAuthorId: string | null },
): Promise<void> {
  const base = { actorId: event.actorId, postId: event.postId, replyId: event.replyId };
  const rows: (typeof notifications.$inferInsert)[] = [];
  if (event.parentAuthorId && event.parentAuthorId !== event.actorId) {
    rows.push({ ...base, id: `p:${event.replyId}`, userId: event.parentAuthorId, type: "reply_to_reply" });
  }
  if (event.postOwnerId !== event.actorId && event.postOwnerId !== event.parentAuthorId) {
    rows.push({ ...base, id: `c:${event.replyId}`, userId: event.postOwnerId, type: "reply" });
  }
  if (rows.length) await db.insert(notifications).values(rows).onConflictDoNothing();
}

/** Izoh o'chirildi — unga oid bildirishnomalar ham. */
export async function clearReplyNotifications(db: Database, replyIds: string[]): Promise<void> {
  if (replyIds.length) await db.delete(notifications).where(inArray(notifications.replyId, replyIds));
}

/** Post o'chirildi — unga oid barcha bildirishnomalar. */
export async function clearPostNotifications(db: Database, postId: string): Promise<void> {
  await db.delete(notifications).where(eq(notifications.postId, postId));
}

// ── O'qish ──────────────────────────────────────────────────────────

const actor = alias(users, "actor");

/**
 * Ko'rinadigan bildirishnomalar sharti: muallif va post hali bor, izoh turlarida izoh ham bor.
 * (D1 da foreign key majburlanmasligi mumkin — yetim yozuvlar ro'yxatga va songa tushmaydi.)
 */
function visibleFor(userId: string) {
  return and(eq(notifications.userId, userId), or(eq(notifications.type, "reaction"), isNotNull(postReplies.id)));
}

function inboxQuery(db: Database) {
  return db
    .select({
      id: notifications.id,
      type: notifications.type,
      postId: notifications.postId,
      replyId: notifications.replyId,
      emoji: notifications.emoji,
      createdAt: notifications.createdAt,
      actorId: notifications.actorId,
      actorName: actor.name,
      actorAvatar: actor.avatarUrl,
      postTitle: readingPosts.title,
      postBody: readingPosts.body,
      // Nomlari bir xil ustunlar (body) aniq nomlanadi — natija ustun nomi bo'yicha ham o'qiladi.
      replyBody: sql<string | null>`${postReplies.body}`.as("reply_body"),
    })
    .from(notifications)
    .innerJoin(actor, eq(actor.id, notifications.actorId))
    .innerJoin(readingPosts, eq(readingPosts.id, notifications.postId))
    .leftJoin(postReplies, eq(postReplies.id, notifications.replyId));
}

async function countUnread(db: Database, userId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`count(*)` })
    .from(notifications)
    .innerJoin(actor, eq(actor.id, notifications.actorId))
    .innerJoin(readingPosts, eq(readingPosts.id, notifications.postId))
    .leftJoin(postReplies, eq(postReplies.id, notifications.replyId))
    .where(visibleFor(userId));
  return Number(row?.total ?? 0);
}

/** Qo'ng'iroqcha: o'qilmagan bildirishnomalar (yangisi tepada) va ularning jami soni. */
export async function listNotifications(db: Database, userId: string): Promise<NotificationInbox> {
  const [rows, unread] = await Promise.all([
    inboxQuery(db)
      .where(visibleFor(userId))
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(NOTIFICATION_PAGE),
    countUnread(db, userId),
  ]);
  const items: AppNotification[] = rows.map((row) => ({
    id: row.id,
    type: row.type,
    actor: { id: row.actorId, name: row.actorName, avatarUrl: row.actorAvatar },
    postId: row.postId,
    postExcerpt: postExcerpt(row.postTitle, row.postBody),
    replyId: row.replyId,
    replyExcerpt: excerpt(row.replyBody),
    emoji: row.emoji,
    createdAt: row.createdAt,
  }));
  return { items, unread };
}

/** Ochilgan bildirishnomalar o'chiriladi (faqat o'ziniki). Qolgan o'qilmaganlar sonini qaytaradi. */
export async function markNotificationsRead(
  db: Database,
  userId: string,
  input: MarkNotificationsReadInput,
): Promise<{ unread: number }> {
  const mine = eq(notifications.userId, userId);
  await db.delete(notifications).where(input.all ? mine : and(mine, inArray(notifications.id, input.ids ?? [])));
  return { unread: await countUnread(db, userId) };
}

/** Faollik → Reaksiyalar: boshqalar postlaringizga bildirgan reaksiyalar (o'qilgan-o'qilmaganidan qat'i nazar). */
export async function listReceivedReactions(db: Database, userId: string): Promise<ReceivedReaction[]> {
  const rows = await db
    .select({
      postId: postReactions.postId,
      emoji: postReactions.emoji,
      createdAt: postReactions.createdAt,
      postTitle: readingPosts.title,
      postBody: readingPosts.body,
      actorId: postReactions.userId,
      actorName: actor.name,
      actorAvatar: actor.avatarUrl,
    })
    .from(postReactions)
    .innerJoin(readingPosts, eq(readingPosts.id, postReactions.postId))
    .innerJoin(actor, eq(actor.id, postReactions.userId))
    .where(and(eq(readingPosts.userId, userId), ne(postReactions.userId, userId)))
    .orderBy(desc(postReactions.createdAt))
    .limit(RECEIVED_REACTIONS_LIMIT);
  return rows.map((row) => ({
    postId: row.postId,
    postExcerpt: postExcerpt(row.postTitle, row.postBody),
    actor: { id: row.actorId, name: row.actorName, avatarUrl: row.actorAvatar },
    emoji: row.emoji,
    createdAt: row.createdAt,
  }));
}
