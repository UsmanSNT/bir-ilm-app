import { env } from "cloudflare:workers";
import type { ReadingPost, PostReply, Reader } from "@/app/social-types";
import { resolveIdentity, sessionCookie } from "@/server/auth/identity";
import { corsHeaders, isAllowedOrigin, parseAllowedOrigins, preflightResponse } from "@/server/http/cors";
import { canModerate, type UserRole } from "@/shared/contract/roles";

export const runtime = "edge";

async function roleOf(db: D1Database, id: string): Promise<UserRole> {
  const row = await db.prepare("SELECT role FROM users WHERE id=?").bind(id).first<{ role: UserRole }>();
  return row?.role ?? "user";
}

function corsContext(request: Request) {
  return {
    origin: request.headers.get("origin"),
    selfOrigin: new URL(request.url).origin,
    allowed: parseAllowedOrigins(process.env.ALLOWED_ORIGINS),
  };
}

/**
 * Mehmonni tanib oladi.
 *
 * Identifikator tokendan serverda hisoblanadi — mijoz yuborgan `userId` ga
 * hech qachon ishonilmaydi. Token ikki yo'l bilan kelishi mumkin:
 * cookie (web) yoki `Authorization: Bearer` (Android / iOS). Ikkalasi ham
 * bir xil `reader_<sha256>` beradi, shuning uchun bir foydalanuvchi webda
 * ham, ilovada ham o'sha ma'lumotni ko'radi.
 */
async function identity(request: Request) {
  const resolved = await resolveIdentity(request);
  const headers = corsHeaders(corsContext(request));
  headers.set("Cache-Control", "no-store");

  // Cookie faqat brauzerga kerak; native mijoz tokenni o'zi saqlaydi.
  if (resolved.isNew && resolved.platform === "web") {
    headers.set("Set-Cookie", sessionCookie(request, resolved.token));
  }

  return { id: resolved.userId, headers };
}

/** Native ilovalar uchun CORS preflight. */
export function OPTIONS(request: Request) {
  return preflightResponse(corsContext(request));
}

