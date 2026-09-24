/**
 * Jonli suhbat WebSocket klienti.
 *
 * Brauzerdan ws://server:8788 ga ulanadi va tipli xabar almashinuvini
 * boshqaradi. Token — POST /auth/session (wantToken:true) orqali olinadi.
 */
import type {
  LiveSession,
  LiveParticipant,
  LiveMessage,
  WsClientMessage,
  WsServerMessage,
} from "@/shared/contract/live";
import { API_PREFIX } from "./config";

export type LiveConnectionState = "idle" | "connecting" | "joined" | "error";

export type LiveEventMap = {
  state: LiveConnectionState;
  joined: {
    session: LiveSession;
    participants: LiveParticipant[];
    recentMessages: LiveMessage[];
  };
  chat: LiveMessage;
  participant_joined: { participant: LiveParticipant; count: number };
  participant_left: { userId: string; count: number };
  hand_update: { userId: string; raised: boolean };
  role_update: { userId: string; role: string };
  session_started: { startedAt: string };
  session_ended: { endedAt: string };
  error: string;
};

type Listener<K extends keyof LiveEventMap> = (data: LiveEventMap[K]) => void;

function resolveWsUrl(): string {
  const configured = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process?.env?.NEXT_PUBLIC_WS_URL;
  if (configured) return configured.replace(/\/+$/, "");

  if (typeof globalThis.location !== "undefined") {
    const loc = globalThis.location;
    const proto = loc.protocol === "https:" ? "wss:" : "ws:";
    const host = loc.hostname;
    return `${proto}//${host}:8788`;
  }

  return "ws://localhost:8788";
}

export class LiveClient {
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private listeners = new Map<string, Set<Function>>();
  private _state: LiveConnectionState = "idle";
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private sessionId: string | null = null;

  get state() {
    return this._state;
  }

  on<K extends keyof LiveEventMap>(event: K, fn: Listener<K>): () => void {
    const set = this.listeners.get(event) ?? new Set();
    set.add(fn);
    this.listeners.set(event, set);
    return () => set.delete(fn);
  }

  private emit<K extends keyof LiveEventMap>(event: K, data: LiveEventMap[K]) {
    this.listeners.get(event)?.forEach((fn) => fn(data));
  }

  private setState(s: LiveConnectionState) {
    this._state = s;
    this.emit("state", s);
  }

  private async getToken(): Promise<string> {
    if (this.token) return this.token;

    const res = await fetch(`${API_PREFIX}/auth/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ platform: "web", wantToken: true }),
    });
    if (!res.ok) throw new Error("Token olib bo'lmadi.");
    const data: { data: { token: string } } = await res.json();
    this.token = data.data.token;
    return this.token;
  }

  async join(sessionId: string) {
    this.sessionId = sessionId;
    this.setState("connecting");

    try {
      const token = await this.getToken();
      const wsUrl = resolveWsUrl();

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.send({ type: "join", sessionId, token });
      };

      this.ws.onmessage = (event) => {
        const msg: WsServerMessage = JSON.parse(event.data);
        this.handleMessage(msg);
      };

      this.ws.onclose = () => {
        if (this._state === "joined") {
          this.setState("error");
          this.scheduleReconnect();
        } else {
          this.setState("idle");
        }
      };

      this.ws.onerror = () => {
        this.setState("error");
      };
    } catch {
      this.setState("error");
    }
  }

  private handleMessage(msg: WsServerMessage) {
    switch (msg.type) {
      case "joined":
        this.setState("joined");
        this.emit("joined", {
          session: msg.session,
          participants: msg.participants,
          recentMessages: msg.recentMessages,
        });
        break;
      case "error":
        this.emit("error", msg.message);
        break;
      case "chat":
        this.emit("chat", msg.message);
        break;
      case "participant_joined":
        this.emit("participant_joined", {
          participant: msg.participant,
          count: msg.count,
        });
        break;
      case "participant_left":
        this.emit("participant_left", {
          userId: msg.userId,
          count: msg.count,
        });
        break;
      case "hand_update":
        this.emit("hand_update", {
          userId: msg.userId,
          raised: msg.raised,
        });
        break;
      case "role_update":
        this.emit("role_update", {
          userId: msg.userId,
          role: msg.role,
        });
        break;
      case "session_started":
        this.emit("session_started", { startedAt: msg.startedAt });
        break;
      case "session_ended":
        this.emit("session_ended", { endedAt: msg.endedAt });
        break;
    }
  }

  private send(msg: WsClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  sendChat(body: string) {
    this.send({ type: "chat", body });
  }

  toggleHand(raised: boolean) {
    this.send({ type: "hand", raised });
  }

  grantSpeaker(targetUserId: string) {
    this.send({ type: "mod:grant_speaker", targetUserId });
  }

  revokeSpeaker(targetUserId: string) {
    this.send({ type: "mod:revoke_speaker", targetUserId });
  }

  startSession() {
    this.send({ type: "mod:start" });
  }

  endSession() {
    this.send({ type: "mod:end" });
  }

  leave() {
    this.clearReconnect();
    this.sessionId = null;
    if (this.ws) {
      this.send({ type: "leave" });
      this.ws.close();
      this.ws = null;
    }
    this.setState("idle");
  }

  private scheduleReconnect() {
    this.clearReconnect();
    if (this.sessionId) {
      this.reconnectTimer = setTimeout(() => {
        if (this.sessionId) this.join(this.sessionId);
      }, 3000);
    }
  }

  private clearReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  dispose() {
    this.leave();
    this.listeners.clear();
  }
}

// ── REST API ───────────────────────────────────────────────────────────

export async function fetchLiveSessions(): Promise<LiveSession[]> {
  const res = await fetch(`${API_PREFIX}/live`, { credentials: "include" });
  if (!res.ok) return [];
  const data: { data: LiveSession[] } = await res.json();
  return data.data ?? [];
}

export async function createLiveSession(input: {
  bookTitle: string;
  title: string;
  scheduledAt: string;
}): Promise<LiveSession | null> {
  const res = await fetch(`${API_PREFIX}/live`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!res.ok) return null;
  const data: { data: LiveSession } = await res.json();
  return data.data ?? null;
}
