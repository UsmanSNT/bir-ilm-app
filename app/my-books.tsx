"use client";

import { useEffect, useState } from "react";
import { Store } from "lucide-react";
import { books, type Book } from "./app-data";
import type { Order } from "./store-data";

/** Foydalanuvchining buyurtma qilgan kitoblari (bazadagi buyurtmalardan). */
export default function MyBooks({ onStore, onOpen }: { onStore: () => void; onOpen: (book: Book) => void }) {
  const [orders, setOrders] = useState<Order[] | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/store", { signal: ctrl.signal, cache: "no-store" })
      .then(r => (r.ok ? r.json() : null))
      .then((d: unknown) => { const list = (d as { orders?: unknown } | null)?.orders; setOrders(Array.isArray(list) ? (list as Order[]) : []); })
      .catch(() => { if (!ctrl.signal.aborted) setOrders([]); });
    return () => ctrl.abort();
  }, []);

  const owned = new Map<string, Book>();
  for (const order of orders ?? []) for (const line of order.lines) {
    const book = books.find(b => b.id === line.bookId);
    if (book) owned.set(book.id, book);
  }

  return <section className="my-books" aria-label="Buyurtma qilgan kitoblarim">
    <div className="section-row tight"><h3>Buyurtma qilgan kitoblarim</h3><button className="text-btn" onClick={onStore}><Store size={16}/> Book Store</button></div>
    {orders === null ? <p className="readers-empty" role="status">Yuklanmoqda...</p>
      : owned.size ? <div className="my-books-row">{[...owned.values()].map(book => <button key={book.id} className="my-book" style={{ backgroundColor: book.color }} onClick={() => onOpen(book)} aria-label={`${book.title} haqida`}><strong>{book.title}</strong><small>{book.author}</small></button>)}</div>
      : <p className="readers-empty">Hali buyurtma yo‘q. To‘lov ulanguncha buyurtmalar «to‘lov kutilmoqda» holatida turadi.</p>}
  </section>;
}
