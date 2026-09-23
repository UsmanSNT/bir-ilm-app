/**
 * Kitoblar katalogi.
 *
 * Katalog bazadan keladi, shuning uchun uni o'zgartirish uchun Android/iOS
 * ilovasini qayta chiqarish shart emas.
 */
import { defineRoute } from "@/server/http/handler";
import { listBooks } from "@/server/services/library";
import type { Book } from "@/shared/contract";

export const runtime = "edge";

type BooksResponse = {
  items: Book[];
  /** Shu haftaning kitobi. */
  activeBookId: string | null;
};

export const GET = defineRoute<undefined, BooksResponse>({
  handler: async ({ db }) => {
    const items = await listBooks(db);
    const active = items.find((book) => book.active) ?? items[0] ?? null;

    return { items, activeBookId: active?.id ?? null };
  },
});

export const OPTIONS = GET;
