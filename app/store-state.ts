"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { books } from "./app-data";
import { getMeta, MAX_QTY, promoCodes, type CartLine, type Order } from "./store-data";

const KEY = "bir-store-v1";
type Persisted = { cart: Record<string, number>; orders: Order[]; promo: string };
const empty: Persisted = { cart: {}, orders: [], promo: "" };

function load(): Persisted {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Persisted> | null;
    if (!raw) return empty;
    const cart: Record<string, number> = {};
    for (const [id, qty] of Object.entries(raw.cart ?? {})) {
      if (books.some(b => b.id === id) && Number.isInteger(qty) && qty > 0) cart[id] = Math.min(qty, MAX_QTY);
    }
    return {
      cart,
      orders: Array.isArray(raw.orders) ? raw.orders : [],
      promo: typeof raw.promo === "string" && raw.promo in promoCodes ? raw.promo : "",
    };
  } catch {
    return empty;
  }
}

export function useStoreState() {
  const [state, setState] = useState<Persisted>(empty);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    queueMicrotask(() => { setState(load()); setReady(true); });
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* xotira to'la yoki yopiq */ }
  }, [state, ready]);

  const setQty = useCallback((id: string, qty: number) => setState(s => {
    const cart = { ...s.cart };
    if (qty <= 0) delete cart[id]; else cart[id] = Math.min(qty, MAX_QTY);
    return { ...s, cart };
  }), []);
  const add = useCallback((id: string) => setState(s => ({ ...s, cart: { ...s.cart, [id]: Math.min((s.cart[id] ?? 0) + 1, MAX_QTY) } })), []);
  const applyPromo = useCallback((code: string) => {
    const normalized = code.trim().toUpperCase();
    if (!(normalized in promoCodes)) return false;
    setState(s => ({ ...s, promo: normalized }));
    return true;
  }, []);
  const clearPromo = useCallback(() => setState(s => ({ ...s, promo: "" })), []);

  const lines: CartLine[] = useMemo(() => Object.entries(state.cart).flatMap(([id, qty]) => {
    const book = books.find(b => b.id === id);
    return book ? [{ book, meta: getMeta(book), qty }] : [];
  }), [state.cart]);
  const count = lines.reduce((sum, l) => sum + l.qty, 0);
  const subtotal = lines.reduce((sum, l) => sum + l.meta.price * l.qty, 0);
  const percent = state.promo ? promoCodes[state.promo] ?? 0 : 0;
  const discount = Math.round(subtotal * percent / 100);

  const placeOrder = useCallback((info: Pick<Order, "name" | "phone" | "address" | "payment">): Order | null => {
    if (!lines.length) return null;
    const order: Order = {
      id: `ZB-${Date.now().toString(36).toUpperCase()}`,
      lines: lines.map(l => ({ bookId: l.book.id, title: l.book.title, qty: l.qty, price: l.meta.price })),
      subtotal, discount, total: subtotal - discount, ...info, createdAt: new Date().toISOString(),
    };
    setState(s => ({ cart: {}, promo: "", orders: [order, ...s.orders] }));
    return order;
  }, [lines, subtotal, discount]);

  return { lines, count, subtotal, discount, total: subtotal - discount, promo: state.promo, percent, orders: state.orders, setQty, add, applyPromo, clearPromo, placeOrder };
}
