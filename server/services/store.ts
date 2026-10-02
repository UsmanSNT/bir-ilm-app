/**
 * Book Store: vitrina, savat, buyurtmalar va kitob sharhlari.
 *
 * Narx va summa HAR DOIM serverda, bazadagi `books.price` dan hisoblanadi —
 * mijoz yuborgan narxga ishonilmaydi. Savat serverda saqlanadi, shuning uchun
 * web va mobil ilovada bir xil ko'rinadi.
 */
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { ApiException, badRequest, notFound, validationFailed } from "@/server/http/errors";
import { requireSignedIn } from "./community";
import { ensureUser } from "./social";
import type {
  BookReview,
  CartInput,
  CartLine,
  OrderStatus,
  PlaceOrderInput,
  ReviewInput,
  ReviewSummary,
  StoreBook,
  StoreOrder,
} from "@/shared/contract";

const { books, bookReviews, storeCartItems, storeOrders, storeOrderItems, users } = schema;
type OrderRow = typeof storeOrders.$inferSelect;
type ItemRow = typeof storeOrderItems.$inferSelect;

// Jadval nomlari to'g'ridan-to'g'ri: drizzle korrelyatsion subquery'da ustunni jadvalsiz yozadi.
const ratingSql = sql<number>`coalesce((select avg(rating) from book_reviews where book_reviews.book_id = books.id), 0)`;
const reviewsSql = sql<number>`(select count(*) from book_reviews where book_reviews.book_id = books.id)`;
const audioSql = sql<number>`exists(select 1 from book_tracks where book_tracks.book_id = books.id)`;

function coverUrl(id: string, file: string | null, updatedAt: string): string | null {
  return file ? `/media/books/${id}/${file}?v=${encodeURIComponent(updatedAt)}` : null;
}

/** Sotuvdagi kitoblar (narxi > 0), avval haftaning kitobi, keyin yangilari. */
export async function listStoreBooks(db: Database): Promise<StoreBook[]> {
  const rows = await db
    .select({
      id: books.id,
      title: books.title,
      author: books.author,
      summary: books.summary,
      color: books.color,
      coverFile: books.coverFile,
      updatedAt: books.updatedAt,
      pages: books.pages,
      price: books.price,
      category: books.category,
      hasAudio: audioSql,
      rating: ratingSql,
      reviews: reviewsSql,
    })
    .from(books)
    .where(gt(books.price, 0))
    .orderBy(desc(books.active), desc(books.createdAt));

  return rows.map(({ coverFile, updatedAt, hasAudio, rating, reviews, ...row }) => ({
    ...row,
    coverUrl: coverUrl(row.id, coverFile, updatedAt),
    hasAudio: Boolean(hasAudio),
    rating: Math.round(Number(rating) * 10) / 10,
    reviews: Number(reviews),
  }));
}

// ── Savat ───────────────────────────────────────────────────────────

/** Savat: sotuvdan olingan kitoblar avtomatik tushib qoladi. */
export async function getCart(db: Database, userId: string): Promise<CartLine[]> {
  return db
    .select({ bookId: storeCartItems.bookId, qty: storeCartItems.qty })
    .from(storeCartItems)
    .innerJoin(books, eq(books.id, storeCartItems.bookId))
    .where(and(eq(storeCartItems.userId, userId), gt(books.price, 0)))
    .orderBy(storeCartItems.updatedAt);
}

/** Savatni to'liq almashtiradi (mijoz holati — yagona manba). */
export async function replaceCart(db: Database, userId: string, input: CartInput): Promise<CartLine[]> {
  const ids = input.items.map((item) => item.bookId);
  if (ids.length) {
    const forSale = await db
      .select({ id: books.id })
      .from(books)
      .where(and(inArray(books.id, ids), gt(books.price, 0)));
    const known = new Set(forSale.map((row) => row.id));
    const missing = ids.filter((id) => !known.has(id));
    if (missing.length) throw validationFailed({ items: ["Ba'zi kitoblar sotuvda yo'q."] });
  }

  await ensureUser(db, userId);
  await db.batch([
    db.delete(storeCartItems).where(eq(storeCartItems.userId, userId)),
    ...input.items.map((item) => db.insert(storeCartItems).values({ userId, bookId: item.bookId, qty: item.qty })),
  ]);
  return getCart(db, userId);
}

// ── Buyurtmalar ─────────────────────────────────────────────────────

function toOrders(rows: OrderRow[], items: ItemRow[]): StoreOrder[] {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    address: row.address,
    note: row.note,
    payment: row.payment,
    status: row.status,
    total: row.total,
    createdAt: row.createdAt,
    lines: items
      .filter((item) => item.orderId === row.id)
      .map(({ bookId, title, qty, price }) => ({ bookId, title, qty, price })),
  }));
}

async function withItems(db: Database, rows: OrderRow[]): Promise<StoreOrder[]> {
  if (!rows.length) return [];
  const items = await db
    .select()
    .from(storeOrderItems)
    .where(inArray(storeOrderItems.orderId, rows.map((row) => row.id)))
    .orderBy(storeOrderItems.id);
  return toOrders(rows, items);
}

export async function listOrders(db: Database, userId: string): Promise<StoreOrder[]> {
  const rows = await db
    .select()
    .from(storeOrders)
    .where(eq(storeOrders.userId, userId))
    .orderBy(desc(storeOrders.createdAt))
    .limit(50);
  return withItems(db, rows);
}

/**
 * Buyurtma: serverdagi savatdan, bazadagi narxlar bilan. Bitta tranzaksiya
 * (buyurtma + qatorlar + savatni tozalash). Bir xil `id` qayta yuborilsa —
 * mavjud buyurtma qaytadi (tarmoq uzilishidan keyingi takror xavfsiz).
 */
