/**
 * Kitoblar katalogi.
 *
 * Katalog bazadan keladi, shuning uchun uni o'zgartirish uchun Android/iOS
 * ilovasini qayta chiqarish shart emas. Qo'shish — admin va moderator.
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@/server/db/client";
import { defineRoute } from "@/server/http/handler";
import { createBook, listCatalog } from "@/server/services/books";
import { weekBookOnAir } from "@/server/services/journey";
import { listBooks } from "@/server/services/library";
import { requireRole } from "@/server/services/roles";
import { createBookSchema, type Book, type CreateBookInput } from "@/shared/contract";

export const runtime = "edge";

type BooksResponse = {
  items: Book[];
  /** Shu haftaning kitobi. Shanba 24:00 (Seul) o'tgach — null (suhbat holatiga bog'liq emas). */
  activeBookId: string | null;
};

const querySchema = z.object({ kind: z.enum(["library", "store"]).default("library") });
type Query = z.infer<typeof querySchema>;

/** `?kind=store` — do'kon mahsulotlari (narxsizlari ham): faqat admin/moderator. Odatda — kutubxona kitoblari. */
export const GET = defineRoute<Query, BooksResponse>({
  schema: querySchema,
  source: "query",
  handler: async ({ db, identity, input }) => {
    if (input.kind === "store") {
      await requireRole(db, identity.userId, ["admin", "moderator"], "Do'kon mahsulotlarini faqat admin ko'radi.");
      return { items: await listCatalog(db, "store"), activeBookId: null };
    }
    const items = await listBooks(db);
    const active = items.find((book) => book.active) ?? null;
    if (!active || (await weekBookOnAir(db, active.id))) return { items, activeBookId: active?.id ?? null };
    // Hafta tugadi (shanba 24:00 Seul): e'lon bazada ham tushadi, admin yangi hafta kitobini joylaguncha bo'sh turadi.
    await db.update(schema.books).set({ active: false }).where(eq(schema.books.id, active.id));
    return { items: items.map((book) => (book.id === active.id ? { ...book, active: false } : book)), activeBookId: null };
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
