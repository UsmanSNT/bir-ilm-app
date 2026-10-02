/**
 * Community: formatlangan postlar va maqolalar, rasm/video yuklash, reaksiyalar.
 *
 * Yozish (post, izoh, reaksiya, yuklash) faqat ro'yxatdan o'tganlarga —
 * Google/Telegram bog'langan yoki admin/moderator. O'qish hammaga ochiq.
 *
 * Media fayllar diskda: BIR_ILM_MEDIA_DIR/posts/<id>.<kengaytma>. Avval yuklanadi
 * (post_id = null), post joylanganda unga bog'lanadi. 24 soat ichida postga
 * bog'lanmagan fayllar keyingi yuklashda tozalanadi.
 */
import { appendFile, mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { and, asc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { ApiException, badRequest, forbidden, notFound, unauthorized, validationFailed } from "@/server/http/errors";
import { isSignedIn } from "./accounts";
import { mediaRoot } from "./books";
import { getUserRole } from "./roles";
import {
  COMMUNITY_LIMITS,
  IMAGE_TYPES,
  MEDIA_EXTENSIONS,
  canModerate,
  docSchema,
  docToText,
  type CreateCommunityPostInput,
  type CreateUploadInput,
  type Doc,
  type MediaItem,
  type ReactInput,
  type ReactionCount,
  type UploadProgress,
  type UploadTicket,
} from "@/shared/contract";

const { postMedia, postReactions, postReplies, postReports, readingPosts } = schema;
type MediaRow = typeof postMedia.$inferSelect;

export const POST_MEDIA_FILE = /^[0-9a-f-]{36}\.(jpg|png|webp|gif|mp4|webm|mov)$/;
const ID_PATTERN = /^[0-9a-f-]{36}$/;

const rateLimited = (message: string) => new ApiException("rate_limited", message, 429);

export function postMediaDir(): string {
  return path.join(mediaRoot(), "posts");
}

function partPath(id: string): string {
  if (!ID_PATTERN.test(id)) throw notFound("Fayl topilmadi.");
  return path.join(postMediaDir(), `${id}.upload`);
}

export function toMediaItem(row: MediaRow): MediaItem {
  return {
    id: row.id,
    kind: row.kind,
    mime: row.mime,
    url: `/media/posts/${row.file}`,
    width: row.width,
    height: row.height,
    seconds: row.seconds,
  };
}

/** Yozish amallaridan oldin: mehmon emas, ro'yxatdan o'tgan foydalanuvchi. */
export async function requireSignedIn(db: Database, userId: string, action = "Yozish"): Promise<void> {
  if (!(await isSignedIn(db, userId))) {
    throw unauthorized(`${action} uchun Google yoki Telegram orqali kiring.`);
  }
}

// ── Yuklash ─────────────────────────────────────────────────────────

/** Fayl boshidagi "sehrli baytlar" — Content-Type ga ishonmaymiz. */
function matchesSignature(mime: string, head: Uint8Array): boolean {
  const ascii = (from: number, to: number) => String.fromCharCode(...head.subarray(from, to));
  switch (mime) {
    case "image/jpeg":
      return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    case "image/png":
      return head[0] === 0x89 && ascii(1, 4) === "PNG";
    case "image/gif":
      return ascii(0, 4) === "GIF8";
    case "image/webp":
      return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
    case "video/webm":
      return head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3;
    case "video/mp4":
    case "video/quicktime":
      return ["ftyp", "moov", "mdat", "wide", "free", "skip"].includes(ascii(4, 8));
    default:
      return false;
  }
}

/** Postga bog'lanmay qolgan (24 soatdan eski) yuklamalarni o'chiradi. */
export async function cleanupStaleMedia(db: Database): Promise<void> {
  const stale = await db
    .select({ id: postMedia.id, file: postMedia.file })
    .from(postMedia)
    .where(and(isNull(postMedia.postId), lt(postMedia.createdAt, sql`datetime('now', '-1 day')`)))
    .limit(200);
  if (!stale.length) return;
  await removeMediaFiles(stale);
  await db.delete(postMedia).where(inArray(postMedia.id, stale.map((row) => row.id)));
}

async function removeMediaFiles(rows: { id: string; file: string | null }[]): Promise<void> {
  const dir = postMediaDir();
  await Promise.all(rows.flatMap((row) => [
    rm(path.join(dir, `${row.id}.upload`), { force: true }),
    row.file && POST_MEDIA_FILE.test(row.file) ? rm(path.join(dir, row.file), { force: true }) : Promise.resolve(),
  ]));
}

export async function createUpload(db: Database, userId: string, input: CreateUploadInput): Promise<UploadTicket> {
  await requireSignedIn(db, userId, "Rasm yoki video yuklash");
  const kind = (IMAGE_TYPES as readonly string[]).includes(input.type) ? "image" : "video";
  const limit = kind === "image" ? COMMUNITY_LIMITS.imageBytes : COMMUNITY_LIMITS.videoBytes;
  if (input.bytes > limit) {
    throw new ApiException("bad_request", kind === "image" ? "Rasm 15 MB dan oshmasin." : "Video 300 MB dan oshmasin.", 413);
  }

  const [recent] = await db
    .select({ n: sql<number>`count(*)` })
    .from(postMedia)
    .where(and(eq(postMedia.userId, userId), sql`${postMedia.createdAt} > datetime('now', '-1 hour')`));
  if ((recent?.n ?? 0) >= 80) throw rateLimited("Juda ko'p fayl yuklandi. Birozdan keyin urinib ko'ring.");

  await cleanupStaleMedia(db);
  await mkdir(postMediaDir(), { recursive: true });

  const id = crypto.randomUUID();
  await db.insert(postMedia).values({
    id,
    userId,
    kind,
    mime: input.type,
    bytes: input.bytes,
    width: input.width,
    height: input.height,
    seconds: Math.round(input.seconds),
  });
  return { id, chunkBytes: COMMUNITY_LIMITS.chunkBytes, received: 0, total: input.bytes };
}

async function ownUpload(db: Database, userId: string, id: string): Promise<MediaRow> {
  const row = ID_PATTERN.test(id) ? await db.query.postMedia.findFirst({ where: eq(postMedia.id, id) }) : undefined;
  if (!row || row.userId !== userId) throw notFound("Yuklash topilmadi.");
  return row;
}

async function sizeOf(file: string): Promise<number> {
  return stat(file).then((s) => s.size, () => 0);
}

export async function uploadStatus(db: Database, userId: string, id: string): Promise<UploadTicket> {
  const row = await ownUpload(db, userId, id);
  const received = row.file ? row.bytes : await sizeOf(partPath(id));
  return { id, chunkBytes: COMMUNITY_LIMITS.chunkBytes, received, total: row.bytes };
}

/** Bo'lakni qo'shadi; oxirgi bo'lakda fayl tekshirilib, joyiga qo'yiladi. */
export async function appendUpload(
  db: Database,
  userId: string,
  id: string,
  offset: number,
  chunk: Uint8Array,
): Promise<UploadProgress> {
  const row = await ownUpload(db, userId, id);
  if (row.file) return { done: true, received: row.bytes, media: toMediaItem(row) };

  const part = partPath(id);
  const received = await sizeOf(part);
  if (!Number.isInteger(offset) || offset !== received) {
    throw new ApiException("bad_request", "Bo'lak tartibi buzildi.", 409);
  }
  if (!chunk.length || chunk.length > COMMUNITY_LIMITS.chunkBytes) {
    throw new ApiException("bad_request", "Bo'lak hajmi noto'g'ri.", 413);
  }
  if (offset + chunk.length > row.bytes) {
    throw new ApiException("bad_request", "Fayl e'lon qilingan hajmdan katta.", 413);
  }
  if (offset === 0 && !matchesSignature(row.mime, chunk.subarray(0, 16))) {
    throw new ApiException("bad_request", "Fayl turi mos emas: rasm (JPG, PNG, WEBP, GIF) yoki video (MP4, WEBM, MOV) yuklang.", 415);
  }
  await appendFile(part, chunk);

  const now = offset + chunk.length;
  if (now < row.bytes) return { done: false, received: now };

  const file = `${id}.${MEDIA_EXTENSIONS[row.mime]}`;
  await rename(part, path.join(postMediaDir(), file));
  const [ready] = await db.update(postMedia).set({ file }).where(eq(postMedia.id, id)).returning();
  return { done: true, received: now, media: toMediaItem(ready) };
}


// ── Postlar ─────────────────────────────────────────────────────────

function mediaIdsIn(doc: Doc): string[] {
  return doc.flatMap((block) => (block.type === "media" ? [block.id] : []));
}

/** Bo'sh paragraflarni olib tashlaydi va matnni tekshiradi. */
function normalize(input: CreateCommunityPostInput) {
  const content = input.content.filter((block) =>
    block.type === "p" || block.type === "h" || block.type === "quote"
      ? block.c.some((item) => item.t.trim())
      : block.type === "code" ? block.text.trim() : true,
  );
  const text = docToText(content);
  const fields: Record<string, string[]> = {};
  const max = input.format === "article" ? COMMUNITY_LIMITS.articleText : COMMUNITY_LIMITS.postText;
  if (text.length > max) fields.content = [`Matn ${max.toLocaleString("ru-RU")} belgidan oshmasin.`];
  const inline = mediaIdsIn(content);
  if (inline.length > COMMUNITY_LIMITS.inlineMedia) fields.content = [`Matn ichida ${COMMUNITY_LIMITS.inlineMedia} tadan ko'p rasm/video bo'lmasin.`];
  if (new Set([...inline, ...input.attachments]).size !== inline.length + input.attachments.length) {
    fields.content = ["Bitta fayl ikki marta qo'shilgan."];
  }
  if ((input.format === "article" || input.kind === "announcement") && !input.title) {
    fields.title = [input.kind === "announcement" ? "E'lon sarlavhasini yozing." : "Maqola sarlavhasini yozing."];
  }
  if (!text && !inline.length && !input.attachments.length) fields.content = ["Matn yozing yoki rasm/video qo'shing."];
  if (Object.keys(fields).length) throw validationFailed(fields, Object.values(fields)[0][0]);
  return { content, text, inline };
}

/** Post uchun ishlatilayotgan barcha media shu foydalanuvchiniki va yuklanib bo'lgan bo'lsin. */
async function claimableMedia(db: Database, userId: string, ids: string[], postId: string | null): Promise<void> {
  if (!ids.length) return;
  const rows = await db.select().from(postMedia).where(inArray(postMedia.id, ids));
  const ok = rows.length === ids.length && rows.every((row) =>
    row.userId === userId && row.file && (row.postId === null || row.postId === postId));
  if (!ok) throw badRequest("Ba'zi rasm yoki videolar topilmadi — qayta yuklang.");
}

async function bindMedia(db: Database, postId: string, attachments: string[], inline: string[]): Promise<void> {
  const current = await db.select({ id: postMedia.id, file: postMedia.file }).from(postMedia).where(eq(postMedia.postId, postId));
  const keep = new Set([...attachments, ...inline]);
  const dropped = current.filter((row) => !keep.has(row.id));
  if (dropped.length) {
    await removeMediaFiles(dropped);
    await db.delete(postMedia).where(inArray(postMedia.id, dropped.map((row) => row.id)));
  }
  const updates = [
    ...attachments.map((id, position) => ({ id, role: "attachment" as const, position })),
    ...inline.map((id, position) => ({ id, role: "inline" as const, position })),
  ];
  for (const item of updates) {
    await db.update(postMedia).set({ postId, role: item.role, position: item.position }).where(eq(postMedia.id, item.id));
  }
}

export async function createCommunityPost(db: Database, userId: string, input: CreateCommunityPostInput): Promise<{ id: string }> {
  await requireSignedIn(db, userId, "Post yozish");
  const role = await getUserRole(db, userId);
  const moderator = canModerate(role);
  if (input.kind === "announcement" && !moderator) throw forbidden("E'lonni faqat admin yoki moderator joylaydi.");

  if (!moderator) {
    const [recent] = await db
      .select({ n: sql<number>`count(*)` })
      .from(readingPosts)
      .where(and(eq(readingPosts.userId, userId), sql`${readingPosts.createdAt} > datetime('now', '-10 minutes')`));
    if ((recent?.n ?? 0) >= 10) throw rateLimited("Juda tez yozyapsiz. Birozdan keyin urinib ko'ring.");
  }

  const { content, text, inline } = normalize(input);
  await claimableMedia(db, userId, [...input.attachments, ...inline], null);

  const id = crypto.randomUUID();
  await db.insert(readingPosts).values({
    id,
    userId,
    kind: input.kind,
    format: input.format,
    title: input.title,
    book: input.book,
    body: text,
    content: JSON.stringify(content),
  });
  await bindMedia(db, id, input.attachments, inline);
  return { id };
}

/** Postni tahrirlash — faqat muallif (moderator boshqaning matnini o'zgartirmaydi, faqat o'chiradi). */
export async function updateCommunityPost(
  db: Database,
  userId: string,
  postId: string,
  input: CreateCommunityPostInput,
): Promise<{ id: string }> {
  await requireSignedIn(db, userId, "Tahrirlash");
  const post = await db.query.readingPosts.findFirst({ where: eq(readingPosts.id, postId) });
  if (!post) throw notFound("Post topilmadi.");
  if (post.userId !== userId) throw forbidden("Faqat o'z postingizni tahrirlaysiz.");
  // Turini (e'lon/oddiy) faqat moderator o'zgartiradi.
  const kind = canModerate(await getUserRole(db, userId)) ? input.kind : post.kind;

  const { content, text, inline } = normalize({ ...input, kind });
  await claimableMedia(db, userId, [...input.attachments, ...inline], postId);
  await db
    .update(readingPosts)
    .set({
      kind,
      format: input.format,
      title: input.title,
      book: input.book,
      body: text,
      content: JSON.stringify(content),
      editedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(readingPosts.id, postId));
  await bindMedia(db, postId, input.attachments, inline);
  return { id: postId };
}

/** Post va unga tegishli hamma narsani (izoh, shikoyat, reaksiya, fayllar) o'chiradi. Ruxsat chaqiruvchida tekshiriladi. */
export async function removePost(db: Database, postId: string): Promise<void> {
  const media = await db.select({ id: postMedia.id, file: postMedia.file }).from(postMedia).where(eq(postMedia.postId, postId));
  await removeMediaFiles(media);
  // D1 da foreign key majburlash o'chirilgan bo'lishi mumkin — bog'liqlarni aniq o'chiramiz.
  await db.delete(postMedia).where(eq(postMedia.postId, postId));
  await db.delete(postReactions).where(eq(postReactions.postId, postId));
  await db.delete(postReplies).where(eq(postReplies.postId, postId));
  await db.delete(postReports).where(eq(postReports.postId, postId));
  await db.delete(readingPosts).where(eq(readingPosts.id, postId));
}

// ── Reaksiyalar ─────────────────────────────────────────────────────

export async function setReaction(db: Database, userId: string, input: ReactInput): Promise<{ reactions: ReactionCount[]; mine: string | null }> {
  await requireSignedIn(db, userId, "Reaksiya bildirish");
  const post = await db.query.readingPosts.findFirst({ where: eq(readingPosts.id, input.postId), columns: { id: true } });
  if (!post) throw notFound("Post topilmadi.");

  if (input.emoji) {
    await db
      .insert(postReactions)
      .values({ postId: input.postId, userId, emoji: input.emoji })
      .onConflictDoUpdate({
        target: [postReactions.postId, postReactions.userId],
        set: { emoji: input.emoji, createdAt: sql`CURRENT_TIMESTAMP` },
      });
  } else {
    await db.delete(postReactions).where(and(eq(postReactions.postId, input.postId), eq(postReactions.userId, userId)));
  }
  const extras = await loadPostExtras(db, [input.postId], userId);
  return { reactions: extras.reactions.get(input.postId) ?? [], mine: extras.mine.get(input.postId) ?? null };
}

// ── Lenta uchun qo'shimcha ma'lumot ─────────────────────────────────

export type PostExtras = {
  media: Map<string, MediaItem[]>;
  attachments: Map<string, string[]>;
  reactions: Map<string, ReactionCount[]>;
  mine: Map<string, string>;
};

export async function loadPostExtras(db: Database, postIds: string[], viewerId: string): Promise<PostExtras> {
  const extras: PostExtras = { media: new Map(), attachments: new Map(), reactions: new Map(), mine: new Map() };
  if (!postIds.length) return extras;

  const [media, counts, mine] = await Promise.all([
    db.select().from(postMedia)
      .where(and(inArray(postMedia.postId, postIds), sql`${postMedia.file} IS NOT NULL`))
      .orderBy(asc(postMedia.role), asc(postMedia.position)),
    db.select({ postId: postReactions.postId, emoji: postReactions.emoji, count: sql<number>`count(*)` })
      .from(postReactions)
      .where(inArray(postReactions.postId, postIds))
      .groupBy(postReactions.postId, postReactions.emoji),
    db.select({ postId: postReactions.postId, emoji: postReactions.emoji })
      .from(postReactions)
      .where(and(inArray(postReactions.postId, postIds), eq(postReactions.userId, viewerId))),
  ]);

  for (const row of media) {
    const postId = row.postId!;
    extras.media.set(postId, [...(extras.media.get(postId) ?? []), toMediaItem(row)]);
    if (row.role === "attachment") extras.attachments.set(postId, [...(extras.attachments.get(postId) ?? []), row.id]);
  }
  for (const row of counts) {
    extras.reactions.set(row.postId, [...(extras.reactions.get(row.postId) ?? []), { emoji: row.emoji, count: row.count }]);
  }
  for (const list of extras.reactions.values()) list.sort((a, b) => b.count - a.count);
  for (const row of mine) extras.mine.set(row.postId, row.emoji);
  return extras;
}

/** Bazadagi JSON ni xavfsiz o'qiydi: buzilgan bo'lsa null (post oddiy matn sifatida ko'rinadi). */
export function parseContent(raw: string | null): Doc | null {
  if (!raw) return null;
  try {
    const parsed = docSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
