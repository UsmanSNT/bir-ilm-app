/** Viktorinaga yangi jonli vaqt qo'shish (yangi kirish kodi bilan). Admin/moderator. */
import { defineRoute } from "@/server/http/handler";
import { addQuizSession } from "@/server/services/quizzes";
import { requireRole } from "@/server/services/roles";
import { quizSessionInputSchema, type Quiz, type QuizSessionInput } from "@/shared/contract";

export const runtime = "edge";

export const POST = defineRoute<QuizSessionInput, Quiz>({
  schema: quizSessionInputSchema,
  source: "body",
  status: 201,
  handler: async ({ db, identity, input, params }) => {
    await requireRole(db, identity.userId, ["admin", "moderator"], "Viktorina vaqtini faqat admin yoki moderator qo'shadi.");
    return addQuizSession(db, identity.userId, params.id, input.startsAt);
  },
});

export const OPTIONS = POST;
