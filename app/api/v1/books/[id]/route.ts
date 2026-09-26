/** Kitobni tahrirlash, "haftaning kitobi" qilish va o'chirish — admin va moderator. */
import { defineRoute } from "@/server/http/handler";
import { deleteBook, updateBook } from "@/server/services/books";
import { requireRole } from "@/server/services/roles";
import { updateBookSchema, type Book, type Empty, type UpdateBookInput } from "@/shared/contract";

export const runtime = "edge";

const EDITORS = ["admin", "moderator"] as const;

export const PATCH = defineRoute<UpdateBookInput, Book>({
  schema: updateBookSchema,
  source: "body",
  handler: async ({ db, identity, input, params }) => {
    await requireRole(db, identity.userId, EDITORS, "Kitobni faqat admin yoki moderator tahrirlaydi.");
    return updateBook(db, params.id, input);
  },
});

export const DELETE = defineRoute<undefined, Empty>({
  handler: async ({ db, identity, params }) => {
    await requireRole(db, identity.userId, EDITORS, "Kitobni faqat admin yoki moderator o'chiradi.");
    await deleteBook(db, params.id);
    return {} as Empty;
  },
});

export const OPTIONS = PATCH;
