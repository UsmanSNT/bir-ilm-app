/**
 * «Bir Ilm yo'li» kitoblar ro'yxati va hafta kitobining muddati.
 *
 * Hafta kitobiga suhbat vaqti belgilanganda (yoki o'zgartirilganda) kitob nomi va shu haftaning shanbasi
 * ro'yxatga yoziladi: tartib raqami «Biz haqimizda» tayanch nuqtasidan hisoblanadi (masalan, 248-kitob).
 * Shanba kuni soat 24:00 (Seul, yakshanba 00:00) o'tgach hafta kitobi e'londan tushadi — suhbat holatidan qat'i nazar.
 * Hafta tugagach admin o'sha kitobni qayta tanlasa, u yangi suhbat vaqti belgilanguncha e'londa turadi.
 */
import { and, asc, desc, eq, gte, isNotNull, ne, sql } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { badRequest, notFound } from "@/server/http/errors";
import type { Book, JourneyBook, JourneyDetailsData, JourneyImportData, JourneySlot, JourneyTitleData } from "@/shared/contract";
import { JOURNEY_LIMITS, journeyNumberInRange, saturdayOnOrAfter, saturdaySessionAt, sessionDateOf, sessionNumberOf, type Anchor } from "@/shared/journey";
import { getAbout } from "./about";
import { createLibraryBookFromJourney, listCatalog } from "./books";

const { books, journeyBooks, journeyHolidays, liveSessions } = schema;

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

/** Hafta tugashi: muhokama shanbasi 13:00 UTC dan 2 soat keyin = yakshanba 00:00 Seul (KST). */
const WEEK_END_AFTER_SESSION_MS = 2 * 3_600_000;

/**
 * Hafta kitobi hali e'londami. Qoida: hafta har shanba 24:00 (Seul) da, ya'ni yakshanba 00:00 da tugaydi —
 * suhbat holatidan (jonli, tugagan, belgilanmagan) qat'i nazar.
 *
 * Muddat yo'l ro'yxatidagi kitob shanbasidan olinadi; ro'yxatda bo'lmasa — kitob tanlangan haftaning shanbasidan.
 * Hafta tugagach kitob faqat admin uni qayta tanlagan bo'lsa (activeSince tugashdan keyin) e'londa qoladi —
 * yangi suhbat sanasi belgilanguncha.
 */
export async function weekBookOnAir(db: Database, bookId: string, now = Date.now()): Promise<boolean> {
  const book = await db.query.books.findFirst({ where: eq(books.id, bookId), columns: { activeSince: true } });
  if (!book) return false;
  const latest = await db.query.journeyBooks.findFirst({
    where: eq(journeyBooks.bookId, bookId),
    orderBy: desc(journeyBooks.number),
    columns: { discussedOn: true },
  });
  const sessionDay = latest?.discussedOn ?? (book.activeSince ? saturdayOnOrAfter(Date.parse(book.activeSince)) : null);
  const session = sessionDay ? saturdaySessionAt(sessionDay) : null;
  if (session === null) return true;
  const endsAt = session + WEEK_END_AFTER_SESSION_MS;
  if (now < endsAt) return true;
  return Boolean(book.activeSince && Date.parse(book.activeSince) >= endsAt);
}

type JourneyRow = typeof journeyBooks.$inferSelect;
type LinkedBook = Pick<Book, "id" | "title" | "author" | "summary" | "coverUrl">;

/** Yacheyka: kitobga bog'langan bo'lsa — nom, muallif, matn va muqova kitobdan (bitta manba). */
const toSlot = (number: number, discussedOn: string, row: JourneyRow | undefined, book: LinkedBook | undefined): JourneySlot => ({
  number,
  discussedOn,
  title: book?.title ?? row?.title ?? "",
  author: book?.author ?? row?.author ?? "",
  summary: (book?.summary || row?.summary) ?? "",
  moderator: row?.moderator ?? "",
  bookId: book?.id ?? null,
  coverUrl: book?.coverUrl ?? null,
});

/**
 * Javon uchun barcha yacheykalar: 1 dan joriy haftagacha (va yozilgan eng katta raqamgacha). Bo'sh haftalar ham
 * ro'yxatda bo'ladi — ularga keyin kitob joylanadi. Qaytarilish tartibi: eng birinchi (1) yuqorida.
 */
