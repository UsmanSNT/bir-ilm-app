"use client";

import { useMemo, useSyncExternalStore } from "react";

// Audiokitob tinglash holati: qayerda to'xtagan, qancha vaqt tinglagan. Faqat shu qurilmada.

export type LibrarySave = {
  /** Har kitob uchun tinglangan joy (soniya). */
  progress: Record<string, number>;
  finished: string[];
  speed: number;
  last: string | null;
  /** Haqiqatda tinglangan vaqt (soniya), kun bo'yicha: "2026-09-27" → 1260. */
  listenedDays: Record<string, number>;
  /** Haqiqatda tinglangan vaqt (soniya), kitob bo'yicha. */
  listenedBooks: Record<string, number>;
};

export const SPEEDS = [1, 1.25, 1.5, 2];
const KEY = "bir-ilm-library-v2";
const EVENT = "bir-library-save";
const empty: LibrarySave = { progress: {}, finished: [], speed: 1, last: null, listenedDays: {}, listenedBooks: {} };

function numbers(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (value && typeof value === "object") {
    for (const [id, n] of Object.entries(value)) if (typeof n === "number" && Number.isFinite(n)) out[id] = n;
  }
  return out;
}

export function parseLibrarySave(raw: string): LibrarySave {
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw) as Partial<LibrarySave>;
    return {
      progress: numbers(parsed.progress),
      finished: Array.isArray(parsed.finished) ? parsed.finished.filter((id) => typeof id === "string") : [],
      speed: typeof parsed.speed === "number" && SPEEDS.includes(parsed.speed) ? parsed.speed : 1,
      last: typeof parsed.last === "string" ? parsed.last : null,
      listenedDays: numbers(parsed.listenedDays),
      listenedBooks: numbers(parsed.listenedBooks),
    };
  } catch {
    return empty;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

export function readLibrarySnapshot() {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function writeLibrarySave(patch: Partial<LibrarySave>) {
  const next = { ...parseLibrarySave(readLibrarySnapshot()), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* Qurilma xotirasi to'lsa tinglash shu sessiyada davom etadi. */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useLibrarySave(): LibrarySave {
  const raw = useSyncExternalStore(subscribe, readLibrarySnapshot, () => "");
  return useMemo(() => parseLibrarySave(raw), [raw]);
}

/** Mahalliy sana kaliti ("2026-09-27"). */
export function dayKey(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Tinglangan vaqtni qo'shadi (soniya). Kunlik yozuvlar 60 kundan ortiq saqlanmaydi. */
export function addListened(bookId: string, seconds: number) {
  if (!(seconds > 0)) return;
  const save = parseLibrarySave(readLibrarySnapshot());
  const today = dayKey();
  const days = { ...save.listenedDays, [today]: (save.listenedDays[today] ?? 0) + seconds };
  const keep = Object.keys(days).sort().slice(-60);
  writeLibrarySave({
    listenedDays: Object.fromEntries(keep.map((k) => [k, days[k]])),
    listenedBooks: { ...save.listenedBooks, [bookId]: (save.listenedBooks[bookId] ?? 0) + seconds },
  });
}

/** "1 soat 5 daq", "12 daq", "40 soniya". */
export function listenedLabel(seconds: number) {
  const mins = Math.floor(seconds / 60);
  if (mins < 1) return `${Math.round(seconds)} soniya`;
  const h = Math.floor(mins / 60);
  return h ? `${h} soat ${mins % 60} daq` : `${mins} daq`;
}

/** Bosh sahifadan «davom ettirish»: Javonim ochilganda shu kitob pleerda ochilib, ijro boshlanadi. */
export const OPEN_AUDIO_EVENT = "bir-open-audio";
let pendingAudio: string | null = null;
export function requestAudio(bookId: string) {
  pendingAudio = bookId;
  window.dispatchEvent(new Event(OPEN_AUDIO_EVENT));
}
export function takeAudioRequest(): string | null {
  const id = pendingAudio;
  pendingAudio = null;
  return id;
}
