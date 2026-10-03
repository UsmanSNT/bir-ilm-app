/**
 * Do'kon chati: xaridor ↔ admin yozishmasi (savollar, buyurtmalar, to'lov cheki rasmi).
 *
 * - Har xaridorga bitta yozishma (`store_threads`), xabarlar `store_messages` da.
 * - To'lov ilovada emas: admin hisob raqamni shu yerda yuboradi, xaridor chek rasmini tashlaydi.
 * - Rasmlar diskda: BIR_ILM_MEDIA_DIR/store-chat/<xaridor-id>/<fayl>; faqat egasi va admin ko'radi.
 * - O'qilmaganlar soni har ikki tomon uchun alohida hisoblanadi.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { ApiException, badRequest, notFound } from "@/server/http/errors";
import { mediaRoot } from "./books";
import { requireSignedIn } from "./community";
import type {
  AdminStoreChat,
  PlaceOrderInput,
  StoreChat,
  StoreMessage,
  StoreMessageInput,
  StoreThread,
} from "@/shared/contract";
import { formatPrice, STORE_CHAT_IMAGE_TYPES, STORE_LIMITS } from "@/shared/contract";

const { books, storeMessages, storeThreads, users } = schema;
type MessageRow = typeof storeMessages.$inferSelect;

export const CHAT_USER_PATTERN = /^[A-Za-z0-9_-]{1,96}$/;
export const CHAT_FILE_PATTERN = /^[a-z0-9]{12,40}\.(jpg|png|webp)$/;
const MAX_MESSAGES = 300;
export const IMAGE_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export function chatDir(userId: string): string {
  if (!CHAT_USER_PATTERN.test(userId)) throw notFound("Topilmadi.");
  return path.join(mediaRoot(), "store-chat", userId);
}

function toMessage(row: MessageRow): StoreMessage {
  return {
    id: row.id,
    sender: row.sender,
    kind: row.kind,
    body: row.body,
    orderId: row.orderId,
    bookId: row.bookId,
    bookTitle: row.bookTitle,
    imageUrl: row.imageFile ? `/media/store-chat/${row.userId}/${row.imageFile}` : null,
    createdAt: row.createdAt,
  };
}

function preview(kind: MessageRow["kind"], body: string): string {
  if (kind === "image") return body ? `📷 ${body}`.slice(0, 120) : "📷 Rasm";
  if (kind === "order") return `🛒 ${body.split("\n")[0]}`.slice(0, 120);
  return body.replace(/\s+/g, " ").slice(0, 120);
}

type NewMessage = {
  userId: string;
  sender: "user" | "admin";
  senderId: string;
  kind: MessageRow["kind"];
  body: string;
  orderId?: string | null;
  bookId?: string | null;
  bookTitle?: string | null;
  imageFile?: string | null;
};

/** Xabar + yozishma yangilanishi (o'qilmaganlar soni) — bitta batch uchun. */
function messageStatements(db: Database, message: NewMessage) {
  const stamp = new Date().toISOString();
  const fromUser = message.sender === "user";
  const lastPreview = preview(message.kind, message.body);
  return [
    db.insert(storeMessages).values({
      userId: message.userId,
      sender: message.sender,
      senderId: message.senderId,
      kind: message.kind,
      body: message.body,
      orderId: message.orderId ?? null,
      bookId: message.bookId ?? null,
      bookTitle: message.bookTitle ?? null,
      imageFile: message.imageFile ?? null,
      createdAt: stamp,
    }),
    db
      .insert(storeThreads)
      .values({
        userId: message.userId,
        createdAt: stamp,
        lastMessageAt: stamp,
        lastPreview,
        adminUnread: fromUser ? 1 : 0,
        userUnread: fromUser ? 0 : 1,
      })
      .onConflictDoUpdate({
        target: storeThreads.userId,
        set: fromUser
          ? { lastMessageAt: stamp, lastPreview, adminUnread: sql`${storeThreads.adminUnread} + 1` }
          : { lastMessageAt: stamp, lastPreview, userUnread: sql`${storeThreads.userUnread} + 1` },
      }),
  ] as const;
}

