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
import { isSignedIn } from "@/server/services/accounts";
import * as live from "@/server/services/live";
import { getUserRole } from "@/server/services/roles";
import { closeMediaRoom, issueMediaToken, mediaEnabled, removeFromMedia, syncMediaRole } from "@/server/services/media";
import { ApiException } from "@/server/http/errors";
import { GameError, type QuizGame } from "@/server/services/quiz-game-engine";
import { loadQuestions, openGame } from "@/server/services/quiz-game";
import { LIMITS_LIVE, type WsClientMessage, type WsServerMessage, type LiveRole } from "@/shared/contract/live";
import type { GameClientMessage, GameServerMessage } from "@/shared/contract/quiz-game";
import { canModerate } from "@/shared/contract/roles";

type Client = {
  ws: WebSocket;
  userId: string;
  userName: string;
  sessionId: string | null;
  /** Jonli viktorina xonasi (suhbat xonasidan mustaqil). */
  quiz: { game: QuizGame; host: boolean } | null;
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

function send(ws: WebSocket, msg: WsServerMessage | GameServerMessage) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

// Internet uzilsa yoki sahifa yangilansa, so'zlovchi rolini yo'qotmasligi uchun chiqishni bir daqiqa kutamiz.
const DEPARTURE_GRACE_MS = 60_000;
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

// Izohlar tezligi: har qatnashchining oxirgi izohlari vaqti (suhbatdan chiqqanda tozalanadi).
const chatTimes = new Map<string, number[]>();

/** `messageWindowMs` ichida `messageBurst` tadan ortiq izoh rad etiladi. */
function chatAllowed(sessionId: string, userId: string, now = Date.now()): boolean {
  const key = departureKey(sessionId, userId);
  const recent = (chatTimes.get(key) ?? []).filter((at) => now - at < LIMITS_LIVE.messageWindowMs);
  const allowed = recent.length < LIMITS_LIVE.messageBurst;
  if (allowed) recent.push(now);
  chatTimes.set(key, recent);
  return allowed;
}

async function depart(db: Database, sessionId: string, userId: string) {
  cancelDeparture(sessionId, userId);
  if (isConnected(sessionId, userId)) return;
  chatTimes.delete(departureKey(sessionId, userId));
  await live.leaveSession(db, sessionId, userId);
  // Yozayotgan admin chiqib ketsa, yozuv to'xtaydi — boshqalar buni ko'rishi kerak.
  const session = await live.getLiveSession(db, sessionId);
  if (session?.recording && (await recorderOf(db, sessionId)) === userId) {
    await live.setRecordingBy(db, sessionId, null);
    broadcastToSession(sessionId, { type: "recording", active: false });
  }
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
    const client: Client = { ws, userId: "", userName: "Kitobxon", sessionId: null, quiz: null };
    clients.set(ws, client);

    ws.on("message", async (raw) => {
      try {
        const msg: WsClientMessage | GameClientMessage = JSON.parse(String(raw));
        if (isGameMessage(msg)) await handleQuizMessage(db, client, msg);
        else await handleMessage(db, client, msg);
      } catch (err) {
        send(ws, { type: "error", message: err instanceof Error ? err.message : "Xato." });
      }
    });

    ws.on("close", () => {
      clients.delete(ws);
      if (client.sessionId) scheduleDeparture(db, client.sessionId, client.userId);
      leaveQuiz(client);
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

      // Jonli suhbat faqat ro'yxatdan o'tganlar uchun (LIVE_REQUIRE_LOGIN=0 — o'chirish, masalan sinovda).
      if (process.env.LIVE_REQUIRE_LOGIN !== "0" && !(await isSignedIn(db, client.userId))) {
        send(client.ws, { type: "error", message: "Suhbatga qo'shilish uchun avval hisobingizga kiring." });
        return;
      }

      // Sessiyani tekshirish
      const session = await live.getLiveSession(db, msg.sessionId);
      if (!session) {
        send(client.ws, { type: "error", message: "Suhbat topilmadi." });
        return;
      }
      // Boshlanmagan suhbatga hech kim (admin ham) kirmaydi: admin avval ro'yxatdagi oynadan boshlaydi.
      if (session.status === "planned") {
        send(client.ws, { type: "error", message: "Suhbat hali boshlanmadi." });
        return;
      }
      if (kickedFrom(msg.sessionId).has(client.userId)) {
        send(client.ws, { type: "kicked" });
        return;
      }

      // Bitta hisob — bitta qurilma: yangi kirgan qoladi, shu hisobning eski ulanishlari chiqariladi.
      for (const [otherWs, other] of [...clients]) {
        if (otherWs === client.ws || other.userId !== client.userId || !other.sessionId) continue;
        const oldSession = other.sessionId;
        other.sessionId = null;
        send(otherWs, { type: "kicked", reason: "replaced" });
        otherWs.close();
        if (oldSession !== msg.sessionId) await depart(db, oldSession, client.userId);
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

      // O'ziga to'liq ma'lumot. Izohlar efirda suzib o'tadi: ularning tarixi faqat admin/moderatorga beriladi.
      const [participants, recentMessages] = await Promise.all([
        live.getParticipants(db, msg.sessionId),
        canModerate(globalRole) ? live.getRecentMessages(db, msg.sessionId) : [],
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
      const body = typeof msg.body === "string" ? msg.body.trim() : "";
      if (!body || body.length > LIMITS_LIVE.messageBody) return;
      if (!chatAllowed(client.sessionId, client.userId)) {
        send(client.ws, { type: "error", message: "Juda tez yozyapsiz — bir oz kuting." });
        return;
      }
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
      chatTimes.delete(departureKey(sessionId, msg.targetUserId));
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
        // Yozuv suhbatdan mustaqil: yozayotgan admin yozuvni o'zi to'xtatguncha xona uning uchun ochiq turadi.
        const recorder = await recorderOf(db, client.sessionId);
        const endedAt = await live.endLiveSession(db, client.sessionId);
        broadcastToSession(client.sessionId, { type: "session_ended", endedAt });
        await closeMediaRoom(client.sessionId, recorder);
      }
      return;
    }

    // ── Faqat admin: yozib olishni yoqish/o'chirish (yozuvni adminning brauzeri qiladi) ──

    case "mod:recording": {
      if (!client.sessionId) return;
      if ((await getUserRole(db, client.userId)) !== "admin") {
        send(client.ws, { type: "error", message: "Yozib olishni faqat admin boshqaradi." });
        return;
      }
      const session = await live.getLiveSession(db, client.sessionId);
      if (!session || (msg.on && session.status === "planned")) {
        send(client.ws, { type: "error", message: "Suhbat boshlanmaguncha yozib bo'lmaydi." });
        return;
      }
      const on = msg.on === true;
      await live.setRecordingBy(db, client.sessionId, on ? client.userId : null);
      broadcastToSession(client.sessionId, { type: "recording", active: on, paused: on && msg.paused === true });
      return;
    }
  }
}

// ── Jonli viktorina ─────────────────────────────────────────────────

const isGameMessage = (msg: { type: string }): msg is GameClientMessage => typeof msg?.type === "string" && msg.type.startsWith("qz:");

/** Kutish xonasiga kirish-chiqishlar ketma-ket kelganda ro'yxat bir marta yuboriladi. */
const ROSTER_DEBOUNCE_MS = 250;
const rosterTimers = new Map<string, ReturnType<typeof setTimeout>>();

function quizClients(sessionId: string): Client[] {
  return [...clients.values()].filter((c) => c.quiz?.game.info.sessionId === sessionId);
}

/** Har bir ulanuvchiga o'zining holati: to'g'ri javob faqat natija bosqichida chiqadi. */
function broadcastViews(sessionId: string) {
  for (const c of quizClients(sessionId)) {
    if (c.quiz) send(c.ws, { type: "qz:view", view: c.quiz.game.view(c.userId, c.quiz.host) });
  }
}

function scheduleRoster(sessionId: string) {
  if (rosterTimers.has(sessionId)) return;
  rosterTimers.set(sessionId, setTimeout(() => {
    rosterTimers.delete(sessionId);
    broadcastViews(sessionId);
  }, ROSTER_DEBOUNCE_MS));
}

function broadcastProgress(sessionId: string) {
  const list = quizClients(sessionId);
  const game = list[0]?.quiz?.game;
  if (!game) return;
  const data = JSON.stringify({ type: "qz:progress", ...game.progress() } satisfies GameServerMessage);
  for (const c of list) if (c.ws.readyState === WebSocket.OPEN) c.ws.send(data);
}

function leaveQuiz(client: Client) {
  const quiz = client.quiz;
  if (!quiz) return;
  client.quiz = null;
  quiz.game.leave(client.userId, quiz.host);
}

async function handleQuizMessage(db: Database, client: Client, msg: GameClientMessage) {
  const fail = (message: string, fatal = false) => send(client.ws, { type: "qz:error", message, fatal });
  try {
    switch (msg.type) {
      case "qz:join": {
        const userId = await userIdForToken(db, msg.token);
        if (process.env.LIVE_REQUIRE_LOGIN !== "0" && !(await isSignedIn(db, userId))) {
          return fail("Viktorinaga qo'shilish uchun avval hisobingizga kiring.", true);
        }
        const { schema } = await import("@/server/db/client");
        const { eq } = await import("drizzle-orm");
        const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
        const host = canModerate(user?.role ?? "user");
        const sessionId = String(msg.sessionId);
        let game: QuizGame;
        try {
          game = await openGame(db, sessionId, {
            onPhase: () => broadcastViews(sessionId),
            onRoster: () => scheduleRoster(sessionId),
            onProgress: () => broadcastProgress(sessionId),
          });
        } catch (error) {
          // Vaqti kelmagan yoki o'tib ketgan viktorinaga qayta ulanishning foydasi yo'q.
          return fail(error instanceof ApiException ? error.message : "Viktorinani ochib bo'lmadi.", true);
        }

        // Bitta hisob — bitta qurilma: shu hisobning eski ulanishi chiqariladi.
        for (const [otherWs, other] of [...clients]) {
          if (otherWs === client.ws || other.userId !== userId || !other.quiz) continue;
          const old = other.quiz;
          other.quiz = null;
          send(otherWs, { type: "qz:kicked", reason: "replaced" });
          otherWs.close();
          if (old.game !== game) old.game.leave(userId, old.host);
        }
        leaveQuiz(client);
        client.userId = userId;
        client.userName = user?.name ?? "Kitobxon";
        game.join(userId, client.userName, host);
        client.quiz = { game, host };
        send(client.ws, { type: "qz:view", view: game.view(userId, host) });
        return;
      }

      case "qz:leave":
        leaveQuiz(client);
        return;

      case "qz:answer": {
        const quiz = client.quiz;
        if (!quiz) return fail("Avval viktorina xonasiga kiring.");
        if (quiz.game.answer(client.userId, msg.question, msg.choice)) send(client.ws, { type: "qz:ack", question: msg.question, choice: msg.choice });
        return;
      }

      case "qz:start":
      case "qz:reveal":
      case "qz:next":
      case "qz:reset": {
        const quiz = client.quiz;
        if (!quiz) return fail("Avval viktorina xonasiga kiring.");
        // Rol har buyruqda bazadan o'qiladi: admin rolni olib qo'ysa darhol kuchga kiradi.
        const host = canModerate(await getUserRole(db, client.userId));
        if (msg.type === "qz:start") quiz.game.start(host, await loadQuestions(db, quiz.game.info.quizId));
        else if (msg.type === "qz:reveal") quiz.game.revealByHost(host);
        else if (msg.type === "qz:next") quiz.game.next(host);
        else quiz.game.reset(host);
        return;
      }
    }
  } catch (error) {
    if (error instanceof GameError || error instanceof ApiException) return fail(error.message);
    console.error("[ws] viktorina xatosi", error);
    fail("Xatolik yuz berdi. Qayta urinib ko'ring.");
  }
}

async function recorderOf(db: Database, sessionId: string): Promise<string | null> {
  const { schema } = await import("@/server/db/client");
  const { eq } = await import("drizzle-orm");
  const row = await db.query.liveSessions.findFirst({
    where: eq(schema.liveSessions.id, sessionId),
    columns: { recordingBy: true },
  });
  return row?.recordingBy ?? null;
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
