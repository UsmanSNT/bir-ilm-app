/** Viktorinalar: ro'yxat (hook) va boshqaruv so'rovlari. */
"use client";

import { useCallback, useEffect, useState } from "react";
import type { Quiz, QuizInput, QuizJoin } from "@/shared/contract";
import { API_PREFIX } from "./config";

type Envelope<T> = { data?: T; error?: { message?: string; fields?: Record<string, string[]> } };

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_PREFIX}${path}`, { credentials: "include", cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  } catch {
    throw new Error("Internet aloqasini tekshiring.");
  }
  const body = (await res.json().catch(() => ({}))) as Envelope<T>;
  if (!res.ok || body.data === undefined) {
    const field = body.error?.fields && Object.values(body.error.fields)[0]?.[0];
    throw new Error(field ?? body.error?.message ?? "So'rov bajarilmadi.");
  }
  return body.data;
}

export const QUIZZES_CHANGED = "bir-quizzes-changed";
export const notifyQuizzesChanged = () => window.dispatchEvent(new Event(QUIZZES_CHANGED));

export function useQuizzes(): { items: Quiz[]; loading: boolean } {
  const [state, setState] = useState<{ items: Quiz[]; loading: boolean }>({ items: [], loading: true });
  const load = useCallback(() => {
    call<{ items: Quiz[] }>("/quizzes")
      .then((d) => setState({ items: d.items, loading: false }))
      .catch(() => setState((s) => ({ ...s, loading: false })));
  }, []);
  useEffect(() => {
    load();
    window.addEventListener(QUIZZES_CHANGED, load);
    return () => window.removeEventListener(QUIZZES_CHANGED, load);
  }, [load]);
  return state;
}

export const createQuiz = (input: QuizInput) => call<Quiz>("/quizzes", { method: "POST", body: JSON.stringify(input) });
export const updateQuiz = (id: string, input: QuizInput) => call<Quiz>(`/quizzes/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(input) });
export const deleteQuiz = (id: string) => call<unknown>(`/quizzes/${encodeURIComponent(id)}`, { method: "DELETE" });

export const addQuizSession = (quizId: string, startsAt: string) =>
  call<Quiz>(`/quizzes/${encodeURIComponent(quizId)}/sessions`, { method: "POST", body: JSON.stringify({ startsAt }) });
export const removeQuizSession = (quizId: string, sessionId: string) =>
  call<Quiz>(`/quizzes/${encodeURIComponent(quizId)}/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
export const joinQuizByCode = (code: string) =>
  call<QuizJoin>("/quizzes/join", { method: "POST", body: JSON.stringify({ code }) });
export const saveQuizResult = (input: { quizId: string; sessionId: string | null; correct: number; total: number }) =>
  call<{ score: number }>("/quizzes/results", { method: "POST", body: JSON.stringify(input) });