/** Buyurtma xaridorning yozishmasiga tushadi (placeOrder batch'iga qo'shiladi). */
export function orderMessageStatements(
  db: Database,
  userId: string,
  order: PlaceOrderInput & { total: number; lines: { title: string; qty: number; price: number }[] },
) {
  const items = order.lines.map((l) => `• ${l.title} ×${l.qty} — ${formatPrice(l.price * l.qty)}`).join("\n");
  const body = [
    `Buyurtma № ${order.id}`,
    items,
    `Jami: ${formatPrice(order.total)}`,
    `${order.name} · ${order.phone}${order.telegram ? ` · @${order.telegram}` : ""}`,
    order.address,
    ...(order.note ? [`Izoh: ${order.note}`] : []),
    "To‘lov uchun hisob raqamni admin shu chatda yuboradi.",
  ].join("\n");
  return messageStatements(db, { userId, sender: "user", senderId: userId, kind: "order", body, orderId: order.id });
}

// ── Cheklov: spam va tez-tez yuborishdan ────────────────────────────

const sent = new Map<string, number[]>();

function limitSend(userId: string, now = Date.now()): void {
  const recent = (sent.get(userId) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= STORE_LIMITS.chatPerMinute) {
    throw new ApiException("rate_limited", "Xabarlar juda tez yuborilmoqda. Bir daqiqadan keyin yozing.", 429);
  }
  sent.set(userId, [...recent, now]);
  if (sent.size > 5_000) for (const [key, times] of sent) if (!times.some((t) => now - t < 60_000)) sent.delete(key);
}

// ── Xaridor ─────────────────────────────────────────────────────────

async function readMessages(db: Database, userId: string, after: number): Promise<StoreMessage[]> {
  const rows = await db
    .select()
    .from(storeMessages)
    .where(and(eq(storeMessages.userId, userId), gt(storeMessages.id, after)))
    .orderBy(after > 0 ? asc(storeMessages.id) : desc(storeMessages.id))
    .limit(MAX_MESSAGES);
  // Birinchi yuklashda oxirgi MAX_MESSAGES ta, vaqt bo'yicha o'sish tartibida.
  return (after > 0 ? rows : rows.reverse()).map(toMessage);
}

/** Xaridorning yozishmasi. Ochilganda admin javoblari o'qilgan bo'ladi. */
export async function getUserChat(db: Database, userId: string, after = 0): Promise<StoreChat> {
  const messages = await readMessages(db, userId, after);
  const thread = await db.query.storeThreads.findFirst({ where: eq(storeThreads.userId, userId), columns: { userUnread: true } });
  const unread = thread?.userUnread ?? 0;
  if (unread > 0) await db.update(storeThreads).set({ userUnread: 0 }).where(eq(storeThreads.userId, userId));
  return { messages, unread };
}

/** Faqat o'qilmaganlar soni (belgi uchun; xabarlarni o'qilgan qilmaydi). */
export async function userUnreadCount(db: Database, userId: string): Promise<number> {
  const thread = await db.query.storeThreads.findFirst({ where: eq(storeThreads.userId, userId), columns: { userUnread: true } });
  return thread?.userUnread ?? 0;
}

export async function sendUserMessage(db: Database, userId: string, input: StoreMessageInput): Promise<StoreMessage> {
  await requireSignedIn(db, userId, "Admin bilan yozishish");
  limitSend(userId);
  let bookTitle: string | null = null;
  if (input.bookId) {
    const book = await db.query.books.findFirst({ where: eq(books.id, input.bookId), columns: { title: true } });
    if (!book) throw notFound("Kitob topilmadi.");
    bookTitle = book.title;
  }
  return insertMessage(db, { userId, sender: "user", senderId: userId, kind: "text", body: input.body, bookId: input.bookId ?? null, bookTitle });
}

async function insertMessage(db: Database, message: NewMessage): Promise<StoreMessage> {
  const [insert, upsert] = messageStatements(db, message);
  const [row] = await insert.returning();
  await upsert;
  return toMessage(row);
}

