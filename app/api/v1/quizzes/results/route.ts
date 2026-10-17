/** Yechilgan viktorina natijasini saqlash (faqat kirgan foydalanuvchi). */
import { defineRoute } from "@/server/http/handler";
import { recordResult } from "@/server/services/quizzes";
import { requireSignedIn } from "@/server/services/community";
import { quizResultSchema, type QuizResultInput } from "@/shared/contract";

export const runtime = "edge";

export const POST = defineRoute<QuizResultInput, { score: number }>({
  schema: quizResultSchema,
  source: "body",
  status: 201,
  handler: async ({ db, identity, input }) => {
    await requireSignedIn(db, identity.userId, "Natijani saqlash");
    return recordResult(db, identity.userId, input);
  },
});

export const OPTIONS = POST;
