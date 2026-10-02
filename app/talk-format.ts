"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { LiveSession } from "@/shared/contract/live";

// Suhbatlar uchun umumiy: sana ko'rinishi, e'lon matni va eslatmalar (Suhbatlar va Home).

export const MONTHS = ["yan", "fev", "mar", "apr", "may", "iyun", "iyul", "avg", "sent", "okt", "noy", "dek"];
export const WEEKDAYS = ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"];

export const dayMonth = (d: Date) => `${d.getDate()}-${MONTHS[d.getMonth()]}`;
export const clock = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/** "2 kun 5 soat qoldi", "3 soat 10 daqiqa qoldi", "Boshlanishi kutilmoqda". */
export function countdown(iso: string, now = Date.now()) {
  const left = Date.parse(iso) - now;
  if (left <= 0) return "Boshlanishi kutilmoqda";
  const minutes = Math.ceil(left / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days) return `${days} kun ${hours} soat qoldi`;
  if (hours) return `${hours} soat ${minutes % 60} daqiqa qoldi`;
  return `${minutes} daqiqa qoldi`;
}

export type CountdownParts = {
  /** Boshlanish vaqti keldi yoki o'tdi. */
  done: boolean;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** Boshlanish vaqtidan necha millisekund o'tgan (kechikish); done bo'lmasa 0. */
  lateMs: number;
};

/** Boshlanishigacha kun/soat/daqiqa/soniya. Noto'g'ri sana yoki o'tib ketgan vaqt — `done`. */
export function countdownParts(iso: string, now = Date.now()): CountdownParts {
  const target = Date.parse(iso);
  if (Number.isNaN(target) || target <= now) {
    return { done: true, days: 0, hours: 0, minutes: 0, seconds: 0, lateMs: Number.isNaN(target) ? 0 : now - target };
  }
  const total = Math.ceil((target - now) / 1000);
  return {
    done: false,
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
    lateMs: 0,
  };
}

const two = (n: number) => String(n).padStart(2, "0");

/** Qisqa ko'rinish: "2 kun 05:10:03" yoki "12:03" (soatsiz). */
export function countdownShort(iso: string, now = Date.now()): string {
  const c = countdownParts(iso, now);
  if (c.done) return "Boshlanishi kutilmoqda";
  const time = c.hours || c.days ? `${two(c.hours)}:${two(c.minutes)}:${two(c.seconds)}` : `${two(c.minutes)}:${two(c.seconds)}`;
  return c.days ? `${c.days} kun ${time}` : time;
}

/** Hozirgi vaqt: har `intervalMs` da yangilanadi (hisoblagichlar uchun). Faqat kerakli komponentda ishlating. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** Bosh sahifa yangiliklari va qo'ng'iroqcha uchun e'lon (vaqt foydalanuvchining mahalliy vaqtida). */
export function talkAnnouncement(bookTitle: string, title: string, when: Date) {
  return {
    title: `Yangi suhbat: «${bookTitle}»`,
    body:
      `«${bookTitle}» kitobi bo‘yicha jonli suhbat — ${title}.\n\n` +
      `${dayMonth(when)}, ${WEEKDAYS[when.getDay()]}, soat ${clock(when)} da. ` +
      `«Suhbatlar» bo‘limidan qo‘shiling yoki eslatma qo‘yib qo‘ying.`,
  };
}

/** Suhbat vaqti o'zgarganda bosh sahifa uchun e'lon. */
export function talkRescheduled(bookTitle: string, title: string, when: Date) {
  return {
    title: `Suhbat vaqti o‘zgardi: «${bookTitle}»`,
    body:
      `«${bookTitle}» kitobi bo‘yicha jonli suhbat — ${title} — yangi vaqtda bo‘ladi.\n\n` +
      `${dayMonth(when)}, ${WEEKDAYS[when.getDay()]}, soat ${clock(when)} da. Eslatma qo‘ygan bo‘lsangiz, u yangi vaqtga o‘tdi.`,
  };
}

/** `<input type="datetime-local">` qiymati (mahalliy vaqt). */
export function localInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Yaqin suhbat: avval jonli, keyin eng yaqini. `bookTitle` berilsa, o'sha kitob suhbati afzal. */
export function nextTalk(sessions: LiveSession[], bookTitle?: string): LiveSession | null {
  const open = sessions
    .filter((s) => s.status !== "ended")
    .sort((a, b) => (a.status === "live" ? 0 : 1) - (b.status === "live" ? 0 : 1) || Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
  const key = bookTitle?.trim().toLowerCase();
  return (key && open.find((s) => s.bookTitle.trim().toLowerCase() === key)) || open[0] || null;
}

/** Suhbat yaratilganda/o'chirilganda Home va Suhbatlar ro'yxatini yangilash. */
export const TALKS_CHANGED = "bir-talks-changed";
export const notifyTalksChanged = () => window.dispatchEvent(new Event(TALKS_CHANGED));

// ── Eslatmalar (faqat shu qurilmada) ──────────────────────────────

const REMINDERS_KEY = "bir-live-reminders";
const REMINDERS_EVENT = "bir-live-reminders";

function readRaw() {
  try {
    return localStorage.getItem(REMINDERS_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

function parse(raw: string): string[] {
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(REMINDERS_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(REMINDERS_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useTalkReminders(): string[] {
  return parse(useSyncExternalStore(subscribe, readRaw, () => "[]"));
}

/** Eslatmani yoqadi/o'chiradi; yangi holatni qaytaradi (true — qo'yildi). */
export function toggleTalkReminder(id: string): boolean {
  const list = parse(readRaw());
  const on = !list.includes(id);
  try {
    localStorage.setItem(REMINDERS_KEY, JSON.stringify(on ? [...list, id] : list.filter((x) => x !== id)));
  } catch {
    /* shaxsiy rejim */
  }
  window.dispatchEvent(new Event(REMINDERS_EVENT));
  return on;
}
