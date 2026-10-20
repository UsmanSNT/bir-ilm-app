/** Foydalanuvchining kitob xatcho‘plari va belgilari. Har bir foydalanuvchi faqat o‘zinikini ko‘radi. */
import { and, asc, count, eq } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { badRequest, notFound } from "@/server/http/errors";
import { EBOOK_MARK_LIMITS, type CreateEbookMarkInput, type EbookMark } from "@/shared/contract";
import { getBookRow } from "./books";
import { ensureUser } from "./social";

const { bookMarks } = schema;
type MarkRow = typeof bookMarks.$inferSelect;

const toMark = (row: MarkRow): EbookMark => ({
  id: row.id,
  kind: row.kind,
  block: row.block,
  start: row.start,
  end: row.end,
  quote: row.quote,
  color: row.color,
  createdAt: row.createdAt,
});

export async function listMarks(db: Database, userId: string, bookId: string): Promise<EbookMark[]> {
  await getBookRow(db, bookId);
  const rows = await db
    .select()
    .from(bookMarks)
    .where(and(eq(bookMarks.userId, userId), eq(bookMarks.bookId, bookId)))
    .orderBy(asc(bookMarks.block), asc(bookMarks.start), asc(bookMarks.createdAt));
  return rows.map(toMark);
}

export async function addMark(db: Database, userId: string, bookId: string, input: CreateEbookMarkInput): Promise<EbookMark> {
  await getBookRow(db, bookId);
  const [{ total }] = await db
    .select({ total: count() })
    .from(bookMarks)
    .where(and(eq(bookMarks.userId, userId), eq(bookMarks.bookId, bookId)));
  if (total >= EBOOK_MARK_LIMITS.perBook) throw badRequest(`Bir kitobda ${EBOOK_MARK_LIMITS.perBook} tadan ortiq belgi qo‘yib bo‘lmaydi.`);

  const row: MarkRow = {
    id: `mark_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
    userId,
    bookId,
    kind: input.kind,
    block: input.block,
    start: input.start,
    end: input.end,
    quote: input.quote,
    color: input.color,
    createdAt: new Date().toISOString(),
  };
  // Mehmon (guest) foydalanuvchi `users` da bo'lmasa ham belgi saqlanishi kerak.
  await ensureUser(db, userId);
  await db.insert(bookMarks).values(row);
  return toMark(row);
}

export async function removeMark(db: Database, userId: string, bookId: string, markId: string): Promise<void> {
  const row = await db.query.bookMarks.findFirst({
    where: and(eq(bookMarks.id, markId), eq(bookMarks.userId, userId), eq(bookMarks.bookId, bookId)),
  });
  if (!row) throw notFound("Belgi topilmadi.");
  await db.delete(bookMarks).where(eq(bookMarks.id, markId));
}
