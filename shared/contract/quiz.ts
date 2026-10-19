/** Viktorinalar: kitob bo'yicha savollar. Admin/moderator boshqaradi, hamma yechadi. */
import { z } from "zod";

export const QUIZ_LIMITS = {
  title: 120,
  prompt: 300,
  choice: 150,
  minChoices: 2,
  maxChoices: 6,
  maxQuestions: 50,
} as const;

/**
 * Ball tizimi — mustaqil va jonli rejimda bir xil:
 *  - noto'g'ri yoki javobsiz savol — 0 ball;
 *  - to'g'ri javob — 500…1000 ball: savol ochilgan zahoti javob bersangiz 1000, vaqt tugashiga yaqin 500;
 *  - ketma-ket to'g'ri javoblar bonusi: ikkinchisidan boshlab har biriga +50, eng ko'pi +250.
 * Umumiy ball — savollar ballarining yig'indisi.
 */
export const QUIZ_POINTS = {
  /** Bitta savolga javob berish vaqti (millisekund). */
  limitMs: 20_000,
  min: 500,
  max: 1000,
  streakStep: 50,
  streakMax: 5,
} as const;

export type QuestionPoints = { base: number; bonus: number; total: number };

/** `streak` — shu javobni qo'shib hisoblaganda ketma-ket to'g'ri javoblar soni (birinchisi uchun 1). */
export function questionPoints(correct: boolean, elapsedMs: number, streak: number, limitMs: number = QUIZ_POINTS.limitMs): QuestionPoints {
  if (!correct) return { base: 0, bonus: 0, total: 0 };
  const ratio = Number.isFinite(elapsedMs) ? Math.min(1, Math.max(0, elapsedMs / limitMs)) : 1;
  const base = Math.round(QUIZ_POINTS.max - (QUIZ_POINTS.max - QUIZ_POINTS.min) * ratio);
  const bonus = Math.min(Math.max(streak - 1, 0), QUIZ_POINTS.streakMax) * QUIZ_POINTS.streakStep;
  return { base, bonus, total: base + bonus };
}

/** `correct` ta to'g'ri javob bilan olish mumkin bo'lgan eng kam va eng ko'p ball. */
export function quizScoreBounds(correct: number): { min: number; max: number } {
  let max = 0;
  for (let k = 1; k <= correct; k++) max += QUIZ_POINTS.max + Math.min(k - 1, QUIZ_POINTS.streakMax) * QUIZ_POINTS.streakStep;
  return { min: correct * QUIZ_POINTS.min, max };
}

const choiceText = z.string().trim().min(1, "Variant matnini yozing.").max(QUIZ_LIMITS.choice, `Variant ${QUIZ_LIMITS.choice} belgidan oshmasin.`);

export const quizQuestionSchema = z
  .object({
    prompt: z.string().trim().min(1, "Savol matnini yozing.").max(QUIZ_LIMITS.prompt, `Savol ${QUIZ_LIMITS.prompt} belgidan oshmasin.`),
    choices: z.array(choiceText).min(QUIZ_LIMITS.minChoices, `Kamida ${QUIZ_LIMITS.minChoices} ta variant kerak.`).max(QUIZ_LIMITS.maxChoices, `${QUIZ_LIMITS.maxChoices} tadan ko'p variant bo'lmasin.`),
    /** To'g'ri variantning tartib raqami (0 dan). */
    answer: z.number().int().min(0),
  })
  .refine((q) => q.answer < q.choices.length, { message: "To'g'ri javobni belgilang.", path: ["answer"] })
  .refine((q) => new Set(q.choices.map((c) => c.toLowerCase())).size === q.choices.length, { message: "Variantlar bir xil bo'lmasin.", path: ["choices"] });

/** Muqova rasmi hajmi (bayt) — server va brauzer bir xil chegarani qo'llaydi. */
export const QUIZ_IMAGE_MAX_BYTES = 6 * 1024 * 1024;
/** Viktorina muqovasi: quiz-media endpoint qaytargan yo'l. */
export const QUIZ_IMAGE_PATTERN = /^\/media\/quiz\/[a-z0-9]{16,32}\.(jpg|png|webp)$/;

