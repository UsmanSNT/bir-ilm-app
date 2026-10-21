/**
 * Elektron kitob matni.
 *   GET    — o'qish (hamma; do'kon kitobida oddiy foydalanuvchiga faqat boshlang'ich qismi)
 *   PUT    — matnni saqlash yoki almashtirish (admin, moderator)
 *   DELETE — olib tashlash (admin, moderator)
 */
import { defineRoute } from "@/server/http/handler";
import { deleteEbook, readEbook, saveEbook } from "@/server/services/ebooks";
import { requireRole } from "@/server/services/roles";
import { saveEbookSchema, type Book, type Ebook, type SaveEbookInput } from "@/shared/contract";

export const runtime = "edge";

const EDITORS = ["admin", "moderator"] as const;

export const GET = defineRoute<undefined, Ebook>({
  handler: ({ db, identity, params }) => readEbook(db, params.id, identity.userId),
});

export const PUT = defineRoute<SaveEbookInput, Book>({
  schema: saveEbookSchema,
  source: "body",
  handler: async ({ db, identity, input, params }) => {
    await requireRole(db, identity.userId, EDITORS, "Elektron kitobni faqat admin yoki moderator qo‘yadi.");
    return saveEbook(db, params.id, identity.userId, input.body);
  },
});

export const DELETE = defineRoute<undefined, Book>({
  handler: async ({ db, identity, params }) => {
    await requireRole(db, identity.userId, EDITORS, "Elektron kitobni faqat admin yoki moderator olib tashlaydi.");
    return deleteEbook(db, params.id);
  },
});

export const OPTIONS = GET;
