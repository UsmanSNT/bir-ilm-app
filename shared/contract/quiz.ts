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

export type Quiz = {
  id: string;
  title: string;
  bookId: string | null;
  /** Taxminiy vaqt (daqiqa): savol soniga qarab. */
  minutes: number;
  questions: QuizQuestionInput[];
  updatedAt: string;
};

export const quizMinutes = (questionCount: number) => Math.max(1, Math.round(questionCount / 2));