export const quizInputSchema = z.object({
  title: z.string().trim().min(1, "Viktorina nomini yozing.").max(QUIZ_LIMITS.title),
  /** Bog'langan kitob (ixtiyoriy). */
  bookId: z.string().trim().min(1).max(96).nullable().default(null),
  /** Muqova rasmi (ixtiyoriy). */
  image: z.string().regex(QUIZ_IMAGE_PATTERN, "Rasm noto‘g‘ri.").nullable().default(null),
  questions: z.array(quizQuestionSchema).min(1, "Kamida bitta savol kerak.").max(QUIZ_LIMITS.maxQuestions, `${QUIZ_LIMITS.maxQuestions} tadan ko'p savol bo'lmasin.`),
});
export type QuizInput = z.infer<typeof quizInputSchema>;
export type QuizQuestionInput = z.infer<typeof quizQuestionSchema>;

/** Jonli viktorina: kirish boshlanishidan necha daqiqa oldin ochiladi va qancha vaqt ochiq qoladi. */
export const QUIZ_SESSION_OPENS_BEFORE_MIN = 10;
export const QUIZ_SESSION_OPEN_FOR_MIN = 180;

export const quizSessionInputSchema = z.object({ startsAt: z.string().datetime({ message: "Sana va vaqtni tanlang." }) });
export type QuizSessionInput = z.infer<typeof quizSessionInputSchema>;

export const joinQuizSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, "Xona kodi 6 ta raqamdan iborat.") });
export type JoinQuizInput = z.infer<typeof joinQuizSchema>;

export const quizResultSchema = z.object({
  quizId: z.string().min(1).max(40),
  sessionId: z.string().min(1).max(40).nullable().default(null),
  correct: z.number().int().min(0).max(QUIZ_LIMITS.maxQuestions),
  total: z.number().int().min(1).max(QUIZ_LIMITS.maxQuestions),
  /** Mustaqil rejimda mijoz hisoblagan ball (server uni imkoniyat oralig'iga keltiradi). Eski ilovalar yubormaydi. */
  score: z.number().int().min(0).max(QUIZ_LIMITS.maxQuestions * (QUIZ_POINTS.max + QUIZ_POINTS.streakStep * QUIZ_POINTS.streakMax)).optional(),
}).refine((r) => r.correct <= r.total, { message: "Natija noto'g'ri.", path: ["correct"] });
export type QuizResultInput = z.infer<typeof quizResultSchema>;

/** Jonli viktorinaning bitta vaqti. `code` faqat admin/moderatorga beriladi. */
export type QuizSession = {
  id: string;
  quizId: string;
  startsAt: string;
  code: string | null;
  participants: number;
};

export type QuizJoin = { quizId: string; sessionId: string; startsAt: string; status: "upcoming" | "open" | "closed" };

/** Vaqt holati: kirish ochilishidan oldin / ochiq / tugagan. */
export function quizSessionStatus(startsAt: string, now = Date.now()): QuizJoin["status"] {
  const start = Date.parse(startsAt);
  if (now < start - QUIZ_SESSION_OPENS_BEFORE_MIN * 60_000) return "upcoming";
  if (now > start + QUIZ_SESSION_OPEN_FOR_MIN * 60_000) return "closed";
  return "open";
}

export type Quiz = {
  id: string;
  title: string;
  bookId: string | null;
  image: string | null;
  /** Taxminiy vaqt (daqiqa): savol soniga qarab. */
  minutes: number;
  questions: QuizQuestionInput[];
  /** Jonli o'tkazish vaqtlari (boshlanish bo'yicha tartiblangan). */
  sessions: QuizSession[];
  updatedAt: string;
};

export const quizMinutes = (questionCount: number) => Math.max(1, Math.round(questionCount / 2));

