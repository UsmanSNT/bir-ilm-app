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
import { deriveUserId } from "@/server/auth/identity";
import * as live from "@/server/services/live";
import type { WsClientMessage, WsServerMessage, LiveRole } from "@/shared/contract/live";

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

export function startWsServer(db: Database, port = 8788) {
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

    ws.on("close", async () => {
      if (client.sessionId) {
        await live.leaveSession(db, client.sessionId, client.userId);
        const count = await live.getParticipantCount(db, client.sessionId);
        broadcastToSession(client.sessionId, {
          type: "participant_left",
          userId: client.userId,
          count,
        });
      }
      clients.delete(ws);
    });
  });

  console.log(`[ws] WebSocket server: ws://0.0.0.0:${port}`);
  return wss;
}

async function handleMessage(db: Database, client: Client, msg: WsClientMessage) {
  switch (msg.type) {
    case "join": {
      // Token'dan userId olish
      client.userId = await deriveUserId(msg.token);

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

      // Oldingi sessiyadan chiqish
      if (client.sessionId && client.sessionId !== msg.sessionId) {
        await live.leaveSession(db, client.sessionId, client.userId);
        const oldCount = await live.getParticipantCount(db, client.sessionId);
        broadcastToSession(client.sessionId, {
          type: "participant_left",
          userId: client.userId,
          count: oldCount,
        });
      }

      client.sessionId = msg.sessionId;

      // Rol aniqlash: moderator yoki oddiy tinglovchi
      const role: LiveRole = session.moderatorId === client.userId ? "moderator" : "listener";
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
      send(client.ws, {
        type: "joined",
        session: updatedSession!,
        participants,
        recentMessages,
      });
      return;
    }

    case "leave": {
      if (!client.sessionId) return;
      await live.leaveSession(db, client.sessionId, client.userId);
      const count = await live.getParticipantCount(db, client.sessionId);
      broadcastToSession(client.sessionId, {
        type: "participant_left",
        userId: client.userId,
        count,
      });
      client.sessionId = null;
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

    // ── Moderator buyruqlari ──────────────────────────────────────

    case "mod:grant_speaker": {
      if (!client.sessionId) return;
      const session = await live.getLiveSession(db, client.sessionId);
      if (!session || session.moderatorId !== client.userId) {
        send(client.ws, { type: "error", message: "Sizda ruxsat yo'q." });
        return;
      }
      await live.setRole(db, client.sessionId, msg.targetUserId, "speaker");
      broadcastToSession(client.sessionId, {
        type: "role_update",
        userId: msg.targetUserId,
        role: "speaker",
      });
      return;
    }

    case "mod:revoke_speaker": {
      if (!client.sessionId) return;
      const session = await live.getLiveSession(db, client.sessionId);
      if (!session || session.moderatorId !== client.userId) {
        send(client.ws, { type: "error", message: "Sizda ruxsat yo'q." });
        return;
      }
      await live.setRole(db, client.sessionId, msg.targetUserId, "listener");
      broadcastToSession(client.sessionId, {
        type: "role_update",
        userId: msg.targetUserId,
        role: "listener",
      });
      return;
    }

    case "mod:start": {
      if (!client.sessionId) return;
      await live.startLiveSession(db, client.sessionId, client.userId);
      const now = new Date().toISOString();
      broadcastToSession(client.sessionId, { type: "session_started", startedAt: now });
      return;
    }

    case "mod:end": {
      if (!client.sessionId) return;
      await live.endLiveSession(db, client.sessionId, client.userId);
      const now = new Date().toISOString();
      broadcastToSession(client.sessionId, { type: "session_ended", endedAt: now });
      return;
    }
  }
}
