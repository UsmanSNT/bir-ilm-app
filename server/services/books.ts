/**
 * Kitoblar katalogi va ularning media fayllari (muqova, audio).
 *
 * Fayllar diskda: BIR_ILM_MEDIA_DIR/books/<kitob-id>/{cover,audio}.<kengaytma>
 * (standart: .sites-runtime/media). Bazada faqat fayl nomi saqlanadi.
 */
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { desc, eq, ne } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { notFound } from "@/server/http/errors";
import type { Book, CreateBookInput, UpdateBookInput } from "@/shared/contract";

const { books } = schema;
type BookRow = typeof books.$inferSelect;

export const BOOK_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{2,63}$/;
export const MEDIA_FILE_PATTERN = /^(cover|audio)\.[a-z0-9]{2,5}$/;

export function mediaRoot(): string {
  return path.resolve(process.env.BIR_ILM_MEDIA_DIR?.trim() || ".sites-runtime/media");
}

export function bookDir(bookId: string): string {
  if (!BOOK_ID_PATTERN.test(bookId)) throw notFound("Kitob topilmadi.");
  return path.join(mediaRoot(), "books", bookId);
}

// updatedAt URL'da — fayl almashtirilganda brauzer eski nusxani keshdan olmaydi.
function mediaUrl(row: BookRow, file: string | null): string | null {
  return file ? `/media/books/${row.id}/${file}?v=${encodeURIComponent(row.updatedAt)}` : null;
}

export function toBook(row: BookRow): Book {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    summary: row.summary,
    color: row.color,
    pages: row.pages,
    active: row.active,
    coverUrl: mediaUrl(row, row.coverFile),
    audioUrl: mediaUrl(row, row.audioFile),
    audioSeconds: row.audioSeconds,
    audioBytes: row.audioBytes,
  };
}

export async function listCatalog(db: Database): Promise<Book[]> {
  const rows = await db.select().from(books).orderBy(desc(books.active), desc(books.createdAt));
  return rows.map(toBook);
}

export async function getBookRow(db: Database, id: string): Promise<BookRow> {
  const row = await db.query.books.findFirst({ where: eq(books.id, id) });
  if (!row) throw notFound("Kitob topilmadi.");
  return row;
}

function newBookId(): string {
  return `book_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

const now = () => new Date().toISOString();

export async function createBook(db: Database, userId: string, input: CreateBookInput): Promise<Book> {
  const id = newBookId();
  const stamp = now();
  await db.insert(books).values({ id, ...input, createdBy: userId, createdAt: stamp, updatedAt: stamp });
  return toBook(await getBookRow(db, id));
}

export async function updateBook(db: Database, id: string, input: UpdateBookInput): Promise<Book> {
  await getBookRow(db, id);
  // Haftaning kitobi bitta bo'ladi.
  if (input.active) await db.update(books).set({ active: false }).where(ne(books.id, id));
  await db.update(books).set({ ...input, updatedAt: now() }).where(eq(books.id, id));
  return toBook(await getBookRow(db, id));
}

export async function deleteBook(db: Database, id: string): Promise<void> {
  await getBookRow(db, id);
  await db.delete(books).where(eq(books.id, id));
  await rm(bookDir(id), { recursive: true, force: true });
}

export async function setBookMedia(
  db: Database,
  id: string,
  kind: "cover" | "audio",
  file: string,
  meta: { mime?: string; bytes?: number; seconds?: number } = {},
): Promise<Book> {
  const patch: Partial<BookRow> = { updatedAt: now() };
  if (kind === "cover") patch.coverFile = file;
  else Object.assign(patch, { audioFile: file, audioMime: meta.mime ?? null, audioBytes: meta.bytes ?? 0, audioSeconds: meta.seconds ?? 0 });
  await db.update(books).set(patch).where(eq(books.id, id));
  return toBook(await getBookRow(db, id));
}

export async function ensureBookDir(id: string): Promise<string> {
  const dir = bookDir(id);
  await mkdir(dir, { recursive: true });
  return dir;
}
