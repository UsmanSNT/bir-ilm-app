import { env } from "cloudflare:workers";
import { authRequired, readerIdentity } from "@/lib/reader-identity";
import { ensureRoom } from "@/lib/talk";
import type { MediaKind, TalkRole } from "@/app/talk-types";

export const runtime = "edge";

/**
 * Cloudflare Realtime (SFU) proksisi. Kalit (CALLS_APP_TOKEN) faqat serverda; mijoz faqat o'z sessiyasi bilan ishlaydi.
 * Har kim o'z oqimini SFU'ga bir marta yuboradi, boshqalar faqat kerakli treklarni oladi — tarmoq tejaladi.
 */
const API = "https://rtc.live.cloudflare.com/v1";
const KINDS: MediaKind[] = ["audio", "video", "screen"];
const MAX_SDP = 64_000;
const column: Record<MediaKind, string> = { audio: "pub_audio", video: "pub_video", screen: "pub_screen" };

type Me = { role: TalkRole; session: string | null };
type Desc = { sdp: string; type: "offer" | "answer" };

async function calls(path: string, method: "POST" | "PUT", body?: unknown) {
  const res = await fetch(`${API}/apps/${env.CALLS_APP_ID}${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.CALLS_APP_TOKEN}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const data = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok || data.errorCode) throw Error(String(data.errorDescription ?? `SFU ${res.status}`));
  return data;
}

/** Ruxsat: ovoz/video — moderator va ma'ruzachi; ekran — faqat moderator. */
const mayPublish = (role: TalkRole, kind: MediaKind) => (kind === "screen" ? role === "host" : role === "host" || role === "speaker");

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "So'rov rad etildi." }, { status: 403 });
  const { id, headers, authed } = await readerIdentity(request);
  if (!authed) return authRequired(headers);
  const fail = (error: string, status = 400) => Response.json({ error }, { status, headers });
  if (!env.CALLS_APP_ID || !env.CALLS_APP_TOKEN) return fail("Ovozli aloqa hali sozlanmagan.", 503);
  const db = env.DB;
  if (!db) return fail("Server hozir mavjud emas.", 503);

  let p: Record<string, unknown>;
  try {
    const raw: unknown = await request.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw Error();
    p = raw as Record<string, unknown>;
  } catch { return fail("So'rov noto'g'ri."); }
  const sdp = typeof p.sdp === "string" && p.sdp.length <= MAX_SDP ? p.sdp : "";

  try {
    const room = await ensureRoom(db);
    if (room.status !== "live") return fail("Efir hali boshlanmagan.", 409);
    const me = await db.prepare("SELECT role, rtc_session AS session FROM talk_participants WHERE room_id=? AND user_id=?").bind(room.id, id).first<Me>();
    if (!me) return fail("Avval xonaga kiring.", 409);
    const session = me.session;
    const needSession = () => { if (!session) throw new Response(JSON.stringify({ error: "Sessiya yo'q." }), { status: 409 }); return session; };

    switch (p.op) {
      case "session": {
        const created = await calls("/sessions/new", "POST");
        const sessionId = String(created.sessionId ?? "");
        if (!sessionId) return fail("SFU sessiya bermadi.", 502);
        // Yangi ulanish — eski e'lon qilingan treklar endi yo'q.
        await db.prepare("UPDATE talk_participants SET rtc_session=?, pub_audio=0, pub_video=0, pub_screen=0 WHERE room_id=? AND user_id=?").bind(sessionId, room.id, id).run();
        let iceServers: unknown = [{ urls: ["stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:53"] }];
        if (env.TURN_KEY_ID && env.TURN_KEY_TOKEN) {
          // TURN: qattiq tarmoqlar (NAT/firewall) ortidagilar uchun; 1 soatlik vaqtinchalik kalit.
          const turn = await fetch(`${API}/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`, { method: "POST", headers: { Authorization: `Bearer ${env.TURN_KEY_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ ttl: 3600 }) }).catch(() => null);
          const data = turn?.ok ? await turn.json().catch(() => null) as { iceServers?: unknown } | null : null;
          if (data?.iceServers) iceServers = data.iceServers;
        }
        return Response.json({ iceServers }, { headers });
      }
      case "push": {
        const tracks = Array.isArray(p.tracks) ? p.tracks as { mid?: unknown; kind?: unknown }[] : [];
        if (!sdp || !tracks.length || tracks.length > 3) return fail("So'rov noto'g'ri.");
        for (const t of tracks) {
          if (typeof t.mid !== "string" || !KINDS.includes(t.kind as MediaKind)) return fail("Trek noto'g'ri.");
          if (!mayPublish(me.role, t.kind as MediaKind)) return fail(t.kind === "screen" ? "Ekranni faqat admin ulasha oladi." : "Gapirish uchun admin so'z berishi kerak.", 403);
        }
        const s = needSession();
        const data = await calls(`/sessions/${s}/tracks/new`, "POST", {
          sessionDescription: { sdp, type: "offer" },
          tracks: tracks.map(t => ({ location: "local", mid: t.mid, trackName: t.kind })),
        });
        await db.batch(tracks.map(t => db.prepare(`UPDATE talk_participants SET ${column[t.kind as MediaKind]}=1${t.kind === "audio" ? ", mic=1" : ""} WHERE room_id=? AND user_id=?`).bind(room.id, id)));
        return Response.json({ sessionDescription: data.sessionDescription }, { headers });
      }
      case "pull": {
        const wanted = Array.isArray(p.tracks) ? p.tracks as { userId?: unknown; kind?: unknown }[] : [];
        if (!wanted.length || wanted.length > 24) return fail("So'rov noto'g'ri.");
        const rows = (await db.prepare(`SELECT user_id AS userId, role, rtc_session AS session, pub_audio AS audio, pub_video AS video, pub_screen AS screen FROM talk_participants WHERE room_id=? AND rtc_session IS NOT NULL AND last_seen > datetime('now','-40 seconds')`).bind(room.id).all<{ userId: string; role: TalkRole; session: string; audio: number; video: number; screen: number }>()).results;
        const remote: { location: "remote"; sessionId: string; trackName: MediaKind }[] = [];
        const owners = new Map<string, string>();
        for (const w of wanted) {
          const kind = w.kind as MediaKind;
          const pub = rows.find(r => r.userId === w.userId);
          // Faqat hozir ruxsati bor va trekini e'lon qilgan ishtirokchidan olinadi.
          if (!pub || pub.userId === id || !KINDS.includes(kind) || !pub[kind] || !mayPublish(pub.role, kind)) continue;
          remote.push({ location: "remote", sessionId: pub.session, trackName: kind });
          owners.set(`${pub.session}:${kind}`, pub.userId);
        }
        if (!remote.length) return Response.json({ tracks: [] }, { headers });
        const s = needSession();
        const data = await calls(`/sessions/${s}/tracks/new`, "POST", { tracks: remote });
        const tracks = (Array.isArray(data.tracks) ? data.tracks as { mid?: string; sessionId?: string; trackName?: string; errorCode?: string }[] : [])
          .filter(t => t.mid && !t.errorCode)
          .map(t => ({ mid: t.mid!, kind: t.trackName as MediaKind, userId: owners.get(`${t.sessionId}:${t.trackName}`) ?? "" }))
          .filter(t => t.userId);
        return Response.json({ tracks, requiresImmediateRenegotiation: !!data.requiresImmediateRenegotiation, sessionDescription: data.sessionDescription ?? null }, { headers });
      }
      case "renegotiate": {
        const s = needSession();
        if (!sdp) return fail("So'rov noto'g'ri.");
        await calls(`/sessions/${s}/renegotiate`, "PUT", { sessionDescription: { sdp, type: "answer" } as Desc });
        return Response.json({ ok: true }, { headers });
      }
      case "close": {
        const s = needSession();
        const mids = Array.isArray(p.mids) ? (p.mids as unknown[]).filter((m): m is string => typeof m === "string").slice(0, 24) : [];
        const kinds = Array.isArray(p.kinds) ? (p.kinds as unknown[]).filter((k): k is MediaKind => KINDS.includes(k as MediaKind)) : [];
        if (!sdp || !mids.length) return fail("So'rov noto'g'ri.");
        const data = await calls(`/sessions/${s}/tracks/close`, "PUT", { tracks: mids.map(mid => ({ mid })), sessionDescription: { sdp, type: "offer" }, force: false });
        if (kinds.length) await db.batch(kinds.map(k => db.prepare(`UPDATE talk_participants SET ${column[k]}=0${k === "audio" ? ", mic=0" : ""} WHERE room_id=? AND user_id=?`).bind(room.id, id)));
        return Response.json({ sessionDescription: data.sessionDescription }, { headers });
      }
      default:
        return fail("Noma'lum amal.");
    }
  } catch (e) {
    if (e instanceof Response) return new Response(e.body, { status: e.status, headers });
    return fail(e instanceof Error && e.message.startsWith("SFU") ? "Ovoz serveri javob bermadi." : "Ovoz serveriga ulanib bo'lmadi.", 502);
  }
}
