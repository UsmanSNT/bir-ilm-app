/**
 * Kutubxona domen mantiqi: kitoblar, izohlar, o'qish jarayoni va reyting.
 *
 * Kitoblar katalogi BAZADAN o'qiladi. Bu mobil uchun muhim: App Store va
 * Play Store yangilanishini kutmasdan katalogni o'zgartirish mumkin.
 * Baza bo'sh bo'lsa, ilovadagi boshlang'ich (seed) katalog qaytariladi.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { activeBookId as seedActiveBookId, books as seedBooks } from "@/app/app-data";
import type {
  Book,
  BookComment,
  CreateCommentInput,
  LeaderboardEntry,
  ReadingProgress,
  UpdateProgressInput,
} from "@/shared/contract";
import { ensureUser } from "./social";

const { books, comments, readingProgress, userActivity, users } = schema;

/** Baza bo'sh bo'lganda ishlatiladigan zaxira katalog. */
function fallbackCatalog(): Book[] {
  return seedBooks.map((book) => ({
    ...book,
    active: book.id === seedActiveBookId,
  }));
}

export async function listBooks(db: Database): Promise<Book[]> {
  const rows = await db
    .select({
      id: books.id,
      title: books.title,
      author: books.author,
      summary: books.summary,
      color: books.color,
      pages: books.pages,
      active: books.active,
    })
    .from(books)
    .orderBy(desc(books.active), books.createdAt);

  return rows.length ? rows : fallbackCatalog();
}

/** Shu haftaning kitobi. */
export async function getActiveBook(db: Database): Promise<Book> {
  const catalog = await listBooks(db);
  return catalog.find((book) => book.active) ?? catalog[0];
}

/**
 * Boshlang'ich katalogni bazaga yozadi. Takroriy chaqirilsa mavjud
 * yozuvlarni buzmaydi, shuning uchun joylashtirishda xavfsiz.
 */
export async function seedCatalog(db: Database): Promise<{ inserted: number }> {
  const catalog = fallbackCatalog();

  for (const book of catalog) {
    await db
      .insert(books)
      .values({
        id: book.id,
        title: book.title,
        author: book.author,
        summary: book.summary,
        color: book.color,
        pages: book.pages,
        active: book.active,
      })
      .onConflictDoNothing();
  }

  return { inserted: catalog.length };
}

export async function listComments(
  db: Database,
  bookId: string,
  limit = 60,
): Promise<BookComment[]> {
  const rows = await db
    .select({
      id: comments.id,
      bookId: comments.bookId,
      userId: comments.userId,
      name: comments.userName,
      body: comments.body,
      demo: comments.demo,
      createdAt: comments.createdAt,
    })
    .from(comments)
    .where(eq(comments.bookId, bookId))
    .orderBy(desc(comments.createdAt), desc(comments.id))
    .limit(limit);

  // Eng eskisi birinchi — suhbat tabiiy tartibda o'qilsin.
  return rows.reverse();
}

export async function createComment(
  db: Database,
  userId: string,
  name: string,
  input: CreateCommentInput,
): Promise<BookComment> {
  await ensureUser(db, userId, name);

  const [created] = await db
    .insert(comments)
    .values({
      bookId: input.bookId,
      userId,
      userName: name,
      body: input.body,
      demo: false,
    })
    .returning();

  await touchActivity(db, userId, name);

  return {
    id: created.id,
    bookId: created.bookId,
    userId: created.userId,
    name: created.userName,
    body: created.body,
    demo: created.demo,
    createdAt: created.createdAt,
  };
}

export async function getProgress(
  db: Database,
  userId: string,
  bookId: string,
): Promise<ReadingProgress | null> {
  const rows = await db
    .select({
      bookId: readingProgress.bookId,
      page: readingProgress.page,
      total: readingProgress.total,
      updatedAt: readingProgress.updatedAt,
    })
    .from(readingProgress)
    .where(and(eq(readingProgress.userId, userId), eq(readingProgress.bookId, bookId)))
    .limit(1);

  return rows[0] ?? null;
}

export async function listProgress(db: Database, userId: string): Promise<ReadingProgress[]> {
  return db
    .select({
      bookId: readingProgress.bookId,
      page: readingProgress.page,
      total: readingProgress.total,
      updatedAt: readingProgress.updatedAt,
    })
    .from(readingProgress)
    .where(eq(readingProgress.userId, userId));
}

