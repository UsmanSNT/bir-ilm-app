/** Viktorinalar: ro'yxat (hamma), yaratish/tahrirlash/o'chirish (admin va moderator). */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { ApiException, badRequest, notFound } from "@/server/http/errors";
import { quizMinutes, quizSessionStatus, type Quiz, type QuizInput, type QuizJoin, type QuizResultInput, type QuizSession } from "@/shared/contract";

const { quizzes, quizQuestions, quizSessions, quizResults, books } = schema;

const newId = (prefix: string) =>
  `${prefix}_${Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("")}`;

function parseChoices(raw: string): string[] {
  try {
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

async function sessionsFor(db: Database, quizIds: string[], staff: boolean): Promise<Map<string, QuizSession[]>> {
  const map = new Map<string, QuizSession[]>();
  if (!quizIds.length) return map;
  const rows = await db.select().from(quizSessions).where(inArray(quizSessions.quizId, quizIds)).orderBy(asc(quizSessions.startsAt));
  const counts = await db
    .select({ sessionId: quizResults.sessionId, n: sql<number>`count(distinct ${quizResults.userId})` })
    .from(quizResults)
    .where(inArray(quizResults.sessionId, rows.map((r) => r.id).length ? rows.map((r) => r.id) : [""]))
    .groupBy(quizResults.sessionId);
  const byId = new Map(counts.map((c) => [c.sessionId, Number(c.n)]));
  for (const r of rows) {
    const list = map.get(r.quizId) ?? [];
    // Kod faqat admin/moderatorga: oddiy foydalanuvchi uni ro'yxatdan ko'ra olmasin.
    list.push({ id: r.id, quizId: r.quizId, startsAt: r.startsAt, code: staff ? r.code : null, participants: byId.get(r.id) ?? 0 });
    map.set(r.quizId, list);
  }
  return map;
}

async function withQuestions(db: Database, rows: Array<typeof quizzes.$inferSelect>, staff = false): Promise<Quiz[]> {
  if (!rows.length) return [];
  const sessions = await sessionsFor(db, rows.map((r) => r.id), staff);
  const questions = await db
    .select()
    .from(quizQuestions)
    .where(inArray(quizQuestions.quizId, rows.map((r) => r.id)))
    .orderBy(asc(quizQuestions.quizId), asc(quizQuestions.position));
  return rows.map((row) => {
    const own = questions
      .filter((q) => q.quizId === row.id)
      .map((q) => ({ prompt: q.prompt, choices: parseChoices(q.choices), answer: q.answer }));
    return { id: row.id, title: row.title, bookId: row.bookId, minutes: quizMinutes(own.length), questions: own, sessions: sessions.get(row.id) ?? [], updatedAt: row.updatedAt };
  });
}

export async function listQuizzes(db: Database, staff = false): Promise<Quiz[]> {
  const rows = await db.select().from(quizzes).orderBy(asc(quizzes.createdAt));
  return withQuestions(db, rows, staff);
}

export async function getQuiz(db: Database, id: string, staff = true): Promise<Quiz> {
  const row = await db.query.quizzes.findFirst({ where: eq(quizzes.id, id) });
  if (!row) throw notFound("Viktorina topilmadi.");
  return (await withQuestions(db, [row], staff))[0];
}

async function checkBook(db: Database, bookId: string | null) {
  if (!bookId) return;
  const book = await db.query.books.findFirst({ where: eq(books.id, bookId), columns: { id: true } });
  if (!book) throw badRequest("Tanlangan kitob topilmadi.");
}

function questionRows(quizId: string, input: QuizInput) {
  return input.questions.map((q, position) => ({
    id: newId("qq"),
    quizId,
    position,
    prompt: q.prompt,
    choices: JSON.stringify(q.choices),
    answer: q.answer,
  }));
}

export async function createQuiz(db: Database, userId: string, input: QuizInput): Promise<Quiz> {
  await checkBook(db, input.bookId);
  const id = newId("qz");
  await db.batch([
    db.insert(quizzes).values({ id, bookId: input.bookId, title: input.title, createdBy: userId }),
    db.insert(quizQuestions).values(questionRows(id, input)),
  ]);
  return getQuiz(db, id);
}

/** Savollar to'liq almashtiriladi (yagona amal): tartib va to'g'ri javoblar har doim formadagidek bo'ladi. */
export async function updateQuiz(db: Database, id: string, input: QuizInput): Promise<Quiz> {
  await getQuiz(db, id);
  await checkBook(db, input.bookId);
  await db.batch([
    db.update(quizzes).set({ bookId: input.bookId, title: input.title, updatedAt: new Date().toISOString() }).where(eq(quizzes.id, id)),
    db.delete(quizQuestions).where(eq(quizQuestions.quizId, id)),
    db.insert(quizQuestions).values(questionRows(id, input)),
  ]);
  return getQuiz(db, id);
}

export async function deleteQuiz(db: Database, id: string): Promise<void> {
  await getQuiz(db, id);
  await db.delete(quizzes).where(eq(quizzes.id, id));
}

// ── Jonli vaqtlar va kirish kodlari ────────────────────────────────

async function freshCode(db: Database): Promise<string> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const n = crypto.getRandomValues(new Uint32Array(1))[0] % 900_000;
    const code = String(100_000 + n);
    if (!(await db.query.quizSessions.findFirst({ where: eq(quizSessions.code, code), columns: { id: true } }))) return code;
  }
  throw new ApiException("internal_error", "Kod yaratib bo'lmadi. Qayta urining.", 500);
}

