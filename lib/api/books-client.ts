/** Kitoblar katalogi: yuklash, tahrirlash va media fayllarni bo'laklab yuklash. */
"use client";

import { useCallback, useEffect, useState } from "react";
import { BOOK_LIMITS, type Book, type CreateBookInput, type UpdateBookInput } from "@/shared/contract";
import { API_PREFIX, absoluteUrl } from "./config";

type Envelope<T> = { ok?: boolean; data?: T; error?: { message?: string; received?: number } };

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_PREFIX}${path}`, {
    credentials: "include",
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = (await res.json().catch(() => ({}))) as Envelope<T>;
  if (!res.ok || body.data === undefined) throw new Error(body.error?.message ?? "So'rov bajarilmadi.");
  return body.data;
}

const CHANGED = "bir-catalog-changed";
export const notifyCatalogChanged = () => window.dispatchEvent(new Event(CHANGED));

export type Catalog = { items: Book[]; active: Book | null; loading: boolean; error: string };

/** Katalog: bir joyda o'zgarsa (kitob qo'shildi/tahrirlandi), hamma joyda yangilanadi. */
export function useCatalog(): Catalog & { reload: () => void } {
  const [state, setState] = useState<Catalog>({ items: [], active: null, loading: true, error: "" });
  const reload = useCallback(() => {
    call<{ items: Book[]; activeBookId: string | null }>("/books")
      .then((data) => {
        const items = data.items.map((b) => ({ ...b, coverUrl: absoluteUrl(b.coverUrl), audioUrl: absoluteUrl(b.audioUrl) }));
        setState({ items, active: items.find((b) => b.id === data.activeBookId) ?? null, loading: false, error: "" });
      })
      .catch((e: Error) => setState((s) => ({ ...s, loading: false, error: e.message })));
  }, []);
  useEffect(() => {
    reload();
    window.addEventListener(CHANGED, reload);
    return () => window.removeEventListener(CHANGED, reload);
  }, [reload]);
  return { ...state, reload };
}

export const createBook = (input: CreateBookInput) => call<Book>("/books", { method: "POST", body: JSON.stringify(input) });
export const updateBook = (id: string, input: UpdateBookInput) =>
  call<Book>(`/books/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
export const deleteBook = (id: string) => call(`/books/${encodeURIComponent(id)}`, { method: "DELETE" });

/** Audio davomiyligini brauzerning o'zi o'qiydi (serverda dekoder kerak bo'lmaydi). */
export function audioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const probe = new Audio();
    const done = (seconds: number) => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(seconds) ? Math.round(seconds) : 0);
    };
    probe.preload = "metadata";
    probe.onloadedmetadata = () => done(probe.duration);
    probe.onerror = () => done(0);
    probe.src = url;
  });
}

/**
 * Faylni 8 MB bo'laklarda yuklaydi. Ulanish uzilsa, serverdan qancha kelganini
 * so'rab, o'sha joydan davom etadi (bir necha marta qayta urinadi).
 */
export async function uploadBookMedia(
  bookId: string,
  kind: "cover" | "audio",
  file: File,
  onProgress: (sent: number, total: number) => void,
  signal?: AbortSignal,
): Promise<Book> {
  const url = `${API_PREFIX}/books/${encodeURIComponent(bookId)}/media?kind=${kind}`;
  const type = file.type || (kind === "audio" ? "audio/mpeg" : "image/jpeg");
  const seconds = kind === "audio" ? await audioDuration(file) : 0;

  // Oldingi uzilgan yuklash o'sha fayl uchun bo'lsa — davom ettiramiz.
  let offset = 0;
  const status = await fetch(url, { credentials: "include", signal }).then((r) => r.json()).catch(() => null) as Envelope<{ received: number; total: number; type: string | null }> | null;
  if (status?.data && status.data.total === file.size && status.data.type === type) offset = status.data.received;

  let failures = 0;
  while (true) {
    const end = Math.min(file.size, offset + BOOK_LIMITS.chunkBytes);
    onProgress(offset, file.size);
    try {
      const res = await fetch(url, {
        method: "PUT",
        credentials: "include",
        signal,
        body: file.slice(offset, end),
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Upload-Offset": String(offset),
          "X-Upload-Total": String(file.size),
          "X-Upload-Type": type,
          ...(end === file.size && seconds ? { "X-Audio-Seconds": String(seconds) } : {}),
        },
      });
      const body = (await res.json().catch(() => ({}))) as Envelope<{ done: boolean; received: number; book?: Book }>;
      if (res.status === 409 && typeof body.error?.received === "number") {
        offset = body.error.received;
        continue;
      }
      if (!res.ok || !body.data) throw Object.assign(new Error(body.error?.message ?? "Yuklab bo'lmadi."), { fatal: res.status >= 400 && res.status < 500 });
      failures = 0;
      offset = body.data.received;
      if (body.data.done && body.data.book) {
        onProgress(file.size, file.size);
        return body.data.book;
      }
    } catch (error) {
      if (signal?.aborted || (error as { fatal?: boolean }).fatal || ++failures > 5) throw error;
      // Tarmoq uzildi — biroz kutib, server qayerda to'xtaganini so'raymiz.
      await new Promise((r) => setTimeout(r, 1500 * failures));
      const again = await fetch(url, { credentials: "include", signal }).then((r) => r.json()).catch(() => null) as Envelope<{ received: number }> | null;
      if (again?.data) offset = again.data.received;
    }
  }
}
