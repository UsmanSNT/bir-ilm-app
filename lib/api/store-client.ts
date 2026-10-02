/** Book Store uchun REST yordamchilari va hook'lar (web va mobil ilova uchun bir xil). */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  STORE_LIMITS,
  type CartLine,
  type OrderStatus,
  type PlaceOrderInput,
  type ReviewInput,
  type ReviewSummary,
  type AdminStoreChat,
  type StoreAiInput,
  type StoreBook,
  type StoreChat,
  type StoreMessage,
  type StoreThread,
  type StoreOrder,
} from "@/shared/contract";
import { API_PREFIX, absoluteUrl } from "./config";

type Envelope<T> = { data?: T; error?: { code?: string; message?: string } };

/** Server xatosi: `status` 401 bo'lsa — kirish kerak. */
export class StoreError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "StoreError";
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_PREFIX}${path}`, {
      credentials: "include",
      cache: "no-store",
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new StoreError("Internet aloqasini tekshiring.", 0);
  }
  const body = (await res.json().catch(() => ({}))) as Envelope<T>;
  if (!res.ok || body.data === undefined) throw new StoreError(body.error?.message ?? "So'rov bajarilmadi.", res.status);
  return body.data;
}

const withAbsoluteCover = (book: StoreBook): StoreBook => ({ ...book, coverUrl: absoluteUrl(book.coverUrl) });

export const STORE_CHANGED = "bir-store-changed";
export const notifyStoreChanged = () => window.dispatchEvent(new Event(STORE_CHANGED));

/** Vitrina (sharh yozilganda yoki narx o'zgarganda qayta yuklanadi). */
export function useStoreBooks() {
  const [state, setState] = useState<{ items: StoreBook[]; loading: boolean; error: string }>({ items: [], loading: true, error: "" });
  const reload = useCallback(() => {
    call<{ items: StoreBook[] }>("/store/books")
      .then((data) => setState({ items: data.items.map(withAbsoluteCover), loading: false, error: "" }))
      .catch((e: Error) => setState((s) => ({ ...s, loading: false, error: e.message })));
  }, []);
  useEffect(() => {
    reload();
    window.addEventListener(STORE_CHANGED, reload);
    window.addEventListener("bir-catalog-changed", reload);
    return () => {
      window.removeEventListener(STORE_CHANGED, reload);
      window.removeEventListener("bir-catalog-changed", reload);
    };
  }, [reload]);
  return { ...state, reload };
}

/**
 * Savat: o'zgarish darhol ekranda, serverga qisqa kechikish bilan yoziladi
 * (tez-tez bosilganda bitta so'rov). Server rad etsa — server holatiga qaytadi.
 */
export function useCart(books: StoreBook[]) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<CartLine[] | null>(null);

  const load = useCallback(() => {
    call<{ items: CartLine[] }>("/store/cart")
      .then((data) => setLines(data.items))
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);
  useEffect(load, [load]);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const items = pending.current;
    pending.current = null;
    if (!items) return;
    try {
      const data = await call<{ items: CartLine[] }>("/store/cart", { method: "PUT", body: JSON.stringify({ items }) });
      if (!pending.current) setLines(data.items);
    } catch {
      load();
    }
  }, [load]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const update = useCallback((next: CartLine[]) => {
    setLines(next);
    pending.current = next;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 400);
  }, [flush]);

  const setQty = useCallback((bookId: string, qty: number) => {
    const clamped = Math.min(Math.max(0, qty), STORE_LIMITS.maxQty);
    const exists = lines.some((l) => l.bookId === bookId);
    const next = clamped === 0
      ? lines.filter((l) => l.bookId !== bookId)
      : exists ? lines.map((l) => (l.bookId === bookId ? { ...l, qty: clamped } : l)) : [...lines, { bookId, qty: clamped }];
    update(next);
  }, [lines, update]);

  const add = useCallback((bookId: string) => {
    const current = lines.find((l) => l.bookId === bookId)?.qty ?? 0;
    setQty(bookId, current + 1);
  }, [lines, setQty]);

  const byId = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);
  const items = useMemo(
    () => lines.flatMap((l) => { const book = byId.get(l.bookId); return book ? [{ book, qty: l.qty }] : []; }),
    [lines, byId],
  );
  const count = items.reduce((sum, l) => sum + l.qty, 0);
  const total = items.reduce((sum, l) => sum + l.book.price * l.qty, 0);

  /** Buyurtmadan oldin: kutilayotgan o'zgarish serverga yetib borsin (summa serverdagi savatdan). */
  const commit = flush;
  const clear = useCallback(() => { pending.current = null; setLines([]); }, []);

  return { ready, items, count, total, setQty, add, commit, clear, reload: load };
}

export const fetchOrders = () => call<{ items: StoreOrder[] }>("/store/orders").then((d) => d.items);
export const placeOrder = (input: PlaceOrderInput) =>
  call<StoreOrder>("/store/orders", { method: "POST", body: JSON.stringify(input) });

export const fetchReviews = (bookId: string) => call<ReviewSummary>(`/books/${encodeURIComponent(bookId)}/reviews`);
export const saveReview = (bookId: string, input: ReviewInput) =>
  call<ReviewSummary>(`/books/${encodeURIComponent(bookId)}/reviews`, { method: "PUT", body: JSON.stringify(input) });
export const deleteReview = (bookId: string) =>
  call<ReviewSummary>(`/books/${encodeURIComponent(bookId)}/reviews`, { method: "DELETE" });

export const askStoreAi = (input: StoreAiInput) =>
  call<{ text: string }>("/store/ai", { method: "POST", body: JSON.stringify(input) }).then((d) => d.text);

export const fetchAdminOrders = (status?: OrderStatus) =>
  call<{ items: StoreOrder[] }>(`/admin/orders${status ? `?status=${status}` : ""}`).then((d) => d.items);
export const setAdminOrderStatus = (id: string, status: OrderStatus) =>
  call<StoreOrder>(`/admin/orders/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status }) });

