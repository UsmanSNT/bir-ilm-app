/**
 * «Bir Ilm yo'li» kitoblar ro'yxati va hafta kitobining muddati.
 *
 * Hafta kitobiga suhbat vaqti belgilanganda (yoki o'zgartirilganda) kitob nomi va shu haftaning shanbasi
 * ro'yxatga yoziladi: tartib raqami «Biz haqimizda» tayanch nuqtasidan hisoblanadi (masalan, 248-kitob).
 * Shu shanba soat 22:00 (Seul) o'tgach hafta kitobi e'londan tushadi — suhbat jonli yoki hali oldinda bo'lsa, qoladi.
 * Hafta tugagach admin o'sha kitobni qayta tanlasa, u yangi suhbat vaqti belgilanguncha e'londa turadi.
 */
import { and, asc, desc, eq, gte, isNotNull, ne, sql } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { badRequest, notFound } from "@/server/http/errors";
import type { JourneyBook, JourneyImportData, JourneyTitleData } from "@/shared/contract";
import { JOURNEY_LIMITS, journeyNumberInRange, saturdayOnOrAfter, saturdaySessionAt, sessionDateOf, sessionNumberOf, type Anchor } from "@/shared/journey";
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

const LINKED_NOTE = "Bu hafta kutubxonadagi kitob suhbatiga bog‘langan — nomi kitob oynasidan o‘zgaradi.";

/** Raqamning shanba sanasi; oraliqdan tashqari raqam — 400. */
function dateOfNumber(anchor: Anchor, number: number): string {
  const date = journeyNumberInRange(anchor, number) ? sessionDateOf(anchor, number) : null;
  if (!date) throw badRequest(`${number}-kitob yo‘q: raqam 1 dan ${anchor.number + JOURNEY_LIMITS.weeksAhead} gacha bo‘lsin.`);
  return date;
}

const manualRow = (number: number, discussedOn: string, { title, author }: JourneyTitleData, stamp: string) => ({
  values: { number, discussedOn, title, author, bookId: null, createdAt: stamp, updatedAt: stamp },
  set: { discussedOn, title, author, updatedAt: stamp },
});

/**
 * Admin o'tgan (yoki rejadagi) haftaning kitob nomini qo'lda yozadi. Suhbat jadvalidagi kutubxona kitobiga
 * bog'langan hafta o'zgarmaydi: uning nomi kitobning o'zidan keladi.
 */
export async function setJourneyTitle(db: Database, number: number, input: JourneyTitleData, now = Date.now()): Promise<JourneyBook[]> {
  const { anchor } = await getAbout(db);
  const date = dateOfNumber(anchor, number);
  const existing = await db.query.journeyBooks.findFirst({ where: eq(journeyBooks.number, number), columns: { bookId: true } });
  if (existing?.bookId) throw badRequest(LINKED_NOTE);
  const row = manualRow(number, date, input, new Date(now).toISOString());
  await db.insert(journeyBooks).values(row.values).onConflictDoUpdate({ target: journeyBooks.number, set: row.set });
  return listJourneyBooks(db);
}

export async function removeJourneyTitle(db: Database, number: number): Promise<JourneyBook[]> {
  const existing = await db.query.journeyBooks.findFirst({ where: eq(journeyBooks.number, number), columns: { bookId: true } });
  if (!existing) throw notFound("Bu haftaning kitob nomi yozilmagan.");
  if (existing.bookId) throw badRequest(LINKED_NOTE);
  await db.delete(journeyBooks).where(eq(journeyBooks.number, number));
  return listJourneyBooks(db);
}

/**
 * Ro'yxatni bir yo'la saqlaydi (bir raqam takrorlansa, oxirgisi). Raqamlardan biri oraliqdan tashqarida bo'lsa —
 * hech narsa yozilmaydi. Suhbat jadvaliga bog'langan haftalar o'tkazib yuboriladi (`skipped`).
 */
export async function importJourneyTitles(db: Database, { items }: JourneyImportData, now = Date.now()): Promise<{ items: JourneyBook[]; saved: number; skipped: number[] }> {
  const { anchor } = await getAbout(db);
  const rows = [...new Map(items.map((item) => [item.number, item])).values()].sort((a, b) => a.number - b.number);
  const dates = new Map(rows.map((row) => [row.number, dateOfNumber(anchor, row.number)]));
  const linked = new Set((await db.select({ number: journeyBooks.number }).from(journeyBooks).where(isNotNull(journeyBooks.bookId))).map((row) => row.number));
  const stamp = new Date(now).toISOString();
  const statements = rows
    .filter((row) => !linked.has(row.number))
    .map((row) => {
      const { values, set } = manualRow(row.number, dates.get(row.number)!, row, stamp);
      return db.insert(journeyBooks).values(values).onConflictDoUpdate({ target: journeyBooks.number, set });
    });
  // Bitta partiya — hammasi yoki hech narsa.
  if (statements.length) await db.batch(statements as [(typeof statements)[number], ...(typeof statements)[number][]]);
  return { items: await listJourneyBooks(db), saved: statements.length, skipped: rows.filter((row) => linked.has(row.number)).map((row) => row.number) };
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
