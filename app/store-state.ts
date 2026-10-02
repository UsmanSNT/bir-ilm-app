"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { books } from "./app-data";
import { AUTH_CHANGED } from "./auth";
import { computeTotals, getMeta, MAX_QTY, promoCodes, sanitizeCart, type CartLine, type Order } from "./store-data";

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

type ServerState = { cart: Record<string, number>; promo: string; orders: Order[] };

async function fetchServer(): Promise<ServerState | null> {
  try {
    const res = await fetch("/api/store", { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<ServerState>;
    const cart = sanitizeCart(data.cart);
    if (!cart || !Array.isArray(data.orders)) return null;
    return { cart, promo: typeof data.promo === "string" && data.promo in promoCodes ? data.promo : "", orders: data.orders };
  } catch {
    return null;
  }
}

async function postServer(body: unknown): Promise<ServerState | { ok: true } | null> {
  try {
    const res = await fetch("/api/store", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return res.ok ? ((await res.json()) as ServerState | { ok: true }) : null;
  } catch {
    return null;
  }
}

export function useStoreState() {
  const [state, setState] = useState<Persisted>(empty);
  const [ready, setReady] = useState(false);
  // true: server (D1) bilan sinxron; false: server yo'q, faqat qurilma xotirasi
  const [online, setOnline] = useState(false);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const local = load();
    queueMicrotask(() => { if (!cancelled) setState(local); });
    void fetchServer().then(server => {
      if (cancelled) return;
      if (server) {
        // Mehmonning avvalgi qurilma savati serverga ko'chiriladi (server savati bo'sh bo'lsa).
        const cart = Object.keys(server.cart).length || !Object.keys(local.cart).length ? server.cart : local.cart;
        const promo = cart === server.cart ? server.promo : local.promo;
        setState({ cart, promo, orders: server.orders });
        setOnline(true);
      }
      setReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* xotira to'la yoki yopiq */ }
  }, [state, ready]);

  // Savat o'zgarsa, qisqa kechikishdan keyin serverga yoziladi.
  const cartKey = JSON.stringify([state.cart, state.promo]);
  const lastSynced = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || !online) return;
    if (lastSynced.current === null) { lastSynced.current = cartKey; return; }
    if (lastSynced.current === cartKey) return;
    syncTimer.current = setTimeout(() => {
      lastSynced.current = cartKey;
      void postServer({ type: "cart", cart: state.cart, promo: state.promo });
    }, 400);
    return () => { if (syncTimer.current) clearTimeout(syncTimer.current); };
  }, [cartKey, ready, online, state.cart, state.promo]);

  // Hisobga kirilganda/chiqilganda savat va buyurtmalar shu foydalanuvchiniki bilan almashadi.
  useEffect(() => {
    const onAuth = () => {
      void fetchServer().then(server => {
        if (!server) return;
        lastSynced.current = JSON.stringify([server.cart, server.promo]);
        setState(server);
        setOnline(true);
      });
    };
    window.addEventListener(AUTH_CHANGED, onAuth);
    return () => window.removeEventListener(AUTH_CHANGED, onAuth);
  }, []);

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
  const { subtotal, percent, discount, total } = computeTotals(state.cart, state.promo);

  /** Buyurtmani serverda saqlaydi (narx va chegirma serverda qayta hisoblanadi). Server yo'q bo'lsa null. */
  const placeOrder = useCallback(async (id: string, info: Pick<Order, "name" | "phone" | "address" | "payment">): Promise<Order | null> => {
    if (!lines.length) return null;
    if (syncTimer.current) clearTimeout(syncTimer.current);
    const result = await postServer({ type: "order", id, ...info, cart: state.cart, promo: state.promo });
    if (!result || !("orders" in result)) return null;
    const order = result.orders.find(o => o.id === id);
    if (!order) return null;
    lastSynced.current = JSON.stringify([{}, ""]);
    setState({ cart: {}, promo: "", orders: result.orders });
    return order;
  }, [lines.length, state.cart, state.promo]);

  return { lines, count, subtotal, discount, total, promo: state.promo, percent, orders: state.orders, online, setQty, add, applyPromo, clearPromo, placeOrder };
}