/** Takroriy yuborishda bir xil bo'ladigan buyurtma raqami. */
export const newOrderId = () => `BI-${crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;

// ── Do'kon chati ────────────────────────────────────────────────────

const withChatUrl = (m: StoreMessage): StoreMessage => ({ ...m, imageUrl: absoluteUrl(m.imageUrl) });

export const fetchChat = (after = 0) =>
  call<StoreChat>(`/store/chat?after=${after}`).then((c) => ({ ...c, messages: c.messages.map(withChatUrl) }));
export const fetchChatUnread = () => call<{ unread: number }>("/store/chat/unread").then((d) => d.unread);
export const sendChatMessage = (body: string, bookId?: string) =>
  call<StoreMessage>("/store/chat", { method: "POST", body: JSON.stringify({ body, ...(bookId ? { bookId } : {}) }) }).then(withChatUrl);
export const sendChatImage = (file: Blob) =>
  call<StoreMessage>("/store/chat/image", { method: "POST", body: file, headers: { "Content-Type": file.type } }).then(withChatUrl);

export const fetchAdminThreads = () => call<{ items: StoreThread[]; unread: number }>("/admin/store-chat");
export const fetchAdminThread = (userId: string, after = 0) =>
  call<AdminStoreChat>(`/admin/store-chat/${encodeURIComponent(userId)}?after=${after}`).then((c) => ({ ...c, messages: c.messages.map(withChatUrl) }));
export const sendAdminReply = (userId: string, body: string) =>
  call<StoreMessage>(`/admin/store-chat/${encodeURIComponent(userId)}`, { method: "POST", body: JSON.stringify({ body }) }).then(withChatUrl);
export const sendAdminImage = (userId: string, file: Blob) =>
  call<StoreMessage>(`/admin/store-chat/${encodeURIComponent(userId)}/image`, { method: "POST", body: file, headers: { "Content-Type": file.type } }).then(withChatUrl);
