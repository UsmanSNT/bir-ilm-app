import { env } from "cloudflare:workers";
import { books } from "@/app/app-data";
import { computeTotals, getMeta, paymentMethods, promoCodes, sanitizeCart, type Order } from "@/app/store-data";
import { readerIdentity } from "@/lib/reader-identity";

export const runtime = "edge";

const PHONE = /^\+998\d{9}$/;
const ORDER_ID = /^ZB-[A-Z0-9-]{6,40}$/;
const MAX_ORDERS = 50;

type OrderRow = { id: string; name: string; phone: string; address: string; payment: Order["payment"]; subtotal: number; discount: number; total: number; createdAt: string };
type ItemRow = { orderId: string; bookId: string; title: string; qty: number; price: number };

async function snapshot(db: D1Database, userId: string) {
  const items = (await db.prepare("SELECT book_id AS bookId, qty FROM store_cart_items WHERE user_id=?").bind(userId).all<{ bookId: string; qty: number }>()).results;
  const meta = await db.prepare("SELECT promo FROM store_cart_meta WHERE user_id=?").bind(userId).first<{ promo: string }>();
  const orderRows = (await db.prepare("SELECT id, name, phone, address, payment, subtotal, discount, total, created_at AS createdAt FROM store_orders WHERE user_id=? ORDER BY created_at DESC, rowid DESC LIMIT ?").bind(userId, MAX_ORDERS).all<OrderRow>()).results;
  const itemRows = orderRows.length
    ? (await db.prepare(`SELECT order_id AS orderId, book_id AS bookId, title, qty, price FROM store_order_items WHERE order_id IN (${orderRows.map(() => "?").join(",")}) ORDER BY id`).bind(...orderRows.map(o => o.id)).all<ItemRow>()).results
    : [];
  const orders: Order[] = orderRows.map(o => ({
    ...o,
    createdAt: o.createdAt.includes("T") ? o.createdAt : `${o.createdAt.replace(" ", "T")}Z`,
    lines: itemRows.filter(i => i.orderId === o.id).map(({ bookId, title, qty, price }) => ({ bookId, title, qty, price })),
  }));
  return { cart: Object.fromEntries(items.map(i => [i.bookId, i.qty])), promo: meta?.promo ?? "", orders };
}

function replaceCart(db: D1Database, userId: string, cart: Record<string, number>, promo: string) {
  return [
    db.prepare("DELETE FROM store_cart_items WHERE user_id=?").bind(userId),
    ...Object.entries(cart).map(([bookId, qty]) => db.prepare("INSERT INTO store_cart_items (user_id, book_id, qty) VALUES (?,?,?)").bind(userId, bookId, qty)),
    db.prepare("INSERT INTO store_cart_meta (user_id, promo) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET promo=excluded.promo, updated_at=CURRENT_TIMESTAMP").bind(userId, promo),
  ];
}

export async function GET(request: Request) {
  const { id, headers } = await readerIdentity(request);
  try {
    if (!env.DB) throw Error("DB unavailable");
    await env.DB.prepare("INSERT OR IGNORE INTO users (id, name) VALUES (?, 'Kitobxon')").bind(id).run();
    return Response.json(await snapshot(env.DB, id), { headers });
  } catch {
    return Response.json({ error: "Do'kon ma'lumoti yuklanmadi." }, { status: 503, headers });
  }
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "So'rov rad etildi." }, { status: 403 });
  const { id, headers } = await readerIdentity(request);
  const fail = (error: string, status = 400) => Response.json({ error }, { status, headers });

  let payload: Record<string, unknown>;
  try {
    const raw: unknown = await request.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw Error();
    payload = raw as Record<string, unknown>;
  } catch { return fail("So'rov noto'g'ri."); }

  const cart = sanitizeCart(payload.cart);
  const promo = typeof payload.promo === "string" ? payload.promo : "";
  if (!cart || (promo && !(promo in promoCodes))) return fail("Savat noto'g'ri.");

  try {
    const db = env.DB;
    if (!db) throw Error("DB unavailable");
    await db.prepare("INSERT OR IGNORE INTO users (id, name) VALUES (?, 'Kitobxon')").bind(id).run();

    if (payload.type === "cart") {
      await db.batch(replaceCart(db, id, cart, promo));
      return Response.json({ ok: true }, { headers });
    }

    if (payload.type === "order") {
      const orderId = typeof payload.id === "string" ? payload.id : "";
      const name = typeof payload.name === "string" ? payload.name.trim().slice(0, 80) : "";
      const phone = typeof payload.phone === "string" ? payload.phone.replace(/\s/g, "") : "";
      const address = typeof payload.address === "string" ? payload.address.trim().slice(0, 200) : "";
      if (!ORDER_ID.test(orderId) || name.length < 2 || !PHONE.test(phone) || address.length < 8 || !paymentMethods.some(m => m.id === payload.payment)) return fail("Buyurtma ma'lumoti noto'g'ri.");
      if (!Object.keys(cart).length) return fail("Savat bo'sh.");

      // Takroriy yuborish (tarmoq xatosidan keyin qayta urinish) mavjud buyurtmani qaytaradi.
      const existing = await db.prepare("SELECT user_id AS userId FROM store_orders WHERE id=?").bind(orderId).first<{ userId: string }>();
      if (existing && existing.userId !== id) return fail("Buyurtma raqami band.", 409);
      if (!existing) {
        const totals = computeTotals(cart, promo);
        await db.batch([
          db.prepare("INSERT INTO store_orders (id,user_id,name,phone,address,payment,promo,subtotal,discount,total) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(orderId, id, name, phone, address, payload.payment, promo, totals.subtotal, totals.discount, totals.total),
          ...Object.entries(cart).map(([bookId, qty]) => {
            const book = books.find(b => b.id === bookId)!;
            return db.prepare("INSERT INTO store_order_items (order_id,book_id,title,qty,price) VALUES (?,?,?,?,?)").bind(orderId, bookId, book.title, qty, getMeta(book).price);
          }),
          ...replaceCart(db, id, {}, ""),
        ]);
      }
      return Response.json({ ok: true, ...(await snapshot(db, id)) }, { headers });
    }
    return fail("So'rov turi noto'g'ri.");
  } catch {
    return fail("Saqlanmadi. Qayta urinib ko'ring.", 503);
  }
}
