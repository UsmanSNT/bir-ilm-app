/**
 * Kitoblar katalogi va ularning media fayllari (muqova, audio).
 *
 * Fayllar diskda: BIR_ILM_MEDIA_DIR/books/<kitob-id>/{cover,audio}.<kengaytma>
 * (standart: .sites-runtime/media). Bazada faqat fayl nomi saqlanadi.
 */
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { and, desc, eq, ne } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { notFound } from "@/server/http/errors";
import type { Book, BookTrack, CreateBookInput, ReorderTracksInput, UpdateBookInput } from "@/shared/contract";

const { books, bookTracks } = schema;
type BookRow = typeof books.$inferSelect;
type TrackRow = typeof bookTracks.$inferSelect;

export const BOOK_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{2,63}$/;
export const MEDIA_FILE_PATTERN = /^(cover|audio|track-[a-z0-9]{8,32})\.[a-z0-9]{2,5}$/;

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

export function toBook(row: BookRow, trackRows: TrackRow[] = []): Book {
  const tracks: BookTrack[] = trackRows
    .filter((t) => t.bookId === row.id)
    .sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt))
    .map((t) => ({
      id: t.id,
      title: t.title,
      url: `/media/books/${row.id}/${t.file}?v=${encodeURIComponent(row.updatedAt)}`,
      seconds: t.seconds,
      bytes: t.bytes,
    }));
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    summary: row.summary,
    color: row.color,
    pages: row.pages,
    active: row.active,
    coverUrl: mediaUrl(row, row.coverFile),
    audioUrl: tracks[0]?.url ?? null,
    audioSeconds: tracks.reduce((sum, t) => sum + t.seconds, 0),
    audioBytes: tracks.reduce((sum, t) => sum + t.bytes, 0),
    tracks,
    kind: row.kind,
    price: row.price,
    category: row.category,
  };
}

/** `library` — suhbat/kutubxona kitoblari; `store` — do'kon mahsulotlari (alohida ro'yxat). */
export async function listCatalog(db: Database, kind: "library" | "store" = "library"): Promise<Book[]> {
  const rows = await db.select().from(books).where(eq(books.kind, kind)).orderBy(desc(books.active), desc(books.createdAt));
  const tracks = await db.select().from(bookTracks);
  return rows.map((row) => toBook(row, tracks));
}

export async function getBookRow(db: Database, id: string): Promise<BookRow> {
  const row = await db.query.books.findFirst({ where: eq(books.id, id) });
  if (!row) throw notFound("Kitob topilmadi.");
  return row;
}

/** Kitob qismlari bilan. */
export async function getBook(db: Database, id: string): Promise<Book> {
  const row = await getBookRow(db, id);
  const tracks = await db.select().from(bookTracks).where(eq(bookTracks.bookId, id));
  return toBook(row, tracks);
}

// ── Audiokitob qismlari ─────────────────────────────────────────────

export async function trackUsage(db: Database, bookId: string): Promise<{ count: number; bytes: number }> {
  const rows = await db.select({ bytes: bookTracks.bytes }).from(bookTracks).where(eq(bookTracks.bookId, bookId));
  return { count: rows.length, bytes: rows.reduce((sum, r) => sum + r.bytes, 0) };
}

/** Yangi qism oxiriga qo'shiladi. `file` — kitob papkasidagi tayyor fayl nomi. */
export async function addTrack(
  db: Database,
  bookId: string,
  track: { id: string; file: string; mime: string; bytes: number; seconds: number; title: string },
): Promise<Book> {
  const last = await db
    .select({ position: bookTracks.position })
    .from(bookTracks)
    .where(eq(bookTracks.bookId, bookId))
    .orderBy(desc(bookTracks.position))
    .limit(1);
  await db.insert(bookTracks).values({ ...track, bookId, position: (last[0]?.position ?? -1) + 1 });
  await db.update(books).set({ updatedAt: now() }).where(eq(books.id, bookId));
  return getBook(db, bookId);
}

export async function deleteTrack(db: Database, bookId: string, trackId: string): Promise<Book> {
  const row = await db.query.bookTracks.findFirst({ where: and(eq(bookTracks.id, trackId), eq(bookTracks.bookId, bookId)) });
  if (!row) throw notFound("Qism topilmadi.");
  await db.delete(bookTracks).where(eq(bookTracks.id, trackId));
  await rm(path.join(bookDir(bookId), row.file), { force: true });
  await db.update(books).set({ updatedAt: now() }).where(eq(books.id, bookId));
  return getBook(db, bookId);
}

/** Ro'yxatdagi tartib — ijro tartibi; nomlar ham shu yerda yangilanadi. */
export async function reorderTracks(db: Database, bookId: string, order: ReorderTracksInput["tracks"]): Promise<Book> {
  await getBookRow(db, bookId);
  const existing = await db.select({ id: bookTracks.id }).from(bookTracks).where(eq(bookTracks.bookId, bookId));
  const known = new Set(existing.map((t) => t.id));
  let position = 0;
  for (const item of order) {
    if (!known.has(item.id)) continue;
    await db.update(bookTracks).set({ position: position++, title: item.title }).where(eq(bookTracks.id, item.id));
  }
  await db.update(books).set({ updatedAt: now() }).where(eq(books.id, bookId));
  return getBook(db, bookId);
}

function newBookId(): string {
  return `book_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

const now = () => new Date().toISOString();

export async function createBook(db: Database, userId: string, input: CreateBookInput): Promise<Book> {
  const id = newBookId();
  const stamp = now();
  // Ikki ro'yxat aralashmaydi: kutubxona kitobida narx/janr yo'q, do'kon mahsuloti haftaning kitobi bo'lmaydi.
  const fields = input.kind === "store" ? input : { ...input, price: 0, category: "" };
  await db.insert(books).values({ id, ...fields, createdBy: userId, createdAt: stamp, updatedAt: stamp });
  return getBook(db, id);
}

export async function updateBook(db: Database, id: string, input: UpdateBookInput): Promise<Book> {
  const row = await getBookRow(db, id);
  const store = row.kind === "store";
  const { active, price, category, ...common } = input;
  const patch = store ? { ...common, price, category } : { ...common, active };
  // Haftaning kitobi bitta bo'ladi (faqat kutubxona kitoblari orasida).
  if (!store && active) await db.update(books).set({ active: false }).where(and(ne(books.id, id), eq(books.kind, "library")));
  await db.update(books).set({ ...patch, updatedAt: now() }).where(eq(books.id, id));
  return getBook(db, id);
}

export async function deleteBook(db: Database, id: string): Promise<void> {
  await getBookRow(db, id);
  await db.delete(books).where(eq(books.id, id));
  await rm(bookDir(id), { recursive: true, force: true });
}

/** Muqova. Audio qismlari `addTrack` orqali qo'shiladi. */
export async function setBookCover(db: Database, id: string, file: string): Promise<Book> {
  await db.update(books).set({ coverFile: file, updatedAt: now() }).where(eq(books.id, id));
  return getBook(db, id);
}

export async function ensureBookDir(id: string): Promise<string> {
  const dir = bookDir(id);
  await mkdir(dir, { recursive: true });
  return dir;
}
