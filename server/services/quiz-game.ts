/**
 * Jonli viktorina xonalari: ochiq o'yinlar ro'yxati va natijalarni bazaga yozish.
 *
 * Xona viktorina VAQTI (quiz_sessions) bilan bir xil: xona kodi — o'yin PIN'i. O'yin holati serverning
 * xotirasida turadi (server qayta ishga tushsa, boshlanmagan o'yin yo'qoladi); yakuniy natijalar esa
 * `quiz_results` ga yoziladi, shuning uchun «ishtirokchilar soni» o'yindan keyin ham to'g'ri qoladi.
 */
import { eq } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { badRequest, notFound } from "@/server/http/errors";
import { QUIZ_SESSION_OPENS_BEFORE_MIN, quizSessionStatus } from "@/shared/contract";
import { QuizGame, type Clock, type GameHooks, type GameQuestion, type GameResult } from "./quiz-game-engine";
import { getQuiz } from "./quizzes";

const { quizSessions, quizResults } = schema;

/** Harakatsiz turgan xona shu muddatdan keyin xotiradan olib tashlanadi. */
const IDLE_MS = 3 * 60 * 60_000;

const games = new Map<string, QuizGame>();
const opening = new Map<string, Promise<QuizGame>>();

const newId = (prefix: string) =>
  `${prefix}_${Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("")}`;

/** Server tomonida savol va to'g'ri javoblar (mijozga yuborilmaydi). */
export async function loadQuestions(db: Database, quizId: string): Promise<{ title: string; questions: GameQuestion[] }> {
  const quiz = await getQuiz(db, quizId, false);
  return { title: quiz.title, questions: quiz.questions.map((q) => ({ prompt: q.prompt, choices: q.choices, answer: q.answer })) };
}

function sweep(now = Date.now()) {
  for (const [id, game] of games) {
    if (now - game.lastActivity < IDLE_MS) continue;
    game.dispose();
    games.delete(id);
  }
}

/**
 * Viktorina vaqti uchun xonani qaytaradi (yo'q bo'lsa ochadi). Kirish ochilmagan yoki yopilgan vaqtga
 * yangi xona ochilmaydi; allaqachon boshlangan o'yinga esa vaqt oynasi yopilgandan keyin ham kirish mumkin.
 * `hooks` faqat xona yangi ochilganda ishlatiladi.
 */
export async function openGame(db: Database, sessionId: string, hooks: Omit<GameHooks, "onResults">, clock?: Clock): Promise<QuizGame> {
  sweep();
  const existing = games.get(sessionId);
  if (existing) return existing;
  const pending = opening.get(sessionId);
  if (pending) return pending;

  const promise = (async () => {
    const session = await db.query.quizSessions.findFirst({ where: eq(quizSessions.id, sessionId) });
    if (!session) throw notFound("Viktorina vaqti topilmadi.");
    const status = quizSessionStatus(session.startsAt);
    if (status === "upcoming") throw badRequest(`Hali boshlanmadi. Kirish ${QUIZ_SESSION_OPENS_BEFORE_MIN} daqiqa oldin ochiladi.`);
    if (status === "closed") throw badRequest("Bu viktorinaning vaqti o'tib ketgan.");
    const quiz = await loadQuestions(db, session.quizId);
    const game = new QuizGame(
      { sessionId, quizId: session.quizId, title: quiz.title, code: session.code, total: quiz.questions.length },
      {
        ...hooks,
        onResults: (results, total) => {
          saveResults(db, session.quizId, sessionId, results, total).catch((error) => console.error("[quiz-game] natijani saqlab bo'lmadi", error));
        },
      },
      clock,
    );
    games.set(sessionId, game);
    return game;
  })();
  opening.set(sessionId, promise);
  try {
    return await promise;
  } finally {
    opening.delete(sessionId);
  }
}

export function findGame(sessionId: string): QuizGame | undefined {
  return games.get(sessionId);
}

/** O'yin natijalarini saqlaydi: har bir o'yinchiga bitta qator (mustaqil rejimdagi natija bilan bir xil jadval). */
export async function saveResults(db: Database, quizId: string, sessionId: string, results: GameResult[], total: number): Promise<void> {
  if (!results.length) return;
  const rows = results.map((r) => ({
    id: newId("qr"),
    quizId,
    sessionId,
    userId: r.userId,
    correct: Math.min(r.correct, total),
    total,
    score: r.score,
  }));
  // D1 bitta so'rovda 100 tagacha parametr qabul qiladi: qatorlar bo'laklab yoziladi.
  const CHUNK = 10;
  const statements = [];
  for (let i = 0; i < rows.length; i += CHUNK) statements.push(db.insert(quizResults).values(rows.slice(i, i + CHUNK)));
  await db.batch(statements as [(typeof statements)[number], ...(typeof statements)[number][]]);
}

/** Sinov uchun: xonalarni tozalaydi. */
export function resetGames(): void {
  for (const game of games.values()) game.dispose();
  games.clear();
  opening.clear();
}
