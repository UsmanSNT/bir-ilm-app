import { env } from "cloudflare:workers";
import { readerIdentity as identity } from "@/lib/reader-identity";
import { postKinds, type ReadingPost, type PostReply, type Reader } from "@/app/social-types";

export const runtime = "edge";

export async function GET(request: Request) {
  const { id, headers } = await identity(request);
  try {
    const db = env.DB;
    if (!db) throw Error("DB unavailable");
    await db.prepare("INSERT OR IGNORE INTO users (id, name) VALUES (?, 'Kitobxon')").bind(id).run();
    const query = new URL(request.url).searchParams;
    const scope = query.get("scope");
    const author = query.get("author");
    const before = query.get("before");
    const kind = query.get("kind");
    const conditions = ["1=1"];
    const args: string[] = [];
    if (scope === "following") { conditions.push("p.user_id IN (SELECT followed_id FROM reader_follows WHERE follower_id=?)"); args.push(id); }
    if (scope === "mine") { conditions.push("p.user_id=?"); args.push(id); }
    if (author) { conditions.push("p.user_id=?"); args.push(author); }
    if (kind && (postKinds as readonly string[]).includes(kind)) { conditions.push("p.kind=?"); args.push(kind); }
    if (before) { conditions.push("p.rowid < (SELECT rowid FROM reading_posts WHERE id=?)"); args.push(before); }
    const posts = (await db.prepare(`SELECT p.id, p.user_id AS userId, u.name, p.book, p.body, p.kind, p.created_at AS createdAt FROM reading_posts p JOIN users u ON u.id=p.user_id WHERE ${conditions.join(" AND ")} ORDER BY p.rowid DESC LIMIT 20`).bind(...args).all<Omit<ReadingPost, "replies" | "likes" | "liked">>()).results;
    const replies: PostReply[] = [];
    const likeRows = posts.length
      ? (await db.prepare(`SELECT post_id AS postId, count(*) AS likes, COALESCE(sum(user_id=?),0) AS mine FROM post_likes WHERE post_id IN (${posts.map(() => "?").join(",")}) GROUP BY post_id`).bind(id, ...posts.map(p => p.id)).all<{ postId: string; likes: number; mine: number }>()).results
      : [];
    if (posts.length) {
      const result = await db.prepare(`SELECT r.id, r.post_id AS postId, u.name, r.body, r.created_at AS createdAt FROM post_replies r JOIN users u ON u.id=r.user_id WHERE r.post_id IN (${posts.map(() => "?").join(",")}) ORDER BY r.rowid ASC`).bind(...posts.map(p => p.id)).all<PostReply>();
      replies.push(...result.results);
    }
    const profileQuery = "SELECT u.id, u.name, u.bio, (SELECT count(*) FROM reading_posts p WHERE p.user_id=u.id) AS posts, (SELECT count(*) FROM reader_follows f WHERE f.followed_id=u.id) AS followers FROM users u";
    const readers = (await db.prepare(`${profileQuery} WHERE u.id LIKE 'reader_%' ORDER BY posts DESC, u.created_at DESC LIMIT 100`).all<Reader>()).results;
    const profile = await db.prepare(`${profileQuery} WHERE u.id=?`).bind(id).first<Reader>();
    const authorProfile = author ? await db.prepare(`${profileQuery} WHERE u.id=?`).bind(author).first<Reader>() : null;
    const following = (await db.prepare("SELECT followed_id AS id FROM reader_follows WHERE follower_id=?").bind(id).all<{id: string}>()).results.map(r => r.id);
    const followers = await db.prepare("SELECT count(*) AS total FROM reader_follows WHERE followed_id=?").bind(id).first<{total: number}>();
    const focus = await db.prepare("SELECT COALESCE(sum(minutes),0) AS minutes, count(*) AS sessions FROM focus_sessions WHERE user_id=?").bind(id).first<{minutes: number; sessions: number}>();
    return Response.json({ userId: id, profile, authorProfile, posts: posts.map(p => { const l = likeRows.find(x => x.postId === p.id); return { ...p, likes: l?.likes ?? 0, liked: !!l?.mine, replies: replies.filter(r => r.postId === p.id) }; }), readers, following, followers: followers?.total ?? 0, focusMinutes: focus?.minutes ?? 0, sessions: focus?.sessions ?? 0 }, { headers });
  } catch {
    return Response.json({ error: "Lenta yuklanmadi. Qayta urinib ko'ring." }, { status: 503, headers });
  }
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "So'rov rad etildi." }, { status: 403 });
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
    const name = value("name", 40) || "Kitobxon";
    await db.prepare("INSERT INTO users (id, name) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name").bind(id, name).run();
    switch (payload.type) {
      case "profile": {
        if (payload.bio !== undefined) {
          if (typeof payload.bio !== "string" || payload.bio.length > 300) return fail("O'zingiz haqingizda 300 belgigacha yozing.");
          await db.prepare("UPDATE users SET bio=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(payload.bio.trim(), id).run();
        }
        break;
      }
      case "post": {
        const book = value("book", 160), body = value("body", 2000);
        if (!book || !body) return fail("Kitob nomi va fikringizni yozing.");
        const kind = payload.kind === undefined ? "review" : payload.kind;
        if (typeof kind !== "string" || !(postKinds as readonly string[]).includes(kind)) return fail("Post turi noto'g'ri.");
        await db.prepare("INSERT INTO reading_posts (id,user_id,book,body,kind) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(), id, book, body, kind).run();
        break;
      }
      case "edit": {
        const book = value("book", 160), body = value("body", 2000);
        if (!book || !body) return fail("Kitob nomi va fikringizni yozing.");
        const result = await db.prepare("UPDATE reading_posts SET book=?, body=? WHERE id=? AND user_id=?").bind(book, body, value("postId", 64), id).run();
        if (!result.meta.changes) return fail("Post topilmadi.", 404);
        break;
      }
      case "like": {
        const postId = value("postId", 64);
        if (typeof payload.like !== "boolean") return fail("Amal noto'g'ri.");
        if (!await db.prepare("SELECT id FROM reading_posts WHERE id=?").bind(postId).first()) return fail("Post topilmadi.", 404);
        await db.prepare(payload.like ? "INSERT OR IGNORE INTO post_likes (post_id,user_id) VALUES (?,?)" : "DELETE FROM post_likes WHERE post_id=? AND user_id=?").bind(postId, id).run();
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
      case "delete":
        await db.batch([
          db.prepare("DELETE FROM post_replies WHERE post_id IN (SELECT id FROM reading_posts WHERE id=? AND user_id=?)").bind(value("postId", 64), id),
          db.prepare("DELETE FROM post_likes WHERE post_id IN (SELECT id FROM reading_posts WHERE id=? AND user_id=?)").bind(value("postId", 64), id),
          db.prepare("DELETE FROM reading_posts WHERE id=? AND user_id=?").bind(value("postId", 64), id),
        ]);
        break;
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
