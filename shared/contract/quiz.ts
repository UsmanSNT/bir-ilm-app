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

export const quizInputSchema = z.object({
  title: z.string().trim().min(1, "Viktorina nomini yozing.").max(QUIZ_LIMITS.title),
  /** Bog'langan kitob (ixtiyoriy). */
  bookId: z.string().trim().min(1).max(96).nullable().default(null),
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
  /** Taxminiy vaqt (daqiqa): savol soniga qarab. */
  minutes: number;
  questions: QuizQuestionInput[];
  /** Jonli o'tkazish vaqtlari (boshlanish bo'yicha tartiblangan). */
  sessions: QuizSession[];
  updatedAt: string;
};

export const quizMinutes = (questionCount: number) => Math.max(1, Math.round(questionCount / 2));
