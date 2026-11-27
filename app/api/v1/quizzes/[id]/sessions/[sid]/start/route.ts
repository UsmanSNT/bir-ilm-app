/** Rejadagi viktorinani hamma uchun hozir boshlash (vaqtni hozirga ko'chirish). Admin/moderator. */
import { defineRoute } from "@/server/http/handler";
import { startQuizSessionNow, requireQuizManager } from "@/server/services/quizzes";
import type { Quiz } from "@/shared/contract";

export const runtime = "edge";

export const POST = defineRoute<undefined, Quiz>({
  handler: async ({ db, identity, params }) => {
    await requireQuizManager(db, identity.userId, params.id, "Viktorinani faqat admin yoki moderator boshlaydi.");
    return startQuizSessionNow(db, params.id, params.sid);
  },
});

export const OPTIONS = POST;