export async function placeOrder(db: Database, userId: string, input: PlaceOrderInput): Promise<StoreOrder> {
  await requireSignedIn(db, userId, "Buyurtma berish");

  const existing = await findOwnOrder(db, userId, input.id);
  if (existing) return existing;

  const lines = await db
    .select({ bookId: books.id, title: books.title, price: books.price, qty: storeCartItems.qty })
    .from(storeCartItems)
    .innerJoin(books, eq(books.id, storeCartItems.bookId))
    .where(and(eq(storeCartItems.userId, userId), gt(books.price, 0)));
  if (!lines.length) throw badRequest("Savat bo'sh.");

  const total = lines.reduce((sum, line) => sum + line.price * line.qty, 0);
  const stamp = new Date().toISOString();
  try {
    await db.batch([
      db.insert(storeOrders).values({ ...input, userId, total, createdAt: stamp, updatedAt: stamp }),
      ...lines.map((line) => db.insert(storeOrderItems).values({ orderId: input.id, ...line })),
      db.delete(storeCartItems).where(eq(storeCartItems.userId, userId)),
    ]);
  } catch (error) {
    // Parallel takroriy so'rov birinchi yozgan bo'lishi mumkin.
    const raced = await findOwnOrder(db, userId, input.id);
    if (raced) return raced;
    throw error;
  }

  const created = await findOwnOrder(db, userId, input.id);
  if (!created) throw notFound("Buyurtma topilmadi.");
  return created;
}

async function findOwnOrder(db: Database, userId: string, id: string): Promise<StoreOrder | null> {
  const row = await db.query.storeOrders.findFirst({ where: eq(storeOrders.id, id) });
  if (!row) return null;
  if (row.userId !== userId) throw new ApiException("bad_request", "Buyurtma raqami band. Qayta urinib ko'ring.", 409);
  const [order] = await withItems(db, [row]);
  return order;
}

/** Admin: barcha buyurtmalar (holat bo'yicha filtr). */
export async function listAllOrders(db: Database, status?: OrderStatus): Promise<StoreOrder[]> {
  const rows = await db
    .select()
    .from(storeOrders)
    .where(status ? eq(storeOrders.status, status) : undefined)
    .orderBy(desc(storeOrders.createdAt))
    .limit(200);
  return withItems(db, rows);
}

export async function setOrderStatus(db: Database, id: string, status: OrderStatus): Promise<StoreOrder> {
  const row = await db.query.storeOrders.findFirst({ where: eq(storeOrders.id, id) });
  if (!row) throw notFound("Buyurtma topilmadi.");
  await db.update(storeOrders).set({ status, updatedAt: new Date().toISOString() }).where(eq(storeOrders.id, id));
  const [order] = await withItems(db, [{ ...row, status }]);
  return order;
}

// ── Sharhlar ────────────────────────────────────────────────────────

export async function listReviews(db: Database, bookId: string, viewerId: string): Promise<ReviewSummary> {
  const rows = await db
    .select({
      id: bookReviews.id,
      userId: bookReviews.userId,
      name: users.name,
      rating: bookReviews.rating,
      body: bookReviews.body,
      updatedAt: bookReviews.updatedAt,
    })
    .from(bookReviews)
    .innerJoin(users, eq(users.id, bookReviews.userId))
    .where(eq(bookReviews.bookId, bookId))
    .orderBy(desc(bookReviews.updatedAt))
    .limit(100);

  const items: BookReview[] = rows.map((row) => ({ ...row, mine: row.userId === viewerId }));
  const [stats] = await db
    .select({ average: sql<number>`coalesce(avg(${bookReviews.rating}), 0)`, count: sql<number>`count(*)` })
    .from(bookReviews)
    .where(eq(bookReviews.bookId, bookId));
  return { average: Math.round(Number(stats?.average ?? 0) * 10) / 10, count: Number(stats?.count ?? 0), items };
}

/** Har kitobxon har kitobga bitta sharh; qayta yozsa yangilanadi. */
export async function saveReview(db: Database, userId: string, bookId: string, input: ReviewInput): Promise<ReviewSummary> {
  await requireSignedIn(db, userId, "Sharh yozish");
  const book = await db.query.books.findFirst({ where: eq(books.id, bookId), columns: { id: true } });
  if (!book) throw notFound("Kitob topilmadi.");

  const stamp = new Date().toISOString();
  await db
    .insert(bookReviews)
    .values({ bookId, userId, rating: input.rating, body: input.body, createdAt: stamp, updatedAt: stamp })
    .onConflictDoUpdate({
      target: [bookReviews.bookId, bookReviews.userId],
      set: { rating: input.rating, body: input.body, updatedAt: stamp },
    });
  return listReviews(db, bookId, userId);
}

export async function deleteReview(db: Database, userId: string, bookId: string): Promise<ReviewSummary> {
  await db.delete(bookReviews).where(and(eq(bookReviews.bookId, bookId), eq(bookReviews.userId, userId)));
  return listReviews(db, bookId, userId);
}

/** AI uchun qisqa katalog matni (faqat sotuvdagi kitoblar). */
export async function catalogForAi(db: Database): Promise<{ text: string; books: StoreBook[] }> {
  const list = await listStoreBooks(db);
  const text = list
    .map((b) => `${b.id} | ${b.title} | ${b.author} | ${b.category || "—"} | ${b.price} so'm | ${b.pages} bet${b.hasAudio ? " | audio bor" : ""}`)
    .join("\n");
  return { text, books: list };
}

