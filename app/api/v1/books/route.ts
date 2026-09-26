/**
 * Kitoblar katalogi.
 *
 * Katalog bazadan keladi, shuning uchun uni o'zgartirish uchun Android/iOS
 * ilovasini qayta chiqarish shart emas. Qo'shish — admin va moderator.
 */
import { defineRoute } from "@/server/http/handler";
import { createBook } from "@/server/services/books";
import { listBooks } from "@/server/services/library";
import { requireRole } from "@/server/services/roles";
import { createBookSchema, type Book, type CreateBookInput } from "@/shared/contract";

export const runtime = "edge";

type BooksResponse = {
  items: Book[];
  /** Shu haftaning kitobi. */
  activeBookId: string | null;
};

export const GET = defineRoute<undefined, BooksResponse>({
  handler: async ({ db }) => {
    const items = await listBooks(db);
    const active = items.find((book) => book.active) ?? null;
    return { items, activeBookId: active?.id ?? null };
  },
});

export const POST = defineRoute<CreateBookInput, Book>({
  schema: createBookSchema,
  source: "body",
  status: 201,
  handler: async ({ db, identity, input }) => {
    await requireRole(db, identity.userId, ["admin", "moderator"], "Kitobni faqat admin yoki moderator qo'shadi.");
    return createBook(db, identity.userId, input);
  },
});

export const OPTIONS = GET;
