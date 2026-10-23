/** Viktorinalar ro'yxati (hamma ko'radi; kirish kodlari faqat admin/moderatorga) va yangisini yaratish. */
import { defineRoute } from "@/server/http/handler";
import { createQuiz, listQuizzes } from "@/server/services/quizzes";
import { getUserRole, requireRole } from "@/server/services/roles";
import { canModerate } from "@/shared/contract/roles";
import { quizInputSchema, type Quiz, type QuizInput } from "@/shared/contract";

export const runtime = "edge";

export const GET = defineRoute<undefined, { items: Quiz[] }>({
  handler: async ({ db, identity }) => ({ items: await listQuizzes(db, canModerate(await getUserRole(db, identity.userId))) }),
});

export const POST = defineRoute<QuizInput, Quiz>({
  schema: quizInputSchema,
  source: "body",
  status: 201,
  handler: async ({ db, identity, input }) => {
    await requireRole(db, identity.userId, ["admin", "moderator"], "Viktorinani faqat admin yoki moderator yaratadi.");
    return createQuiz(db, identity.userId, input);
  },
});

export const OPTIONS = POST;
