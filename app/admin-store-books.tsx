"use client";

import { useMemo, useState } from "react";
import { Eye, EyeOff, Pencil, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { notifyCatalogChanged, updateBook, useCatalog } from "@/lib/api/books-client";
import { notifyStoreChanged } from "@/lib/api/store-client";
import { formatPrice, STORE_LIMITS } from "@/shared/contract";
import type { Book } from "@/shared/contract";
import BookEditor from "./book-editor";

/** Admin: do'kon kitoblari — qo'shish, rasm/tavsif/narxni tahrirlash, sotuvdan olish. Kod emas, shu yerdan boshqariladi. */
export default function AdminStoreBooks() {
  const catalog = useCatalog();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<{ book: Book | null } | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [prices, setPrices] = useState<Record<string, string>>({});

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.items.filter((b) => !q || `${b.title} ${b.author}`.toLowerCase().includes(q));
  }, [catalog.items, query]);

  async function savePrice(book: Book, value: number) {
    if (!Number.isInteger(value) || value < 0 || value > STORE_LIMITS.maxPrice) return void toast.error("Narx butun wonda (₩), 0 dan 10 000 000 gacha bo‘lsin.");
    if (value === book.price) return;
    setSaving(book.id);
    try {
      await updateBook(book.id, { price: value });
      notifyCatalogChanged();
      notifyStoreChanged();
      toast.success(value ? `«${book.title}»: ${formatPrice(value)}` : `«${book.title}» sotuvdan olindi`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Saqlanmadi.");
    } finally {
      setSaving(null);
      setPrices((p) => { const next = { ...p }; delete next[book.id]; return next; });
    }
  }

  return (
    <div className="admin-panel admin-books">
      <p className="admin-intro">Do‘konda ko‘rinadigan kitoblar shu yerdan boshqariladi: muqova, tavsif va narx. Narxi qo‘yilgan kitob do‘konda sotuvga chiqadi, narx 0 bo‘lsa — sotuvdan olinadi.</p>
      <button type="button" className="admin-add-book" onClick={() => setEditing({ book: null })}><Plus size={18} />Yangi kitob qo‘shish</button>

      <label className="admin-search">
        <Search size={17} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Kitob yoki muallif bo‘yicha qidirish" aria-label="Kitobni qidirish" />
      </label>

      {catalog.error && <p className="admin-error" role="alert">{catalog.error}</p>}
      {catalog.loading && <p className="admin-empty">Yuklanmoqda…</p>}
      {!catalog.loading && shown.length === 0 && <p className="admin-empty">Kitob topilmadi.</p>}

      <ul className="admin-books-list">
        {shown.map((b) => {
          const onSale = b.price > 0;
          const value = prices[b.id] ?? (b.price ? String(b.price) : "");
          return (
            <li key={b.id}>
              <span className="admin-book-cover" style={{ backgroundColor: b.color }}>{b.coverUrl ? <img src={b.coverUrl} alt="" loading="lazy" /> : <b>{b.title.slice(0, 1)}</b>}</span>
              <span className="admin-book-info">
                <strong>{b.title}</strong>
                <small>{b.author || "Muallif ko‘rsatilmagan"}{b.category ? ` · ${b.category}` : ""}</small>
                <span className={`admin-sale ${onSale ? "on" : ""}`}>{onSale ? <><Eye size={13} />Sotuvda</> : <><EyeOff size={13} />Sotilmaydi</>}</span>
              </span>
              <span className="admin-book-actions">
                <label className="admin-price">
                  <input
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="Narx"
                    aria-label={`${b.title} narxi (₩ won)`}
                    value={value}
                    disabled={saving === b.id}
                    onChange={(e) => setPrices((p) => ({ ...p, [b.id]: e.target.value.replace(/\D/g, "").slice(0, 8) }))}
                    onBlur={() => prices[b.id] !== undefined && void savePrice(b, prices[b.id] === "" ? 0 : Number(prices[b.id]))}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  />
                  <span>₩</span>
                </label>
                <button type="button" className="admin-edit-book" onClick={() => setEditing({ book: b })} aria-label={`${b.title} ni tahrirlash`}><Pencil size={16} /></button>
              </span>
            </li>
          );
        })}
      </ul>

      <BookEditor open={Boolean(editing)} book={editing?.book ?? null} onClose={() => { setEditing(null); notifyStoreChanged(); }} />
    </div>
  );
}
