import { env } from "cloudflare:workers";
import { authRequired, readerIdentity } from "@/lib/reader-identity";
import { canStartTalk, ensureRoom } from "@/lib/talk";
import { TALK_REACTIONS, type TalkMessage, type TalkParticipant, type TalkRole, type TalkState } from "@/app/talk-types";

export const runtime = "edge";

const ONLINE_SECONDS = 40;
const MAX_TEXT = 500;
const roleOrder: Record<TalkRole, number> = { host: 0, speaker: 1, listener: 2 };

const iso = (v: string) => (v.includes("T") ? v : `${v.replace(" ", "T")}Z`);

async function snapshot(db: D1Database, room: TalkState["room"], userId: string, authed: boolean, after: number, login: string | null = null): Promise<TalkState> {
  const participants = (await db.prepare(`SELECT p.user_id AS userId, u.name, p.role, p.hand, p.mic, p.pub_audio AS audio, p.pub_video AS video, p.pub_screen AS screen FROM talk_participants p JOIN users u ON u.id=p.user_id WHERE p.room_id=? AND p.last_seen > datetime('now', '-${ONLINE_SECONDS} seconds')`)
    .bind(room.id).all<{ userId: string; name: string; role: TalkRole; hand: number; mic: number; audio: number; video: number; screen: number }>()).results
    .map(p => ({ ...p, hand: !!p.hand, mic: !!p.mic, audio: !!p.audio, video: !!p.video, screen: !!p.screen }) as TalkParticipant)
    .sort((a, b) => roleOrder[a.role] - roleOrder[b.role] || Number(b.hand) - Number(a.hand) || a.name.localeCompare(b.name));
  // Birinchi so'rovda oxirgi 60 xabar, keyingilarida faqat yangilari.
  const rows = after > 0
    ? (await db.prepare("SELECT m.id, m.user_id AS userId, COALESCE(u.name, '') AS name, m.kind, m.body, m.created_at AS createdAt FROM talk_messages m LEFT JOIN users u ON u.id=m.user_id WHERE m.room_id=? AND m.id>? ORDER BY m.id LIMIT 200").bind(room.id, after).all<TalkMessage>()).results
    : (await db.prepare("SELECT * FROM (SELECT m.id, m.user_id AS userId, COALESCE(u.name, '') AS name, m.kind, m.body, m.created_at AS createdAt FROM talk_messages m LEFT JOIN users u ON u.id=m.user_id WHERE m.room_id=? ORDER BY m.id DESC LIMIT 60) ORDER BY id").bind(room.id).all<TalkMessage>()).results;
  const mine = participants.find(p => p.userId === userId);
  return {
    room,
    me: { userId, authed, joined: !!mine, role: mine?.role ?? null, hand: mine?.hand ?? false, canStart: authed && canStartTalk(login) },
    media: !!(env.CALLS_APP_ID && env.CALLS_APP_TOKEN),
    participants,
    messages: rows.map(m => ({ ...m, createdAt: iso(m.createdAt) })),
  };
}

export async function GET(request: Request) {
  const { id, headers, authed, login } = await readerIdentity(request);
  const db = env.DB;
  if (!db) return Response.json({ error: "Suhbat hozir mavjud emas." }, { status: 503, headers });
  const after = Math.max(0, Number(new URL(request.url).searchParams.get("after")) || 0);
  try {
    const room = await ensureRoom(db);
    return Response.json(await snapshot(db, room, id, authed, after, login), { headers });
  } catch {
    return Response.json({ error: "Suhbat yuklanmadi." }, { status: 503, headers });
  }
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "So'rov rad etildi." }, { status: 403 });
  const { id, headers, authed, login } = await readerIdentity(request);
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
      case "mic": {
        if (!me) return fail("Avval xonaga kiring.", 409);
        if (typeof p.on !== "boolean") return fail("So'rov noto'g'ri.");
        if (p.on && me.role === "listener") return fail("Gapirish uchun moderator so'z berishi kerak.", 403);
        await db.prepare("UPDATE talk_participants SET mic=?, last_seen=CURRENT_TIMESTAMP WHERE room_id=? AND user_id=?").bind(p.on ? 1 : 0, room.id, id).run();
        break;
      }
      case "recording": {
        if (!isHost) return fail("Faqat moderator yozib ola oladi.", 403);
        if (p.state !== 0 && p.state !== 1 && p.state !== 2) return fail("So'rov noto'g'ri.");
        await db.batch([
          db.prepare("UPDATE talk_rooms SET recording=? WHERE id=?").bind(p.state, room.id),
          ...(p.state === 1 && room.recording === 0 ? [system("rec_on")] : p.state === 0 && room.recording !== 0 ? [system("rec_off")] : []),
        ]);
        break;
      }
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
        if (!canStartTalk(login)) return fail("Efirni faqat admin boshlay oladi.", 403);
        if (room.status === "live") return fail("Muhokama allaqachon boshlangan.", 409);
        await db.batch([
          db.prepare("UPDATE talk_rooms SET status='live', host_id=?, recording=0, started_at=CURRENT_TIMESTAMP, ended_at=NULL WHERE id=?").bind(id, room.id),
          db.prepare("INSERT INTO talk_participants (room_id, user_id, role) VALUES (?,?, 'host') ON CONFLICT(room_id, user_id) DO UPDATE SET role='host', hand=0, last_seen=CURRENT_TIMESTAMP").bind(room.id, id),
          system("started"),
        ]);
        break;
      }
      case "end":
        if (!isHost) return fail("Faqat moderator yakunlay oladi.", 403);
        await db.batch([
          db.prepare("UPDATE talk_rooms SET status='ended', recording=0, ended_at=CURRENT_TIMESTAMP WHERE id=?").bind(room.id),
          db.prepare("DELETE FROM talk_participants WHERE room_id=?").bind(room.id),
          system("ended"),
        ]);
        break;
      case "role": {
        if (!isHost) return fail("Faqat moderator so'z bera oladi.", 403);
        const target = typeof p.target === "string" ? p.target : "";
        if (target === id || (p.role !== "speaker" && p.role !== "listener")) return fail("So'rov noto'g'ri.");
        // Tinglovchiga qaytarilsa mikrofon va kamera belgilari ham o'chadi (boshqalar uning trekini olmaydi).
        const res = await db.prepare(p.role === "listener"
          ? "UPDATE talk_participants SET role=?, hand=0, mic=0, pub_audio=0, pub_video=0 WHERE room_id=? AND user_id=?"
          : "UPDATE talk_participants SET role=?, hand=0 WHERE room_id=? AND user_id=?").bind(p.role, room.id, target).run();
        if (!res.meta.changes) return fail("Ishtirokchi topilmadi.", 404);
        break;
      }
      default:
        return fail("Noma'lum amal.");
    }
    const fresh = await ensureRoom(db);
    return Response.json(await snapshot(db, fresh, id, true, Math.max(0, Number(p.after) || 0), login), { headers });
  } catch {
    return fail("Saqlanmadi. Qayta urinib ko'ring.", 503);
  }
}
