/**
 * Elektron kitob matni: saqlash, o'chirish va o'quvchiga berish.
 *
 * Ruxsat bitta joyda — `canReadFull`. Hozir: `free` kitob hammaga to'liq; `preview` kitobda (do'kon)
 * hamma boshlang'ich qismini o'qiydi, to'liq matnni admin va moderator (tekshirish uchun) o'qiydi.
 * Premium yoki xarid qo'shilganda faqat shu funksiya kengayadi.
 */
import { eq } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { notFound } from "@/server/http/errors";
import { getUserRole } from "@/server/services/roles";
import { EBOOK_PREVIEW, ebookAccessFor, type Book, type Ebook, type EbookAccess } from "@/shared/contract";
import { ebookPreview, ebookTextLength } from "@/shared/ebook-markup";
import { getBook, getBookRow } from "./books";

const { books, bookEbooks } = schema;

async function canReadFull(db: Database, userId: string, access: EbookAccess): Promise<boolean> {
  if (access === "free") return true;
  const role = await getUserRole(db, userId);
  return role === "admin" || role === "moderator";
}

export async function readEbook(db: Database, bookId: string, userId: string): Promise<Ebook> {
  const book = await getBookRow(db, bookId);
  const row = await db.query.bookEbooks.findFirst({ where: eq(bookEbooks.bookId, bookId) });
  if (!row) throw notFound("Bu kitobning elektron shakli hali qo‘yilmagan.");
  const access = ebookAccessFor(book.kind);
  const full = await canReadFull(db, userId, access);
  return {
    bookId,
    title: book.title,
    author: book.author,
    access,
    full,
    body: full ? row.body : ebookPreview(row.body, EBOOK_PREVIEW),
    chars: row.chars,
    updatedAt: row.updatedAt,
  };
}

/** Matn tayyor holda keladi (`saveEbookSchema` tozalagan). Qayta yuklansa almashtiriladi. */
export async function saveEbook(db: Database, bookId: string, userId: string, body: string): Promise<Book> {
  await getBookRow(db, bookId);
  const values = { body, chars: ebookTextLength(body), updatedBy: userId, updatedAt: new Date().toISOString() };
  await db
    .insert(bookEbooks)
    .values({ bookId, ...values })
    .onConflictDoUpdate({ target: bookEbooks.bookId, set: values });
  await db.update(books).set({ updatedAt: values.updatedAt }).where(eq(books.id, bookId));
  return getBook(db, bookId);
}

export async function deleteEbook(db: Database, bookId: string): Promise<Book> {
  await getBookRow(db, bookId);
  await db.delete(bookEbooks).where(eq(bookEbooks.bookId, bookId));
  return getBook(db, bookId);
}
