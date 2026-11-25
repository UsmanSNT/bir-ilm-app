/** Rejadagi viktorinani hamma uchun hozir boshlash (vaqtni hozirga ko'chirish). Admin/moderator. */
import { defineRoute } from "@/server/http/handler";
import { startQuizSessionNow } from "@/server/services/quizzes";
import { requireRole } from "@/server/services/roles";
import type { Quiz } from "@/shared/contract";

export const runtime = "edge";

export const POST = defineRoute<undefined, Quiz>({
  handler: async ({ db, identity, params }) => {
    await requireRole(db, identity.userId, ["admin", "moderator"], "Viktorinani faqat admin yoki moderator boshlaydi.");
    return startQuizSessionNow(db, params.id, params.sid);
  },
});

export const OPTIONS = POST;
