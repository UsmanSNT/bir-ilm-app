import { env } from "cloudflare:workers";
import { activeBookId, books } from "@/app/app-data";
import { authRequired, readerIdentity } from "@/lib/reader-identity";
import { TALK_REACTIONS, type TalkMessage, type TalkParticipant, type TalkRole, type TalkState } from "@/app/talk-types";

export const runtime = "edge";

const ONLINE_SECONDS = 40;
const MAX_TEXT = 500;
const roleOrder: Record<TalkRole, number> = { host: 0, speaker: 1, listener: 2 };

/** Joriy xona: Toshkent vaqti bilan shu haftaning yakshanbasi 18:00 (UTC+5 → 13:00 UTC). */
function currentRoom(now = new Date()) {
  const tashkent = new Date(now.getTime() + 5 * 3600_000);
  const sunday = new Date(Date.UTC(tashkent.getUTCFullYear(), tashkent.getUTCMonth(), tashkent.getUTCDate() + ((7 - tashkent.getUTCDay()) % 7)));
  const id = sunday.toISOString().slice(0, 10);
  const book = books.find(b => b.id === activeBookId) ?? books[0];
  return { id, title: `${book.title} — birga tahlil qilamiz`, book: book.title, startsAt: `${id}T13:00:00.000Z` };
}

async function ensureRoom(db: D1Database) {
  const r = currentRoom();
  await db.prepare("INSERT OR IGNORE INTO talk_rooms (id, title, book, starts_at) VALUES (?,?,?,?)").bind(r.id, r.title, r.book, r.startsAt).run();
  return (await db.prepare("SELECT id, title, book, starts_at AS startsAt, status, host_id AS hostId FROM talk_rooms WHERE id=?").bind(r.id).first<TalkState["room"]>())!;
}

const iso = (v: string) => (v.includes("T") ? v : `${v.replace(" ", "T")}Z`);

async function snapshot(db: D1Database, room: TalkState["room"], userId: string, authed: boolean, after: number): Promise<TalkState> {
  const participants = (await db.prepare(`SELECT p.user_id AS userId, u.name, p.role, p.hand FROM talk_participants p JOIN users u ON u.id=p.user_id WHERE p.room_id=? AND p.last_seen > datetime('now', '-${ONLINE_SECONDS} seconds')`)
    .bind(room.id).all<{ userId: string; name: string; role: TalkRole; hand: number }>()).results
    .map(p => ({ ...p, hand: !!p.hand }) as TalkParticipant)
    .sort((a, b) => roleOrder[a.role] - roleOrder[b.role] || Number(b.hand) - Number(a.hand) || a.name.localeCompare(b.name));
  // Birinchi so'rovda oxirgi 60 xabar, keyingilarida faqat yangilari.
  const rows = after > 0
    ? (await db.prepare("SELECT m.id, m.user_id AS userId, COALESCE(u.name, '') AS name, m.kind, m.body, m.created_at AS createdAt FROM talk_messages m LEFT JOIN users u ON u.id=m.user_id WHERE m.room_id=? AND m.id>? ORDER BY m.id LIMIT 200").bind(room.id, after).all<TalkMessage>()).results
    : (await db.prepare("SELECT * FROM (SELECT m.id, m.user_id AS userId, COALESCE(u.name, '') AS name, m.kind, m.body, m.created_at AS createdAt FROM talk_messages m LEFT JOIN users u ON u.id=m.user_id WHERE m.room_id=? ORDER BY m.id DESC LIMIT 60) ORDER BY id").bind(room.id).all<TalkMessage>()).results;
  const mine = participants.find(p => p.userId === userId);
  return {
    room,
    me: { userId, authed, joined: !!mine, role: mine?.role ?? null, hand: mine?.hand ?? false },
    participants,
    messages: rows.map(m => ({ ...m, createdAt: iso(m.createdAt) })),
  };
}

