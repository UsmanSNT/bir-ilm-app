/**
 * Jonli suhbat WebSocket serveri.
 *
 * Asosiy ilovadan alohida port (8788) da ishlaydi. Foydalanuvchilar
 * shu portga WebSocket orqali ulanadi.
 *
 * Xabar tiplari: shared/contract/live.ts da aniqlangan.
 */
import { WebSocketServer, WebSocket } from "ws";
import type { Database } from "@/server/db/client";
import { userIdForToken } from "@/server/auth/sessions";
import * as live from "@/server/services/live";
import { getUserRole } from "@/server/services/roles";
import { closeMediaRoom, issueMediaToken, mediaEnabled, removeFromMedia, syncMediaRole } from "@/server/services/media";
import type { WsClientMessage, WsServerMessage, LiveRole } from "@/shared/contract/live";
import { canModerate } from "@/shared/contract/roles";

type Client = {
  ws: WebSocket;
  userId: string;
  userName: string;
  sessionId: string | null;
};

const clients = new Map<WebSocket, Client>();

/** Bitta sessiyaning barcha ulanuvchilariga xabar yuboradi. */
function broadcastToSession(sessionId: string, msg: WsServerMessage, exclude?: WebSocket) {
  const data = JSON.stringify(msg);
  for (const [ws, client] of clients) {
    if (client.sessionId === sessionId && ws !== exclude && ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}

function send(ws: WebSocket, msg: WsServerMessage) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

// Internet bir lahza uzilsa, so'zlovchi rolini yo'qotmasligi uchun chiqishni biroz kutamiz.
const DEPARTURE_GRACE_MS = 15_000;
const pendingDepartures = new Map<string, ReturnType<typeof setTimeout>>();
const departureKey = (sessionId: string, userId: string) => `${sessionId}|${userId}`;

function isConnected(sessionId: string, userId: string) {
  for (const c of clients.values()) if (c.sessionId === sessionId && c.userId === userId) return true;
  return false;
}

function cancelDeparture(sessionId: string, userId: string) {
  const key = departureKey(sessionId, userId);
  clearTimeout(pendingDepartures.get(key));
  pendingDepartures.delete(key);
}

async function depart(db: Database, sessionId: string, userId: string) {
  cancelDeparture(sessionId, userId);
  if (isConnected(sessionId, userId)) return;
  await live.leaveSession(db, sessionId, userId);
  const count = await live.getParticipantCount(db, sessionId);
  broadcastToSession(sessionId, { type: "participant_left", userId, count });
}

function scheduleDeparture(db: Database, sessionId: string, userId: string) {
  cancelDeparture(sessionId, userId);
  pendingDepartures.set(
    departureKey(sessionId, userId),
    setTimeout(() => {
      depart(db, sessionId, userId).catch((err) => console.error("[ws] departure failed", err));
    }, DEPARTURE_GRACE_MS),
  );
}

export function startWsServer(db: Database, port = 8788) {
  // Participant rows only reflect open sockets; after a restart none remain.
  live.clearAllParticipants(db).catch((err) => console.error("[ws] participant cleanup failed", err));

  const wss = new WebSocketServer({ port, host: "0.0.0.0" });

  wss.on("connection", (ws) => {
    const client: Client = { ws, userId: "", userName: "Kitobxon", sessionId: null };
    clients.set(ws, client);

    ws.on("message", async (raw) => {
      try {
        const msg: WsClientMessage = JSON.parse(String(raw));
        await handleMessage(db, client, msg);
      } catch (err) {
        send(ws, { type: "error", message: err instanceof Error ? err.message : "Xato." });
      }
    });

    ws.on("close", () => {
      clients.delete(ws);
      if (client.sessionId) scheduleDeparture(db, client.sessionId, client.userId);
    });
  });

  console.log(`[ws] WebSocket server: ws://0.0.0.0:${port}`);
  console.log(mediaEnabled ? "[ws] Ovoz/video: LiveKit ulangan" : "[ws] Ovoz/video: o'chiq (LIVEKIT_* sozlanmagan)");
  return wss;
}

async function handleMessage(db: Database, client: Client, msg: WsClientMessage) {
  switch (msg.type) {
    case "join": {
      // Token'dan userId olish
      client.userId = await userIdForToken(db, msg.token);

      // Foydalanuvchi nomini users jadvalidan olish
      const { schema } = await import("@/server/db/client");
      const { eq } = await import("drizzle-orm");
      const user = await db.query.users.findFirst({
        where: eq(schema.users.id, client.userId),
      });
      client.userName = user?.name ?? "Kitobxon";

      // Sessiyani tekshirish
      const session = await live.getLiveSession(db, msg.sessionId);
      if (!session) {
        send(client.ws, { type: "error", message: "Suhbat topilmadi." });
        return;
      }
      if (kickedFrom(msg.sessionId).has(client.userId)) {
        send(client.ws, { type: "kicked" });
        return;
      }

      // Oldingi sessiyadan chiqish
      const previous = client.sessionId;
      client.sessionId = msg.sessionId;
      if (previous && previous !== msg.sessionId) await depart(db, previous, client.userId);
      cancelDeparture(msg.sessionId, client.userId);

      // Admin va moderatorlar har qanday suhbatda boshqaruvchi bo'ladi. Qayta ulangan
      // so'zlovchi esa so'zini saqlab qoladi.
      const globalRole = user?.role ?? "user";
      const existing = (await live.getParticipants(db, msg.sessionId)).find((p) => p.userId === client.userId);
      const role: LiveRole =
        canModerate(globalRole) || session.moderatorId === client.userId
          ? "moderator"
          : existing?.role === "speaker" ? "speaker" : "listener";
      const participant = await live.joinSession(db, msg.sessionId, client.userId, client.userName, role);

      // Boshqalarga xabar
      const count = await live.getParticipantCount(db, msg.sessionId);
      broadcastToSession(msg.sessionId, {
        type: "participant_joined",
        participant,
        count,
      }, client.ws);

      // O'ziga to'liq ma'lumot
      const [participants, recentMessages] = await Promise.all([
        live.getParticipants(db, msg.sessionId),
        live.getRecentMessages(db, msg.sessionId),
      ]);
      const updatedSession = await live.getLiveSession(db, msg.sessionId);
      const media = updatedSession!.status === "ended"
        ? null
        : await issueMediaToken(msg.sessionId, client.userId, client.userName, role);
      send(client.ws, {
        type: "joined",
        session: updatedSession!,
        participants,
        recentMessages,
        you: { userId: client.userId, role: globalRole },
        media,
      });
      return;
    }

    case "leave": {
      if (!client.sessionId) return;
      const sessionId = client.sessionId;
      client.sessionId = null;
      await depart(db, sessionId, client.userId);
      return;
    }

    case "chat": {
      if (!client.sessionId) return;
      const body = msg.body?.trim();
      if (!body || body.length > 500) return;
      const message = await live.addMessage(db, client.sessionId, client.userId, client.userName, body);
      broadcastToSession(client.sessionId, { type: "chat", message });
      return;
    }

    case "hand": {
      if (!client.sessionId) return;
      await live.setHandRaised(db, client.sessionId, client.userId, msg.raised);
      broadcastToSession(client.sessionId, {
        type: "hand_update",
        userId: client.userId,
        raised: msg.raised,
      });
      return;
    }

    // ── Moderator buyruqlari (moderator yoki admin) ───────────────

    case "mod:grant_speaker":
    case "mod:revoke_speaker": {
      if (!client.sessionId || !(await ensureModerator(db, client))) return;
      const target = (await live.getParticipants(db, client.sessionId)).find((p) => p.userId === msg.targetUserId);
      if (!target || target.role === "moderator") return;
      const role: LiveRole = msg.type === "mod:grant_speaker" ? "speaker" : "listener";
      await live.setRole(db, client.sessionId, msg.targetUserId, role);
      await syncMediaRole(client.sessionId, msg.targetUserId, role);
      broadcastToSession(client.sessionId, { type: "role_update", userId: msg.targetUserId, role });
      return;
    }

    case "mod:kick": {
      if (!client.sessionId || !(await ensureModerator(db, client))) return;
      if (msg.targetUserId === client.userId) return;
      const targetRole = await getUserRole(db, msg.targetUserId);
      if (targetRole === "admin") {
        send(client.ws, { type: "error", message: "Adminni chiqarib bo'lmaydi." });
        return;
      }
      const sessionId = client.sessionId;
      kickedFrom(sessionId).add(msg.targetUserId);
      cancelDeparture(sessionId, msg.targetUserId);
      await live.leaveSession(db, sessionId, msg.targetUserId);
      await removeFromMedia(sessionId, msg.targetUserId);
      for (const other of clients.values()) {
        if (other.sessionId === sessionId && other.userId === msg.targetUserId) {
          send(other.ws, { type: "kicked" });
          other.sessionId = null;
        }
      }
      const count = await live.getParticipantCount(db, sessionId);
      broadcastToSession(sessionId, { type: "participant_left", userId: msg.targetUserId, count });
      return;
    }

    case "mod:delete_message": {
      if (!client.sessionId || !(await ensureModerator(db, client))) return;
      if (await live.deleteMessage(db, client.sessionId, msg.messageId)) {
        broadcastToSession(client.sessionId, { type: "message_deleted", messageId: msg.messageId });
      }
      return;
    }

    // ── Faqat admin: suhbatni boshlash va tugatish ────────────────

    case "mod:start":
    case "mod:end": {
      if (!client.sessionId) return;
      if ((await getUserRole(db, client.userId)) !== "admin") {
        send(client.ws, { type: "error", message: "Suhbatni faqat admin boshlaydi va tugatadi." });
        return;
      }
      if (msg.type === "mod:start") {
        const startedAt = await live.startLiveSession(db, client.sessionId);
        broadcastToSession(client.sessionId, { type: "session_started", startedAt });
      } else {
        const endedAt = await live.endLiveSession(db, client.sessionId);
        broadcastToSession(client.sessionId, { type: "session_ended", endedAt });
        await closeMediaRoom(client.sessionId);
      }
      return;
    }
  }
}

// Rol har buyruqda bazadan o'qiladi, shuning uchun admin rolni olib qo'ysa darhol kuchga kiradi.
async function ensureModerator(db: Database, client: Client): Promise<boolean> {
  if (canModerate(await getUserRole(db, client.userId))) return true;
  send(client.ws, { type: "error", message: "Sizda ruxsat yo'q." });
  return false;
}

// Chiqarilganlar faqat server xotirasida: server qayta ishga tushsa, qayta kira oladi.
const kicked = new Map<string, Set<string>>();
function kickedFrom(sessionId: string): Set<string> {
  let set = kicked.get(sessionId);
  if (!set) kicked.set(sessionId, (set = new Set()));
  return set;
}
