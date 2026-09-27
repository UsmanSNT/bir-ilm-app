"use client";

import { useSyncExternalStore } from "react";
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