export async function GET(request: Request) {
  const { id, headers } = await identity(request);
  try {
    const db = env.DB;
    if (!db) throw Error("DB unavailable");
    await db.prepare("INSERT OR IGNORE INTO users (id, name) VALUES (?, 'Kitobxon')").bind(id).run();
    const role = await roleOf(db, id);
    const moderator = canModerate(role);
    const query = new URL(request.url).searchParams;
    const scope = query.get("scope");
    const author = query.get("author");
    const before = query.get("before");
    const conditions = ["1=1"];
    const args: string[] = [];
    if (scope === "following") { conditions.push("p.user_id IN (SELECT followed_id FROM reader_follows WHERE follower_id=?)"); args.push(id); }
    if (scope === "mine") { conditions.push("p.user_id=?"); args.push(id); }
    if (scope === "announcements") conditions.push("p.kind='announcement'");
    if (scope === "reported") {
      if (!moderator) return Response.json({ error: "Bu bo'lim faqat moderatorlar uchun." }, { status: 403, headers });
      conditions.push("EXISTS (SELECT 1 FROM post_reports r WHERE r.post_id=p.id)");
    }
    if (author) { conditions.push("p.user_id=?"); args.push(author); }
    if (before) { conditions.push("p.rowid < (SELECT rowid FROM reading_posts WHERE id=?)"); args.push(before); }
    const reportsColumn = moderator ? "(SELECT count(*) FROM post_reports r WHERE r.post_id=p.id)" : "0";
    const posts = (await db.prepare(`SELECT p.id, p.user_id AS userId, u.name, p.book, p.body, p.kind, p.created_at AS createdAt, ${reportsColumn} AS reports FROM reading_posts p JOIN users u ON u.id=p.user_id WHERE ${conditions.join(" AND ")} ORDER BY p.rowid DESC LIMIT 20`).bind(...args).all<Omit<ReadingPost, "replies">>()).results;
    const replies: PostReply[] = [];
    if (posts.length) {
      const result = await db.prepare(`SELECT r.id, r.post_id AS postId, r.user_id AS userId, u.name, r.body, r.created_at AS createdAt FROM post_replies r JOIN users u ON u.id=r.user_id WHERE r.post_id IN (${posts.map(() => "?").join(",")}) ORDER BY r.rowid ASC`).bind(...posts.map(p => p.id)).all<PostReply>();
      replies.push(...result.results);
    }
    const profileQuery = "SELECT u.id, u.name, u.bio, (SELECT count(*) FROM reading_posts p WHERE p.user_id=u.id) AS posts, (SELECT count(*) FROM reader_follows f WHERE f.followed_id=u.id) AS followers FROM users u";
    // Faqat faol kitobxonlar: post yozgan yoki Google/Telegram bilan kirganlar (bo'sh mehmon akkauntlar emas).
    const readers = (await db.prepare(`${profileQuery} WHERE u.id LIKE 'reader_%' AND (EXISTS (SELECT 1 FROM reading_posts x WHERE x.user_id=u.id) OR EXISTS (SELECT 1 FROM auth_accounts a WHERE a.user_id=u.id)) ORDER BY posts DESC, u.created_at DESC LIMIT 100`).all<Reader>()).results;
    const reportedPosts = moderator
      ? (await db.prepare("SELECT count(DISTINCT post_id) AS n FROM post_reports").first<{ n: number }>())?.n ?? 0
      : 0;
    const profile = await db.prepare(`${profileQuery} WHERE u.id=?`).bind(id).first<Reader>();
    const authorProfile = author ? await db.prepare(`${profileQuery} WHERE u.id=?`).bind(author).first<Reader>() : null;
    const following = (await db.prepare("SELECT followed_id AS id FROM reader_follows WHERE follower_id=?").bind(id).all<{id: string}>()).results.map(r => r.id);
    const followers = await db.prepare("SELECT count(*) AS total FROM reader_follows WHERE followed_id=?").bind(id).first<{total: number}>();
    const focus = await db.prepare("SELECT COALESCE(sum(minutes),0) AS minutes, count(*) AS sessions FROM focus_sessions WHERE user_id=?").bind(id).first<{minutes: number; sessions: number}>();
    return Response.json({ userId: id, role, profile, authorProfile, posts: posts.map(p => ({ ...p, replies: replies.filter(r => r.postId === p.id) })), readers, following, followers: followers?.total ?? 0, focusMinutes: focus?.minutes ?? 0, sessions: focus?.sessions ?? 0, reportedPosts }, { headers });
  } catch {
    return Response.json({ error: "Lenta yuklanmadi. Qayta urinib ko'ring." }, { status: 503, headers });
  }
}

