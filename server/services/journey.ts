/**
 * «Bir Ilm yo'li» kitoblar ro'yxati va hafta kitobining muddati.
 *
 * Hafta kitobiga suhbat vaqti belgilanganda (yoki o'zgartirilganda) kitob nomi va shu haftaning shanbasi
 * ro'yxatga yoziladi: tartib raqami «Biz haqimizda» tayanch nuqtasidan hisoblanadi (masalan, 248-kitob).
 * Shu shanba soat 22:00 (Seul) o'tgach hafta kitobi e'londan tushadi — suhbat jonli yoki hali oldinda bo'lsa, qoladi.
 * Hafta tugagach admin o'sha kitobni qayta tanlasa, u yangi suhbat vaqti belgilanguncha e'londa turadi.
 */
import { and, asc, desc, eq, gte, ne, sql } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { schema } from "@/server/db/client";
import type { JourneyBook } from "@/shared/contract";
import { saturdayOnOrAfter, saturdaySessionAt, sessionNumberOf } from "@/shared/journey";
import { getAbout } from "./about";

const { books, journeyBooks, liveSessions } = schema;

const toJourneyBook = (row: typeof journeyBooks.$inferSelect): JourneyBook => ({
  number: row.number,
  discussedOn: row.discussedOn,
  title: row.title,
  author: row.author,
  bookId: row.bookId,
});

export async function listJourneyBooks(db: Database): Promise<JourneyBook[]> {
  const rows = await db.select().from(journeyBooks).orderBy(asc(journeyBooks.number));
  return rows.map(toJourneyBook);
}

const findLibraryBook = (db: Database, title: string) =>
  db.query.books.findFirst({
    where: and(eq(books.kind, "library"), sql`lower(trim(${books.title})) = ${title.trim().toLowerCase()}`),
    columns: { id: true, title: true, author: true },
  });

/**
 * Suhbat vaqtini yo'l ro'yxatiga yozadi. Kutubxonada shu nomli kitob bo'lmasa (masalan, boshqa mavzudagi suhbat)
 * yoki sana yo'l boshlanishidan oldin bo'lsa — hech narsa qilmaydi. Suhbat boshqa haftaga ko'chirilsa,
 * shu kitobning hali o'tmagan eski yozuvi o'chadi.
 */
export async function recordJourneyBook(db: Database, bookTitle: string, scheduledAt: string, now = Date.now()): Promise<void> {
  const at = Date.parse(scheduledAt);
  if (!Number.isFinite(at)) return;
  const book = await findLibraryBook(db, bookTitle);
  if (!book) return;
  const { anchor } = await getAbout(db);
  const discussedOn = saturdayOnOrAfter(at);
  const number = sessionNumberOf(anchor, discussedOn);
  if (number === null || number < 1) return;

  const stamp = new Date(now).toISOString();
  await db
    .insert(journeyBooks)
    .values({ number, discussedOn, title: book.title, author: book.author, bookId: book.id, createdAt: stamp, updatedAt: stamp })
    .onConflictDoUpdate({ target: journeyBooks.number, set: { discussedOn, title: book.title, author: book.author, bookId: book.id, updatedAt: stamp } });
  await db
    .delete(journeyBooks)
    .where(and(eq(journeyBooks.bookId, book.id), ne(journeyBooks.number, number), gte(journeyBooks.discussedOn, saturdayOnOrAfter(now))));
}

/**
 * Hafta kitobi hali e'lon qilinadimi: yo'l ro'yxatidagi shanbasi soat 22:00 (Seul) gacha — ha; undan keyin faqat
 * shu kitob suhbati hozir jonli yoki hali boshlanmagan (masalan, o'sha kuni kechroqqa surilgan) bo'lsa, yoki
 * admin kitobni hafta tugagandan keyin qayta tanlagan bo'lsa (yangi suhbat vaqti belgilanguncha).
 * Suhbat vaqti hali belgilanmagan kitob muddatsiz turadi.
 */
export async function weekBookOnAir(db: Database, bookId: string, now = Date.now()): Promise<boolean> {
  const latest = await db.query.journeyBooks.findFirst({
    where: eq(journeyBooks.bookId, bookId),
    orderBy: desc(journeyBooks.number),
    columns: { discussedOn: true },
  });
  const endsAt = latest ? saturdaySessionAt(latest.discussedOn) : null;
  if (endsAt === null || now < endsAt) return true;
  const book = await db.query.books.findFirst({ where: eq(books.id, bookId), columns: { title: true, activeSince: true } });
  if (!book) return false;
  if (book.activeSince && Date.parse(book.activeSince) >= endsAt) return true;
  const talks = await db.query.liveSessions.findMany({
    where: and(ne(liveSessions.status, "ended"), sql`lower(trim(${liveSessions.bookTitle})) = ${book.title.trim().toLowerCase()}`),
    columns: { status: true, scheduledAt: true },
  });
  return talks.some((talk) => talk.status === "live" || Date.parse(talk.scheduledAt) > now);
}
