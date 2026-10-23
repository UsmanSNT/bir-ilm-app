/**
 * Shaxsiy bildirishnomalar (qo'ng'iroqcha): postingizga reaksiya, izoh va izohingizga javob.
 * Hamma ekranlar bitta so'rovdan foydalanadi (modul darajasida bitta taymer): 45 soniyada bir marta,
 * faqat sahifa ko'rinib turganda. Ochilgan bildirishnoma darhol ro'yxatdan olinadi, keyin serverda o'chiriladi.
 */
"use client";

import { useSyncExternalStore } from "react";
import type { MarkNotificationsReadInput, NotificationInbox, ReceivedReaction } from "@/shared/contract";
import { API_PREFIX } from "./config";

type Envelope<T> = { data?: T; error?: { message?: string } };

const EMPTY: NotificationInbox = { items: [], unread: 0 };
const POLL_MS = 45_000;
const REFRESH_EVENT = "bir-notifications-refresh";

let state = EMPTY;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_PREFIX}${path}`, { credentials: "include", cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const body = (await res.json().catch(() => ({}))) as Envelope<T>;
  if (!res.ok || body.data === undefined) throw new Error(body.error?.message ?? "So'rov bajarilmadi.");
  return body.data;
}

function publish(next: NotificationInbox) {
  state = next;
  listeners.forEach((listener) => listener());
}

async function load() {
  try {
    publish(await call<NotificationInbox>("/notifications"));
  } catch {
    /* tarmoq xatosi: oldingi holat qoladi */
  }
}

const tick = () => { if (document.visibilityState === "visible") void load(); };

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    void load();
    timer = setInterval(tick, POLL_MS);
    window.addEventListener(REFRESH_EVENT, tick);
    document.addEventListener("visibilitychange", tick);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      if (timer) clearInterval(timer);
      timer = null;
      window.removeEventListener(REFRESH_EVENT, tick);
      document.removeEventListener("visibilitychange", tick);
      state = EMPTY;
    }
  };
}

const subscribeNothing = () => () => {};

/** Mehmon (ro'yxatdan o'tmagan) uchun so'rov yuborilmaydi — unga bildirishnoma kelmaydi. */
export function useNotifications(enabled: boolean): NotificationInbox {
  const snapshot = useSyncExternalStore(enabled ? subscribe : subscribeNothing, () => state, () => EMPTY);
  return enabled ? snapshot : EMPTY;
}

/** Qo'ng'iroqcha ochilganda — eng yangi holatni darrov olish. */
export const refreshNotifications = () => window.dispatchEvent(new Event(REFRESH_EVENT));

/**
 * Ochilgan bildirishnoma(lar) ro'yxatdan darhol olinadi. Keyin holat qayta yuklanadi: server xato bersa
 * bildirishnoma qaytadi, 50 tadan keyingilari esa ro'yxatga chiqadi. Hech qachon xato tashlamaydi.
 */
export async function markNotificationsRead(input: MarkNotificationsReadInput): Promise<void> {
  const ids = new Set(input.ids ?? []);
  const removed = input.all ? state.items.length : state.items.filter((item) => ids.has(item.id)).length;
  publish(input.all
    ? EMPTY
    : { items: state.items.filter((item) => !ids.has(item.id)), unread: Math.max(0, state.unread - removed) });
  try {
    await call<{ unread: number }>("/notifications/read", { method: "POST", body: JSON.stringify(input) });
  } catch {
    /* quyidagi qayta yuklash haqiqiy holatni tiklaydi */
  }
  if (listeners.size) void load();
}

/** Faollik → Reaksiyalar: boshqalar postlaringizga bildirgan reaksiyalar. */
export const fetchReceivedReactions = () => call<ReceivedReaction[]>("/community/reactions/received");
