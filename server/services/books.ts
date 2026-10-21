/**
 * Kitoblar katalogi va ularning media fayllari (muqova, audio).
 *
 * Fayllar diskda: BIR_ILM_MEDIA_DIR/books/<kitob-id>/{cover,audio}.<kengaytma>
 * (standart: .sites-runtime/media). Bazada faqat fayl nomi saqlanadi.
 */
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { and, desc, eq, getTableColumns, ne } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { notFound } from "@/server/http/errors";
import { ebookAccessFor, type Book, type BookTrack, type CreateBookInput, type ReorderTracksInput, type UpdateBookInput } from "@/shared/contract";

const { books, bookTracks, bookEbooks } = schema;
type BookRow = typeof books.$inferSelect;
type TrackRow = typeof bookTracks.$inferSelect;
/** E-kitobning yengil ma'lumoti (matnning o'zisiz). */
export type EbookMeta = { bookId: string; chars: number; updatedAt: string };

const ebookMetaColumns = { bookId: bookEbooks.bookId, chars: bookEbooks.chars, updatedAt: bookEbooks.updatedAt };

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

function buildBook(row: BookRow, trackRows: TrackRow[], ebook: EbookMeta | undefined): Book {
  const tracks: BookTrack[] = [...trackRows]
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
    audioLink: row.audioLink,
    tracks,
    kind: row.kind,
    price: row.price,
    category: row.category,
    ebook: ebook ? { access: ebookAccessFor(row.kind), chars: ebook.chars, updatedAt: ebook.updatedAt } : null,
  };
}

function groupByBook<T>(items: T[], bookId: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = bookId(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}

/**
 * Kitoblarni qismlar va e-kitoblar bilan yig'adi. Qismlar/e-kitoblar bir marta guruhlanadi:
 * kitoblar × qismlar tsikli emas, balki O(kitob + qism + e-kitob).
 */
export function toBooks(rows: BookRow[], trackRows: TrackRow[] = [], ebooks: EbookMeta[] = []): Book[] {
  const tracksByBook = groupByBook(trackRows, (t) => t.bookId);
  const ebookByBook = new Map(ebooks.map((e) => [e.bookId, e]));
  return rows.map((row) => buildBook(row, tracksByBook.get(row.id) ?? [], ebookByBook.get(row.id)));
}

export function toBook(row: BookRow, trackRows: TrackRow[] = [], ebooks: EbookMeta[] = []): Book {
  return toBooks([row], trackRows, ebooks)[0];
}

/** `library` — suhbat/kutubxona kitoblari; `store` — do'kon mahsulotlari (alohida ro'yxat). */
export async function listCatalog(db: Database, kind: "library" | "store" = "library"): Promise<Book[]> {
  const rows = await db.select().from(books).where(eq(books.kind, kind)).orderBy(desc(books.active), desc(books.createdAt));
  // Faqat shu turdagi kitoblarning qismlari va e-kitob yozuvlari (boshqa tur yuklanmaydi).
  const tracks = await db
    .select(getTableColumns(bookTracks))
    .from(bookTracks)
    .innerJoin(books, eq(bookTracks.bookId, books.id))
    .where(eq(books.kind, kind));
  const ebooks = await db
    .select(ebookMetaColumns)
    .from(bookEbooks)
    .innerJoin(books, eq(bookEbooks.bookId, books.id))
    .where(eq(books.kind, kind));
  return toBooks(rows, tracks, ebooks);
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
  const ebooks = await db.select(ebookMetaColumns).from(bookEbooks).where(eq(bookEbooks.bookId, id));
  return toBook(row, tracks, ebooks);
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
  const fields = input.kind === "store" ? { ...input, audioLink: "" } : { ...input, price: 0, category: "" };
  await db.insert(books).values({ id, ...fields, createdBy: userId, createdAt: stamp, updatedAt: stamp });
  return getBook(db, id);
}

export async function updateBook(db: Database, id: string, input: UpdateBookInput): Promise<Book> {
  const row = await getBookRow(db, id);
  const store = row.kind === "store";
  const { active, price, category, audioLink, ...common } = input;
  const patch = store ? { ...common, price, category } : { ...common, active, audioLink };
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
