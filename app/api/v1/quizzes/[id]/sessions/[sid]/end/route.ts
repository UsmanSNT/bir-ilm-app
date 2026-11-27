/** Jonli viktorina sessiyasini to'xtatish: yangi kirish darhol yopiladi. Admin/moderator. */
import { defineRoute } from "@/server/http/handler";
import { endQuizSession } from "@/server/services/quizzes";
import { requireRole } from "@/server/services/roles";
import type { Quiz } from "@/shared/contract";

export const runtime = "edge";

export const POST = defineRoute<undefined, Quiz>({
  handler: async ({ db, identity, params }) => {
    await requireRole(db, identity.userId, ["admin", "moderator"], "Jonli viktorinani faqat admin yoki moderator to'xtatadi.");
    return endQuizSession(db, params.id, params.sid);
  },
});

export const OPTIONS = POST;
