/** Viktorina vaqtini (va uning kodini) o'chirish. Admin/moderator. */
import { defineRoute } from "@/server/http/handler";
import { removeQuizSession } from "@/server/services/quizzes";
import { requireRole } from "@/server/services/roles";
import type { Quiz } from "@/shared/contract";

export const runtime = "edge";

export const DELETE = defineRoute<undefined, Quiz>({
  handler: async ({ db, identity, params }) => {
    await requireRole(db, identity.userId, ["admin", "moderator"], "Viktorina vaqtini faqat admin yoki moderator o'chiradi.");
    return removeQuizSession(db, params.id, params.sid);
  },
});

export const OPTIONS = DELETE;
