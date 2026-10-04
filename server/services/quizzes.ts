/** Viktorinalar: ro'yxat (hamma), yaratish/tahrirlash/o'chirish (admin va moderator). */
import { asc, eq, inArray } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { badRequest, notFound } from "@/server/http/errors";
import { quizMinutes, type Quiz, type QuizInput } from "@/shared/contract";

const { quizzes, quizQuestions, books } = schema;

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

async function withQuestions(db: Database, rows: Array<typeof quizzes.$inferSelect>): Promise<Quiz[]> {
  if (!rows.length) return [];
  const questions = await db
    .select()
    .from(quizQuestions)
    .where(inArray(quizQuestions.quizId, rows.map((r) => r.id)))
    .orderBy(asc(quizQuestions.quizId), asc(quizQuestions.position));
  return rows.map((row) => {
    const own = questions
      .filter((q) => q.quizId === row.id)
      .map((q) => ({ prompt: q.prompt, choices: parseChoices(q.choices), answer: q.answer }));
    return { id: row.id, title: row.title, bookId: row.bookId, minutes: quizMinutes(own.length), questions: own, updatedAt: row.updatedAt };
  });
}

export async function listQuizzes(db: Database): Promise<Quiz[]> {
  const rows = await db.select().from(quizzes).orderBy(asc(quizzes.createdAt));
  return withQuestions(db, rows);
}

export async function getQuiz(db: Database, id: string): Promise<Quiz> {
  const row = await db.query.quizzes.findFirst({ where: eq(quizzes.id, id) });
  if (!row) throw notFound("Viktorina topilmadi.");
  return (await withQuestions(db, [row]))[0];
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
