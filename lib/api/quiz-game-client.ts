/**
 * Jonli viktorina o'yini: WebSocket ulanishi (hook).
 *
 * Server har bir o'zgarishda shu foydalanuvchiga mos TO'LIQ holatni (`GameView`) yuboradi, shuning uchun mijoz
 * oddiy: oxirgi holatni ko'rsatadi. Aloqa uzilsa, o'zi qayta ulanadi va server joriy holatni qaytaradi.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameClientMessage, GameServerMessage, GameView } from "@/shared/contract";
import { API_PREFIX } from "./config";
import { resolveWsUrl } from "./live-client";

export type GameConnection = "connecting" | "open" | "reconnecting" | "closed";

export type GameState = {
  connection: GameConnection;
  view: GameView | null;
  /** Server soati bilan qurilma soati orasidagi farq (millisekund): server vaqti = Date.now() + offset. */
  offset: number;
  /** Savol ochiq turganda javob berganlar soni (har bir javobda yangilanadi). */
  progress: { answered: number; playerCount: number } | null;
  /** Shu savolda o'zim tanlagan variant (server tasdig'ini kutmasdan qulflash uchun). */
  mine: { question: number; choice: number } | null;
  /** Qayta ulanishning foydasi yo'q xato (kirish yopiq, hisob kerak va h.k.). */
  fatal: string | null;
  /** Shu hisob boshqa qurilmada ochildi. */
  replaced: boolean;
  /** Oxirgi oddiy xato (toast uchun); `id` har safar o'zgaradi. */
  notice: { id: number; message: string } | null;
};

const INITIAL: GameState = { connection: "connecting", view: null, offset: 0, progress: null, mine: null, fatal: null, replaced: false, notice: null };

async function fetchToken(): Promise<string> {
  const res = await fetch(`${API_PREFIX}/auth/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ platform: "web", wantToken: true }),
  });
  if (!res.ok) throw new Error("Token olib bo'lmadi.");
  const body: { data?: { token?: string | null } } = await res.json();
  if (!body.data?.token) throw new Error("Token olib bo'lmadi.");
  return body.data.token;
}

export function useQuizGame(sessionId: string) {
  const [state, setState] = useState<GameState>(INITIAL);
  const socket = useRef<WebSocket | null>(null);
  const noticeId = useRef(0);

  useEffect(() => {
    let stopped = false;
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const patch = (change: Partial<GameState>) => setState((s) => ({ ...s, ...change }));
    const stop = (change: Partial<GameState>) => {
      stopped = true;
      patch({ ...change, connection: "closed" });
      socket.current?.close();
    };

    function handle(msg: GameServerMessage) {
      switch (msg.type) {
        case "qz:view":
          setState((s) => ({
            ...s,
            connection: "open",
            view: msg.view,
            offset: msg.view.now - Date.now(),
            progress: msg.view.phase === "question" ? { answered: msg.view.answered, playerCount: msg.view.playerCount } : null,
            // Yangi savol ochilgach, avvalgi savolning tanlovi o'chadi.
            mine: s.mine && msg.view.question && s.mine.question === msg.view.question.index ? s.mine : null,
          }));
          return;
        case "qz:progress":
          patch({ progress: { answered: msg.answered, playerCount: msg.playerCount } });
          return;
        case "qz:ack":
          return;
        case "qz:kicked":
          stop({ replaced: true });
          return;
        case "qz:error":
          if (msg.fatal) stop({ fatal: msg.message });
          else patch({ notice: { id: ++noticeId.current, message: msg.message } });
          return;
      }
    }

    async function connect() {
      if (stopped) return;
      let token: string;
      try {
        token = await fetchToken();
      } catch {
        scheduleRetry();
        return;
      }
      if (stopped) return;
      const ws = new WebSocket(resolveWsUrl());
      socket.current = ws;
      ws.onopen = () => {
        attempt = 0;
        ws.send(JSON.stringify({ type: "qz:join", sessionId, token } satisfies GameClientMessage));
      };
      ws.onmessage = (event) => {
        try {
          handle(JSON.parse(String(event.data)) as GameServerMessage);
        } catch {
          /* Noto'g'ri xabar e'tiborsiz qoldiriladi. */
        }
      };
      ws.onclose = () => {
        if (socket.current === ws) socket.current = null;
        if (!stopped) scheduleRetry();
      };
      ws.onerror = () => ws.close();
    }

    function scheduleRetry() {
      if (stopped) return;
      patch({ connection: "reconnecting" });
      retry = setTimeout(connect, Math.min(1000 * 2 ** attempt++, 5000));
    }

    void connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      const ws = socket.current;
      socket.current = null;
      if (ws) {
        ws.onclose = null;
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "qz:leave" } satisfies GameClientMessage));
        ws.close();
      }
    };
  }, [sessionId]);

  const send = useCallback((msg: GameClientMessage) => {
    const ws = socket.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  const answer = useCallback((question: number, choice: number) => {
    // Tanlov darhol qulflanadi; server tasdiqlamasa (kech qolgan bo'lsa), keyingi holat uni tozalaydi.
    setState((s) => ({ ...s, mine: { question, choice } }));
    send({ type: "qz:answer", question, choice });
  }, [send]);

  return {
    ...state,
    answer,
    start: useCallback(() => send({ type: "qz:start" }), [send]),
    reveal: useCallback(() => send({ type: "qz:reveal" }), [send]),
    next: useCallback(() => send({ type: "qz:next" }), [send]),
    reset: useCallback(() => send({ type: "qz:reset" }), [send]),
  };
}
