/** Audiokitob qismini o'chirish (admin/moderator). */
import { defineRoute } from "@/server/http/handler";
import { deleteTrack } from "@/server/services/books";
import { requireRole } from "@/server/services/roles";
import type { Book } from "@/shared/contract";

export const runtime = "edge";

export const DELETE = defineRoute<undefined, Book>({
  handler: async ({ db, identity, params }) => {
    await requireRole(db, identity.userId, ["admin", "moderator"], "Qismni faqat admin yoki moderator o'chiradi.");
    return deleteTrack(db, params.id, params.tid);
  },
});

export const OPTIONS = DELETE;