// ── Rasm (to'lov cheki, kitob rasmi) ────────────────────────────────

export function hasImageSignature(mime: string, head: Uint8Array): boolean {
  const ascii = (from: number, to: number) => String.fromCharCode(...head.subarray(from, to));
  if (mime === "image/jpeg") return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  if (mime === "image/png") return head[0] === 0x89 && ascii(1, 4) === "PNG";
  if (mime === "image/webp") return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
  return false;
}

/** Rasmni diskka yozadi va xabar yaratadi. `sender` admin bo'lsa, `userId` — xaridor. */
export async function sendImage(
  db: Database,
  actorId: string,
  sender: "user" | "admin",
  userId: string,
  mime: string,
  bytes: Uint8Array,
  caption = "",
): Promise<StoreMessage> {
  if (sender === "user") await requireSignedIn(db, actorId, "Rasm yuborish");
  if (!(STORE_CHAT_IMAGE_TYPES as readonly string[]).includes(mime)) throw badRequest("Faqat JPG, PNG yoki WebP rasm yuboring.");
  if (!bytes.length) throw badRequest("Rasm bo'sh.");
  if (bytes.length > STORE_LIMITS.chatImageBytes) throw new ApiException("bad_request", "Rasm 5 MB dan oshmasin.", 413);
  if (!hasImageSignature(mime, bytes.subarray(0, 16))) throw badRequest("Fayl rasm emas.");
  if (!(await db.query.users.findFirst({ where: eq(users.id, userId), columns: { id: true } }))) throw notFound("Xaridor topilmadi.");
  limitSend(actorId);

  const file = `${Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 20)}.${IMAGE_EXT[mime]}`;
  const dir = chatDir(userId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, file), bytes);
  return insertMessage(db, { userId, sender, senderId: actorId, kind: "image", body: caption.trim().slice(0, STORE_LIMITS.chatBody), imageFile: file });
}

// ── Admin ───────────────────────────────────────────────────────────

export async function listThreads(db: Database): Promise<StoreThread[]> {
  const rows = await db
    .select({
      userId: storeThreads.userId,
      name: users.name,
      lastMessageAt: storeThreads.lastMessageAt,
      lastPreview: storeThreads.lastPreview,
      unread: storeThreads.adminUnread,
    })
    .from(storeThreads)
    .innerJoin(users, eq(users.id, storeThreads.userId))
    .orderBy(desc(storeThreads.lastMessageAt))
    .limit(200);
  return rows;
}

/** Admin yozishmani ochadi: xaridor xabarlari o'qilgan bo'ladi. */
export async function getThreadForAdmin(db: Database, userId: string, after = 0): Promise<AdminStoreChat> {
  const [thread] = await db
    .select({
      userId: storeThreads.userId,
      name: users.name,
      lastMessageAt: storeThreads.lastMessageAt,
      lastPreview: storeThreads.lastPreview,
      unread: storeThreads.adminUnread,
    })
    .from(storeThreads)
    .innerJoin(users, eq(users.id, storeThreads.userId))
    .where(eq(storeThreads.userId, userId));
  if (!thread) throw notFound("Yozishma topilmadi.");
  const messages = await readMessages(db, userId, after);
  if (thread.unread > 0) await db.update(storeThreads).set({ adminUnread: 0 }).where(eq(storeThreads.userId, userId));
  return { thread: { ...thread, unread: 0 }, messages };
}

export async function adminUnreadTotal(db: Database): Promise<number> {
  const [row] = await db.select({ total: sql<number>`coalesce(sum(${storeThreads.adminUnread}), 0)` }).from(storeThreads);
  return Number(row?.total ?? 0);
}

export async function sendAdminMessage(db: Database, adminId: string, userId: string, body: string): Promise<StoreMessage> {
  const thread = await db.query.storeThreads.findFirst({ where: eq(storeThreads.userId, userId), columns: { userId: true } });
  if (!thread) throw notFound("Yozishma topilmadi.");
  limitSend(adminId);
  return insertMessage(db, { userId, sender: "admin", senderId: adminId, kind: "text", body });
}
