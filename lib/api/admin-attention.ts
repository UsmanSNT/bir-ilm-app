/**
 * Admin e'tibori: yangi buyurtmalar va o'qilmagan do'kon chatlari soni.
 * Hamma ekranlar bitta so'rovdan foydalanadi (modul darajasida bitta taymer): 45 soniyada bir marta,
 * faqat sahifa ko'rinib turganda. Soni oshsa, `onNew` chaqiriladi (toast uchun).
 */
"use client";

import { useEffect, useSyncExternalStore } from "react";
import { fetchAdminOrders, fetchAdminThreads } from "./store-client";

export type AdminAttention = { orders: number; chats: number; total: number };

const EMPTY: AdminAttention = { orders: 0, chats: 0, total: 0 };
const POLL_MS = 45_000;
const REFRESH_EVENT = "bir-admin-attention-refresh";

let state = EMPTY;
let loaded = false;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();
const newHandlers = new Set<(change: { orders: number; chats: number }) => void>();

async function load() {
  try {
    const [orders, threads] = await Promise.all([fetchAdminOrders("new"), fetchAdminThreads()]);
    const next: AdminAttention = { orders: orders.length, chats: threads.unread, total: orders.length + threads.unread };
    const grew = loaded ? { orders: Math.max(0, next.orders - state.orders), chats: Math.max(0, next.chats - state.chats) } : null;
    loaded = true;
    if (next.orders !== state.orders || next.chats !== state.chats) {
      state = next;
      listeners.forEach((l) => l());
    }
    if (grew && (grew.orders || grew.chats)) newHandlers.forEach((h) => h(grew));
  } catch {
    /* tarmoq yoki ruxsat xatosi: oldingi son qoladi */
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
      loaded = false;
    }
  };
}

/** Admin bo'lmagan foydalanuvchi uchun so'rov yuborilmaydi (bo'sh holat qaytadi). */
export function useAdminAttention(enabled: boolean, onNew?: (change: { orders: number; chats: number }) => void): AdminAttention {
  const snapshot = useSyncExternalStore(enabled ? subscribe : subscribeNothing, () => state, () => EMPTY);
  useEffect(() => {
    if (!enabled || !onNew) return;
    newHandlers.add(onNew);
    return () => { newHandlers.delete(onNew); };
  }, [enabled, onNew]);
  return enabled ? snapshot : EMPTY;
}

const subscribeNothing = () => () => {};

/** Buyurtma holati yoki chat o'zgargach sonni darrov yangilash. */
export const refreshAdminAttention = () => window.dispatchEvent(new Event(REFRESH_EVENT));
