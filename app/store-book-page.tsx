"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ArrowLeft, BookOpen, Heart, ShoppingCart, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { books, type Book } from "./app-data";
import { askAi } from "./store-ai";
import { formatPrice, getMeta } from "./store-data";
import { BookCover, RatingLine, StarInput, Stars } from "./store-ui";
import type { BookReview, ReviewSummary } from "./review-types";

const reviewDate = (value: string) => {
  const d = new Date(value.replace(" ", "T") + (value.endsWith("Z") ? "" : "Z"));
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("ru-RU");
};

export default function StoreBookPage({ book, name, saved, summaries, onBack, onOpen, onAdd, onToggle, onReviewed }: {
  book: Book; name: string; saved: boolean; summaries: Record<string, ReviewSummary>;
  onBack: () => void; onOpen: (book: Book) => void; onAdd: () => void; onToggle: () => void; onReviewed: () => void;
}) {
  const meta = getMeta(book);
  const [summaryText, setSummaryText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const similar = books.filter(b => b.id !== book.id && getMeta(b).category === meta.category);

  return <article className="zb-book">
    <button className="zb-back" onClick={onBack}><ArrowLeft size={18} />Katalog</button>
    <section className="zb-book-hero" style={{ ["--book" as string]: book.color }}>
      <BookCover book={book} size="lg" />
      <div className="zb-book-info">
        <span className="zb-chip">{meta.category}</span>
        <h2>{book.title}</h2>
        <p className="zb-author">{book.author}</p>
        <div className="zb-book-facts"><RatingLine summary={summaries[book.id]} /><span><BookOpen size={14} />{book.pages} bet</span></div>
        <p className="zb-price">{formatPrice(meta.price)}</p>
        <div className="zb-book-actions">
          <button className="zb-btn zb-btn-primary" onClick={onAdd}><ShoppingCart size={18} />Savatga qo‘shish</button>
          <button className={`zb-btn zb-btn-icon ${saved ? "is-on" : ""}`} aria-pressed={saved} aria-label={saved ? "Sevimlilardan olish" : "Sevimlilarga qo‘shish"} onClick={onToggle}><Heart size={20} fill={saved ? "currentColor" : "none"} /></button>
        </div>
      </div>
    </section>

    <section className="zb-panel">
      <h3>Kitob haqida</h3>
      <p className="zb-about">{meta.about}</p>
    </section>

    <section className="zb-panel zb-ai-panel">
      <div className="zb-panel-head"><h3><Sparkles size={18} />AI xulosa</h3>
        {!summaryText && <button className="zb-btn zb-btn-ghost" disabled={aiBusy} onClick={async () => { setAiBusy(true); setSummaryText(await askAi({ mode: "summary", bookId: book.id })); setAiBusy(false); }}>{aiBusy ? "Tayyorlanmoqda..." : "Xulosa olish"}</button>}
      </div>
      {summaryText ? <p className="zb-ai-text">{summaryText}</p> : <p className="zb-muted">Asosiy g‘oya, muhim xulosalar va kimga foydali ekanini AI qisqacha tushuntiradi.</p>}
    </section>

    <Reviews book={book} name={name} summary={summaries[book.id]} onChanged={onReviewed} />

    {similar.length > 0 && <section className="zb-panel">
      <h3>O‘xshash kitoblar</h3>
      <div className="zb-rail">{similar.map(b => <button key={b.id} className="zb-rail-item" onClick={() => onOpen(b)}><BookCover book={b} size="sm" /><strong>{b.title}</strong><span>{formatPrice(getMeta(b).price)}</span></button>)}</div>
    </section>}
  </article>;
}

function Reviews({ book, name, summary, onChanged }: { book: Book; name: string; summary?: ReviewSummary; onChanged: () => void }) {
  const [reviews, setReviews] = useState<BookReview[] | null>(null);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    const res = await fetch(`/api/reviews?book=${encodeURIComponent(book.id)}`, { signal, cache: "no-store" });
    if (!res.ok) throw Error("Sharhlar yuklanmadi.");
    const data = (await res.json()) as { reviews: BookReview[] };
    setReviews(data.reviews);
    const mine = data.reviews.find(r => r.mine);
    setRating(mine?.rating ?? 0); setBody(mine?.body ?? "");
    setError("");
  }, [book.id]);

  useEffect(() => {
    const ctrl = new AbortController();
    queueMicrotask(() => {
      if (ctrl.signal.aborted) return;
      load(ctrl.signal).catch(e => { if (!ctrl.signal.aborted) { setError(e instanceof Error ? e.message : "Xato"); setReviews([]); } });
    });
    return () => ctrl.abort();
  }, [load]);

  const send = async (payload: Record<string, unknown>, success: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/reviews", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ bookId: book.id, name, ...payload }) });
      if (!res.ok) throw Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Saqlanmadi.");
      toast.success(success);
      await load();
      onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Saqlanmadi."); }
    finally { setBusy(false); }
  };
  const submit = (e: FormEvent) => { e.preventDefault(); if (rating) void send({ rating, body }, "Sharhingiz saqlandi"); };
  const mine = reviews?.find(r => r.mine);

  return <section className="zb-panel">
    <div className="zb-panel-head"><h3>Sharhlar</h3>{summary?.count ? <span className="zb-review-avg"><strong>{summary.avg.toFixed(1)}</strong><Stars value={summary.avg} /><span className="zb-muted">{summary.count} ta baho</span></span> : null}</div>
    <form className="zb-review-form" onSubmit={submit}>
      <span className="zb-muted">{mine ? "Sizning bahoyingiz" : "Kitobni baholang"}</span>
      <StarInput value={rating} onChange={setRating} />
      <textarea aria-label="Sharh matni" maxLength={1000} rows={3} value={body} onChange={e => setBody(e.target.value)} placeholder="Kitob sizga nima berdi? Boshqalarga tavsiya qilasizmi?" />
      <div className="zb-review-form-foot"><span className="zb-muted">{body.length}/1000</span>
        {mine && <button type="button" className="zb-btn zb-btn-ghost" disabled={busy} onClick={() => void send({ type: "delete" }, "Sharh o‘chirildi")}><Trash2 size={16} />O‘chirish</button>}
        <button className="zb-btn zb-btn-primary" disabled={busy || !rating}>{busy ? "Saqlanmoqda..." : mine ? "Yangilash" : "Yuborish"}</button></div>
    </form>
    {error && <p className="zb-muted" role="alert">{error}</p>}
    {reviews === null ? <p className="zb-muted" role="status">Yuklanmoqda...</p>
      : reviews.length === 0 ? <p className="zb-muted">Hali sharh yo‘q. Birinchi bo‘lib fikr bildiring.</p>
      : <ul className="zb-reviews">{reviews.map(r => <li key={r.id}>
          <span className="zb-avatar">{r.name.slice(0, 1).toUpperCase()}</span>
          <div><div className="zb-review-head"><strong>{r.name}{r.mine ? " (siz)" : ""}</strong><Stars value={r.rating} size={12} /><time>{reviewDate(r.createdAt)}</time></div>{r.body && <p>{r.body}</p>}</div>
        </li>)}</ul>}
  </section>;
}