export async function addQuizSession(db: Database, userId: string, quizId: string, startsAt: string): Promise<Quiz> {
  await getQuiz(db, quizId);
  if (Date.parse(startsAt) < Date.now() - 60_000) throw badRequest("Boshlanish vaqti o'tib ketgan.");
  const code = await freshCode(db);
  await db.insert(quizSessions).values({ id: newId("qs"), quizId, startsAt: new Date(startsAt).toISOString(), code, createdBy: userId });
  return getQuiz(db, quizId);
}

export async function removeQuizSession(db: Database, quizId: string, sessionId: string): Promise<Quiz> {
  const row = await db.query.quizSessions.findFirst({ where: and(eq(quizSessions.id, sessionId), eq(quizSessions.quizId, quizId)) });
  if (!row) throw notFound("Viktorina vaqti topilmadi.");
  await db.delete(quizSessions).where(eq(quizSessions.id, sessionId));
  return getQuiz(db, quizId);
}

/** Kod bo'yicha kirish: qaysi viktorina va vaqt holati (hali ochilmagan / ochiq / tugagan). */
export async function joinByCode(db: Database, code: string): Promise<QuizJoin> {
  const row = await db.query.quizSessions.findFirst({ where: eq(quizSessions.code, code) });
  if (!row) throw notFound("Bunday xona topilmadi.");
  return { quizId: row.quizId, sessionId: row.id, startsAt: row.startsAt, status: quizSessionStatus(row.startsAt) };
}

/** Natijani saqlaydi (faqat kirgan foydalanuvchi). Bir foydalanuvchi bir vaqtda bir necha marta yechsa ham alohida yoziladi. */
export async function recordResult(db: Database, userId: string, input: QuizResultInput): Promise<{ score: number }> {
  const quiz = await db.query.quizzes.findFirst({ where: eq(quizzes.id, input.quizId), columns: { id: true } });
  if (!quiz) throw notFound("Viktorina topilmadi.");
  if (input.sessionId) {
    const session = await db.query.quizSessions.findFirst({ where: and(eq(quizSessions.id, input.sessionId), eq(quizSessions.quizId, input.quizId)), columns: { id: true } });
    if (!session) throw notFound("Viktorina vaqti topilmadi.");
  }
  const score = Math.round((input.correct / input.total) * 100) * 3 + input.correct * 4;
  await db.insert(quizResults).values({ id: newId("qr"), quizId: input.quizId, sessionId: input.sessionId, userId, correct: input.correct, total: input.total, score });
  return { score };
}
