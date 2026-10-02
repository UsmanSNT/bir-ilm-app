import { env } from "cloudflare:workers";
import { books } from "@/app/app-data";
import { authRequired, readerIdentity } from "@/lib/reader-identity";
import type { BookReview, ReviewSummary } from "@/app/review-types";

export const runtime = "edge";


const fail = (error: string, status: number, headers?: Headers) => Response.json({ error }, { status, headers });
const round1 = (v: number) => Math.round(v * 10) / 10;

export async function GET(request: Request) {
  const { id, headers } = await readerIdentity(request);
  const db = env.DB;
  if (!db) return fail("Sharhlar yuklanmadi.", 503, headers);
  const bookId = new URL(request.url).searchParams.get("book");
  try {
    if (!bookId) {
      // Katalog uchun barcha kitoblarning o'rtacha bahosi.
      const rows = (await db.prepare("SELECT book_id AS bookId, avg(rating) AS avg, count(*) AS count FROM book_reviews GROUP BY book_id").all<{ bookId: string; avg: number; count: number }>()).results;
      return Response.json({ summaries: Object.fromEntries(rows.map(r => [r.bookId, { avg: round1(r.avg), count: r.count }])) }, { headers });
    }
    if (!books.some(b => b.id === bookId)) return fail("Kitob topilmadi.", 404, headers);
    const rows = (await db.prepare("SELECT r.id, r.user_id AS userId, u.name, r.rating, r.body, r.updated_at AS createdAt FROM book_reviews r JOIN users u ON u.id=r.user_id WHERE r.book_id=? ORDER BY r.updated_at DESC, r.rowid DESC LIMIT 100").bind(bookId).all<Omit<BookReview, "mine">>()).results;
    const summary = await db.prepare("SELECT COALESCE(avg(rating),0) AS avg, count(*) AS count FROM book_reviews WHERE book_id=?").bind(bookId).first<ReviewSummary>();
    return Response.json({ summary: { avg: round1(summary?.avg ?? 0), count: summary?.count ?? 0 }, reviews: rows.map(r => ({ ...r, mine: r.userId === id })) }, { headers });
  } catch {
    return fail("Sharhlar yuklanmadi.", 503, headers);
  }
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return fail("So'rov rad etildi.", 403);
  const { id, headers, authed } = await readerIdentity(request);
  if (!authed) return authRequired(headers);
  const db = env.DB;
  if (!db) return fail("Saqlanmadi.", 503, headers);
  let p: Record<string, unknown>;
  try {
    const raw: unknown = await request.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw Error();
    p = raw as Record<string, unknown>;
  } catch { return fail("So'rov noto'g'ri.", 400, headers); }

  const bookId = typeof p.bookId === "string" ? p.bookId : "";
  if (!books.some(b => b.id === bookId)) return fail("Kitob topilmadi.", 404, headers);
  try {
    if (p.type === "delete") {
      await db.prepare("DELETE FROM book_reviews WHERE book_id=? AND user_id=?").bind(bookId, id).run();
      return Response.json({ ok: true }, { headers });
    }
    const rating = p.rating;
    const body = typeof p.body === "string" ? p.body.trim() : "";
    if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) return fail("Bahoni 1 dan 5 gacha tanlang.", 400, headers);
    if (body.length > 1000) return fail("Sharh 1000 belgidan oshmasin.", 400, headers);
    await db.prepare("INSERT INTO book_reviews (id, book_id, user_id, rating, body) VALUES (?,?,?,?,?) ON CONFLICT(book_id, user_id) DO UPDATE SET rating=excluded.rating, body=excluded.body, updated_at=CURRENT_TIMESTAMP")
      .bind(crypto.randomUUID(), bookId, id, rating, body).run();
    return Response.json({ ok: true }, { headers });
  } catch {
    return fail("Saqlanmadi. Qayta urinib ko'ring.", 503, headers);
  }
}