export async function listJourneySlots(db: Database, now = Date.now()): Promise<JourneySlot[]> {
  const { anchor } = await getAbout(db);
  const rows = await db.select().from(journeyBooks);
  const catalog = new Map((await listCatalog(db)).map((book) => [book.id, book]));
  const byNumber = new Map(rows.map((row) => [row.number, row]));
  const holidays = await db.select().from(journeyHolidays);
  const current = sessionNumberOf(anchor, saturdayOnOrAfter(now)) ?? 1;
  const last = Math.max(current, ...rows.map((row) => row.number));
  // Javon ma'lumot bor birinchi haftadan boshlanadi: undan oldingi raqamlar (ma'lumoti yo'q) ko'rsatilmaydi.
  const first = rows.length ? Math.min(...rows.map((row) => row.number)) : 1;
  const slots: JourneySlot[] = [];
  for (let number = first; number <= last; number++) {
    // Saqlangan sana (suhbat sanasi) ustun turadi; yo'q bo'lsa — tayanch bo'yicha hisoblanadi.
    const row = byNumber.get(number);
    const discussedOn = row?.discussedOn ?? sessionDateOf(anchor, number);
    if (!discussedOn) continue;
    slots.push(toSlot(number, discussedOn, row, row?.bookId ? catalog.get(row.bookId) : undefined));
  }
  // Dam olish shanbalari raqamsiz, o'z sanasida qo'shiladi.
  for (const holiday of holidays) {
    slots.push({ ...toSlot(0, holiday.discussedOn, undefined, undefined), holiday: true });
  }
  return slots.sort((a, b) => a.discussedOn.localeCompare(b.discussedOn));
}

async function slotOf(db: Database, number: number, discussedOn: string): Promise<JourneySlot> {
  const row = await db.query.journeyBooks.findFirst({ where: eq(journeyBooks.number, number) });
  const book = row?.bookId ? (await listCatalog(db)).find((b) => b.id === row.bookId) : undefined;
  return toSlot(number, discussedOn, row, book);
}

/**
 * Kutubxona kitobini «Bir Ilm yo'li» haftasiga bog'laydi (kitob qo'shish/tahrirlash oynasidagi «Suhbat raqami»).
 * Kitob bitta haftada turadi: boshqa haftalardagi bog'lanishi olib tashlanadi (yozilgan nom qoladi).
 * Hafta boshqa kitobga bog'langan bo'lsa — rad etiladi. `null` — bog'lanishni olib tashlash.
 */
export async function setBookJourneyNumber(db: Database, bookId: string, number: number | null, now = Date.now()): Promise<void> {
  const stamp = new Date(now).toISOString();
  if (number === null) {
    await db.update(journeyBooks).set({ bookId: null, updatedAt: stamp }).where(eq(journeyBooks.bookId, bookId));
    return;
  }
  const { anchor } = await getAbout(db);
  const discussedOn = dateOfNumber(anchor, number);
  const book = await db.query.books.findFirst({ where: eq(books.id, bookId), columns: { title: true, author: true } });
  if (!book) throw notFound("Kitob topilmadi.");
  const existing = await db.query.journeyBooks.findFirst({ where: eq(journeyBooks.number, number) });
  if (existing?.bookId && existing.bookId !== bookId) {
    throw badRequest(`${number}-suhbat boshqa kitobga («${existing.title}») bog‘langan. Avval o‘sha kitobdan raqamni olib tashlang.`);
  }
  await db
    .update(journeyBooks)
    .set({ bookId: null, updatedAt: stamp })
    .where(and(eq(journeyBooks.bookId, bookId), ne(journeyBooks.number, number)));
  await db
    .insert(journeyBooks)
    .values({ number, discussedOn, title: book.title, author: book.author, bookId, createdAt: stamp, updatedAt: stamp })
    .onConflictDoUpdate({ target: journeyBooks.number, set: { title: book.title, author: book.author, bookId, updatedAt: stamp } });
}

/**
 * Yacheykani to'ldiradi yoki yangilaydi. Kitob ma'lumoti bitta joyda — kutubxona kitobida:
 *  - hafta kitobga bog'langan bo'lsa, nom/muallif/matn kitobning o'zida yangilanadi (javonda ham ko'rinadi);
 *  - bog'lanmagan va nomi yozilgan bo'lsa, kutubxonada kitob yaratiladi va haftaga bog'lanadi.
 * Moderator nomi faqat haftaga tegishli.
 */
export async function updateJourneySlot(db: Database, number: number, input: JourneyDetailsData, userId: string, now = Date.now()): Promise<JourneySlot> {
  const { anchor } = await getAbout(db);
  const discussedOn = dateOfNumber(anchor, number);
  const existing = await db.query.journeyBooks.findFirst({ where: eq(journeyBooks.number, number) });
  const stamp = new Date(now).toISOString();
  let bookId = existing?.bookId ?? null;
  if (bookId) {
    await db.update(books).set({ title: input.title || existing?.title || "", author: input.author, summary: input.summary, updatedAt: stamp }).where(eq(books.id, bookId));
  } else if (input.title) {
    bookId = await createLibraryBookFromJourney(db, userId, { title: input.title, author: input.author, summary: input.summary });
  }
  const values = { number, discussedOn, title: input.title, author: input.author, summary: input.summary, moderator: input.moderator, bookId, createdAt: stamp, updatedAt: stamp };
  await db
    .insert(journeyBooks)
    .values(values)
    .onConflictDoUpdate({
      target: journeyBooks.number,
      set: { title: input.title, author: input.author, summary: input.summary, moderator: input.moderator, bookId, updatedAt: stamp },
    });
  return slotOf(db, number, discussedOn);
}
