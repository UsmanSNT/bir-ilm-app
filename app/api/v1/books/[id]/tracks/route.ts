/** Audiokitob qismlarining tartibi va nomlari (admin/moderator). */
import { defineRoute } from "@/server/http/handler";
import { reorderTracks } from "@/server/services/books";
import { requireRole } from "@/server/services/roles";
import { reorderTracksSchema, type Book, type ReorderTracksInput } from "@/shared/contract";

export const runtime = "edge";

export const PUT = defineRoute<ReorderTracksInput, Book>({
  schema: reorderTracksSchema,
  source: "body",
  handler: async ({ db, identity, input, params }) => {
    await requireRole(db, identity.userId, ["admin", "moderator"], "Qismlarni faqat admin yoki moderator o'zgartiradi.");
    return reorderTracks(db, params.id, input.tracks);
  },
});

export const OPTIONS = PUT;
