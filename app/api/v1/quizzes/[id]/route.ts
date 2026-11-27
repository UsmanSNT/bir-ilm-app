/** Viktorinani tahrirlash va o'chirish (admin/moderator). */
import { defineRoute } from "@/server/http/handler";
import { deleteQuiz, updateQuiz, requireQuizManager } from "@/server/services/quizzes";
import { quizInputSchema, type Empty, type Quiz, type QuizInput } from "@/shared/contract";

export const runtime = "edge";

export const PUT = defineRoute<QuizInput, Quiz>({
  schema: quizInputSchema,
  source: "body",
  handler: async ({ db, identity, input, params }) => {
    await requireQuizManager(db, identity.userId, params.id, "Viktorinani faqat admin yoki moderator tahrirlaydi.");
    return updateQuiz(db, params.id, input);
  },
});

export const DELETE = defineRoute<undefined, Empty>({
  handler: async ({ db, identity, params }) => {
    await requireQuizManager(db, identity.userId, params.id, "Viktorinani faqat admin yoki moderator o'chiradi.");
    await deleteQuiz(db, params.id);
    return {} as Empty;
  },
});

export const OPTIONS = PUT;