export async function updateProgress(
  db: Database,
  userId: string,
  name: string,
  input: UpdateProgressInput,
): Promise<ReadingProgress> {
  await ensureUser(db, userId, name);

  // Sahifa jami sahifadan oshib ketmasin.
  const page = Math.min(input.page, input.total);

  await db
    .insert(readingProgress)
    .values({ userId, bookId: input.bookId, page, total: input.total })
    .onConflictDoUpdate({
      target: [readingProgress.userId, readingProgress.bookId],
      set: { page, total: input.total, updatedAt: sql`CURRENT_TIMESTAMP` },
    });

  await touchActivity(db, userId, name);

  const saved = await getProgress(db, userId, input.bookId);
  return saved ?? { bookId: input.bookId, page, total: input.total, updatedAt: todayKey() };
}

export async function getLeaderboard(db: Database, limit = 20): Promise<LeaderboardEntry[]> {
  return db
    .select({
      id: userActivity.userId,
      name: userActivity.displayName,
      pages: userActivity.pagesRead,
      books: userActivity.booksFinished,
      comments: userActivity.commentsCount,
      streak: userActivity.streak,
      score: userActivity.score,
    })
    .from(userActivity)
    .orderBy(desc(userActivity.score), desc(userActivity.streak), desc(userActivity.pagesRead))
    .limit(limit);
}

/**
 * Faollikni SERVERDA qayta hisoblaydi.
 *
 * Eski `/api/app-state` bu raqamlarni mijozdan qabul qilardi — ya'ni har kim
 * o'z ballini o'zi yozib, reytingni buzishi mumkin edi. Bu yerda barcha
 * ko'rsatkich bazadagi haqiqiy yozuvlardan olinadi.
 */
export async function touchActivity(
  db: Database,
  userId: string,
  name: string,
): Promise<LeaderboardEntry> {
  const today = todayKey();

  const [totals] = await db
    .select({
      pages: sql<number>`coalesce(sum(${readingProgress.page}), 0)`,
      finished: sql<number>`coalesce(sum(case when ${readingProgress.page} >= ${readingProgress.total} then 1 else 0 end), 0)`,
    })
    .from(readingProgress)
    .where(eq(readingProgress.userId, userId));

  const [commentTotals] = await db
    .select({ total: sql<number>`count(*)` })
    .from(comments)
    .where(eq(comments.userId, userId));

  const [previous] = await db
    .select({
      streak: userActivity.streak,
      activeDays: userActivity.activeDays,
      lastActiveDate: userActivity.lastActiveDate,
    })
    .from(userActivity)
    .where(eq(userActivity.userId, userId))
    .limit(1);

  const { streak, activeDays } = advanceStreak(previous, today);

  const pages = totals?.pages ?? 0;
  const booksFinished = totals?.finished ?? 0;
  const commentsCount = commentTotals?.total ?? 0;
  const score = computeScore({ pages, booksFinished, commentsCount, streak });

  await db
    .insert(userActivity)
    .values({
      userId,
      displayName: name,
      score,
      streak,
      activeDays,
      commentsCount,
      booksFinished,
      pagesRead: pages,
      lastActiveDate: today,
    })
    .onConflictDoUpdate({
      target: userActivity.userId,
      set: {
        displayName: name,
        score,
        streak,
        activeDays,
        commentsCount,
        booksFinished,
        pagesRead: pages,
        lastActiveDate: today,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      },
    });

  return {
    id: userId,
    name,
    pages,
    books: booksFinished,
    comments: commentsCount,
    streak,
    score,
  };
}

type StreakState = { streak: number; activeDays: number; lastActiveDate: string | null };

/**
 * Ketma-ket kunlar zanjiri. Bugun allaqachon hisoblangan bo'lsa o'zgarmaydi,
 * kecha bo'lsa +1, aks holda noldan boshlanadi.
 */
export function advanceStreak(
  previous: StreakState | undefined,
  today: string,
): { streak: number; activeDays: number } {
  if (!previous?.lastActiveDate) return { streak: 1, activeDays: 1 };
  if (previous.lastActiveDate === today) {
    return { streak: Math.max(previous.streak, 1), activeDays: Math.max(previous.activeDays, 1) };
  }

  const wasYesterday = previous.lastActiveDate === shiftDay(today, -1);
  return {
    streak: wasYesterday ? previous.streak + 1 : 1,
    activeDays: previous.activeDays + 1,
  };
}

/** Ball formulasi bitta joyda — barcha platformada bir xil. */
export function computeScore(input: {
  pages: number;
  booksFinished: number;
  commentsCount: number;
  streak: number;
}): number {
  return (
    input.pages +
    input.booksFinished * 100 +
    input.commentsCount * 10 +
    input.streak * 25
  );
}

export function todayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function shiftDay(key: string, days: number): string {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return todayKey(date);
}

/** Profil uchun foydalanuvchi nomi. */
export async function resolveName(db: Database, userId: string): Promise<string> {
  const rows = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return rows[0]?.name ?? "Kitobxon";
}