export async function POST(request: Request) {
  // CSRF: begona sayt cookie bilan yozuv qila olmasin. Native qobiqlarning
  // originlari (capacitor://localhost va h.k.) ruxsat etilgan ro'yxatda.
  if (!isAllowedOrigin(corsContext(request))) {
    return Response.json({ error: "So'rov rad etildi." }, { status: 403 });
  }
  const { id, headers } = await identity(request);
  let payload: Record<string, unknown>;
  try {
    const raw: unknown = await request.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw Error();
    payload = raw as Record<string, unknown>;
  } catch { return Response.json({ error: "So'rov noto'g'ri." }, { status: 400, headers }); }
  const value = (key: string, max: number) => typeof payload[key] === "string" ? (payload[key] as string).trim().slice(0, max) : "";
  const fail = (error: string, status = 400) => Response.json({ error }, { status, headers });
  try {
    const db = env.DB;
    if (!db) throw Error("DB unavailable");
    await db.prepare("INSERT OR IGNORE INTO users (id, name) VALUES (?, 'Kitobxon')").bind(id).run();
    const moderator = canModerate(await roleOf(db, id));
    switch (payload.type) {
      case "profile": {
        // Ism faqat aniq o'zgartirilganda yangilanadi: brauzerdagi standart "Kitobxon"
        // Google/Telegram'dan kelgan haqiqiy ismni bosib ketmasin.
        const name = value("name", 40);
        if (name && name !== "Kitobxon") {
          await db.prepare("UPDATE users SET name=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(name, id).run();
        }
        if (payload.bio !== undefined) {
          if (typeof payload.bio !== "string" || payload.bio.length > 300) return fail("O'zingiz haqingizda 300 belgigacha yozing.");
          await db.prepare("UPDATE users SET bio=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(payload.bio.trim(), id).run();
        }
        break;
      }
      case "post": {
        const book = value("book", 160), body = value("body", 2000);
        const kind = payload.kind === "announcement" ? "announcement" : "post";
        if (kind === "announcement" && !moderator) return fail("E'lonni faqat admin yoki moderator joylaydi.", 403);
        if (!book || !body) return fail(kind === "announcement" ? "E'lon sarlavhasi va matnini yozing." : "Kitob nomi va fikringizni yozing.");
        await db.prepare("INSERT INTO reading_posts (id,user_id,book,body,kind) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(), id, book, body, kind).run();
        break;
      }
      case "report": {
        const postId = value("postId", 64);
        const post = await db.prepare("SELECT user_id AS userId FROM reading_posts WHERE id=?").bind(postId).first<{ userId: string }>();
        if (!post) return fail("Post topilmadi.", 404);
        if (post.userId === id) return fail("O'z postingizga shikoyat qilib bo'lmaydi.");
        await db.prepare("INSERT OR IGNORE INTO post_reports (post_id,user_id,reason) VALUES (?,?,?)").bind(postId, id, value("reason", 300)).run();
        break;
      }
      case "dismissReports": {
        if (!moderator) return fail("Bu amal faqat moderatorlar uchun.", 403);
        await db.prepare("DELETE FROM post_reports WHERE post_id=?").bind(value("postId", 64)).run();
        break;
      }
      case "deleteReply": {
        const replyId = value("replyId", 64);
        // Muallif o'z izohini, moderator esa istalgan izohni o'chiradi.
        const sql = moderator ? "DELETE FROM post_replies WHERE id=?" : "DELETE FROM post_replies WHERE id=? AND user_id=?";
        await db.prepare(sql).bind(...(moderator ? [replyId] : [replyId, id])).run();
        break;
      }
      case "reply": {
        const postId = value("postId", 64), body = value("body", 1000);
        if (!body) return fail("Izohni yozing.");
        if (!await db.prepare("SELECT id FROM reading_posts WHERE id=?").bind(postId).first()) return fail("Post topilmadi.", 404);
        await db.prepare("INSERT INTO post_replies (id,post_id,user_id,body) VALUES (?,?,?,?)").bind(crypto.randomUUID(), postId, id, body).run();
        break;
      }
      case "follow": {
        const target = value("target", 80);
        if (target === id || typeof payload.follow !== "boolean") return fail("Obuna noto'g'ri.");
        if (!await db.prepare("SELECT id FROM users WHERE id=? AND id LIKE 'reader_%'").bind(target).first()) return fail("Kitobxon topilmadi.", 404);
        await db.prepare(payload.follow ? "INSERT OR IGNORE INTO reader_follows (follower_id,followed_id) VALUES (?,?)" : "DELETE FROM reader_follows WHERE follower_id=? AND followed_id=?").bind(id, target).run();
        break;
      }
      case "delete": {
        const postId = value("postId", 64);
        // Muallif o'z postini, admin/moderator esa istalgan postni o'chiradi.
        const owner = moderator ? "" : " AND user_id=?";
        const bind = moderator ? [postId] : [postId, id];
        await db.batch([
          db.prepare(`DELETE FROM post_replies WHERE post_id IN (SELECT id FROM reading_posts WHERE id=?${owner})`).bind(...bind),
          db.prepare(`DELETE FROM post_reports WHERE post_id IN (SELECT id FROM reading_posts WHERE id=?${owner})`).bind(...bind),
          db.prepare(`DELETE FROM reading_posts WHERE id=?${owner}`).bind(...bind),
        ]);
        break;
      }
      case "focus": {
        const minutes = payload.minutes;
        const sessionId = value("sessionId", 36);
        if (typeof minutes !== "number" || ![15,25,45,60].includes(minutes) || !/^[a-f0-9-]{36}$/.test(sessionId)) return fail("Seans noto'g'ri.");
        await db.prepare("INSERT OR IGNORE INTO focus_sessions (id,user_id,minutes) VALUES (?,?,?)").bind(sessionId, id, minutes).run();
        break;
      }
      default: return fail("Noma'lum amal.");
    }
    return Response.json({ ok: true }, { headers });
  } catch { return fail("Saqlanmadi. Qayta urinib ko'ring.", 503); }
}