export async function GET(request: Request) {
  const { id, headers, authed } = await readerIdentity(request);
  const db = env.DB;
  if (!db) return Response.json({ error: "Suhbat hozir mavjud emas." }, { status: 503, headers });
  const after = Math.max(0, Number(new URL(request.url).searchParams.get("after")) || 0);
  try {
    const room = await ensureRoom(db);
    return Response.json(await snapshot(db, room, id, authed, after), { headers });
  } catch {
    return Response.json({ error: "Suhbat yuklanmadi." }, { status: 503, headers });
  }
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "So'rov rad etildi." }, { status: 403 });
  const { id, headers, authed } = await readerIdentity(request);
  if (!authed) return authRequired(headers);
  const fail = (error: string, status = 400) => Response.json({ error }, { status, headers });
  const db = env.DB;
  if (!db) return fail("Suhbat hozir mavjud emas.", 503);

  let p: Record<string, unknown>;
  try {
    const raw: unknown = await request.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw Error();
    p = raw as Record<string, unknown>;
  } catch { return fail("So'rov noto'g'ri."); }

  try {
    const room = await ensureRoom(db);
    const me = await db.prepare("SELECT role, last_seen > datetime('now', ?) AS online FROM talk_participants WHERE room_id=? AND user_id=?").bind(`-${ONLINE_SECONDS} seconds`, room.id, id).first<{ role: TalkRole; online: number }>();
    const isHost = room.hostId === id && room.status === "live";
    const system = (body: string) => db.prepare("INSERT INTO talk_messages (room_id, user_id, kind, body) VALUES (?,?, 'system', ?)").bind(room.id, id, body);
    const recentCount = async (kind: string, seconds: number) => (await db.prepare(`SELECT count(*) AS n FROM talk_messages WHERE user_id=? AND room_id=? AND kind=? AND created_at > datetime('now', '-${seconds} seconds')`).bind(id, room.id, kind).first<{ n: number }>())?.n ?? 0;

    switch (p.action) {
      case "join": {
        const role: TalkRole = isHost ? "host" : me?.role === "speaker" ? "speaker" : "listener";
        await db.batch([
          db.prepare("INSERT INTO talk_participants (room_id, user_id, role) VALUES (?,?,?) ON CONFLICT(room_id, user_id) DO UPDATE SET last_seen=CURRENT_TIMESTAMP, role=excluded.role").bind(room.id, id, role),
          // Qayta ulanishda (sahifa yangilansa) chatni "qo'shildi" xabarlari bilan to'ldirmaslik uchun.
          ...(!me?.online ? [system("joined")] : []),
        ]);
        break;
      }
      case "leave":
        if (me) await db.batch([db.prepare("DELETE FROM talk_participants WHERE room_id=? AND user_id=?").bind(room.id, id), system("left")]);
        break;
      case "ping":
        if (!me) return fail("Avval xonaga kiring.", 409);
        await db.prepare("UPDATE talk_participants SET last_seen=CURRENT_TIMESTAMP WHERE room_id=? AND user_id=?").bind(room.id, id).run();
        break;
      case "message": {
        if (!me) return fail("Avval xonaga kiring.", 409);
        const body = typeof p.body === "string" ? p.body.trim().replace(/\n{3,}/g, "\n\n") : "";
        if (!body || body.length > MAX_TEXT) return fail(`Xabar 1–${MAX_TEXT} belgi bo'lsin.`);
        if (await recentCount("text", 20) >= 8) return fail("Juda tez yozyapsiz. Biroz kuting.", 429);
        await db.prepare("INSERT INTO talk_messages (room_id, user_id, kind, body) VALUES (?,?, 'text', ?)").bind(room.id, id, body).run();
        break;
      }
      case "react": {
        if (!me) return fail("Avval xonaga kiring.", 409);
        if (typeof p.emoji !== "string" || !(TALK_REACTIONS as readonly string[]).includes(p.emoji)) return fail("Reaksiya noto'g'ri.");
        if (await recentCount("reaction", 20) >= 20) return fail("Juda ko'p reaksiya.", 429);
        await db.prepare("INSERT INTO talk_messages (room_id, user_id, kind, body) VALUES (?,?, 'reaction', ?)").bind(room.id, id, p.emoji).run();
        break;
      }
      case "hand": {
        if (!me) return fail("Avval xonaga kiring.", 409);
        if (typeof p.raised !== "boolean") return fail("So'rov noto'g'ri.");
        await db.prepare("UPDATE talk_participants SET hand=?, last_seen=CURRENT_TIMESTAMP WHERE room_id=? AND user_id=? AND role='listener'").bind(p.raised ? 1 : 0, room.id, id).run();
        break;
      }
      case "start": {
        if (room.status === "live") return fail("Muhokama allaqachon boshlangan.", 409);
        await db.batch([
          db.prepare("UPDATE talk_rooms SET status='live', host_id=?, started_at=CURRENT_TIMESTAMP, ended_at=NULL WHERE id=?").bind(id, room.id),
          db.prepare("INSERT INTO talk_participants (room_id, user_id, role) VALUES (?,?, 'host') ON CONFLICT(room_id, user_id) DO UPDATE SET role='host', hand=0, last_seen=CURRENT_TIMESTAMP").bind(room.id, id),
          system("started"),
        ]);
        break;
      }
      case "end":
        if (!isHost) return fail("Faqat moderator yakunlay oladi.", 403);
        await db.batch([
          db.prepare("UPDATE talk_rooms SET status='ended', ended_at=CURRENT_TIMESTAMP WHERE id=?").bind(room.id),
          db.prepare("DELETE FROM talk_participants WHERE room_id=?").bind(room.id),
          system("ended"),
        ]);
        break;
      case "role": {
        if (!isHost) return fail("Faqat moderator so'z bera oladi.", 403);
        const target = typeof p.target === "string" ? p.target : "";
        if (target === id || (p.role !== "speaker" && p.role !== "listener")) return fail("So'rov noto'g'ri.");
        const res = await db.prepare("UPDATE talk_participants SET role=?, hand=0 WHERE room_id=? AND user_id=?").bind(p.role, room.id, target).run();
        if (!res.meta.changes) return fail("Ishtirokchi topilmadi.", 404);
        break;
      }
      default:
        return fail("Noma'lum amal.");
    }
    const fresh = await ensureRoom(db);
    return Response.json(await snapshot(db, fresh, id, true, Math.max(0, Number(p.after) || 0)), { headers });
  } catch {
    return fail("Saqlanmadi. Qayta urinib ko'ring.", 503);
  }
}
