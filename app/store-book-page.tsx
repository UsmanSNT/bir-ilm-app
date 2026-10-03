"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ArrowLeft, BookOpen, Headphones, Heart, MessageCircle, Pencil, ShoppingCart, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteReview, fetchReviews, notifyStoreChanged, saveReview, StoreError } from "@/lib/api/store-client";
import { formatPrice, STORE_LIMITS, type ReviewSummary, type StoreBook } from "@/shared/contract";
import { askAi } from "./store-ai";
import { BookCover, FormattedText, RatingLine, StarInput, Stars } from "./store-ui";

const reviewDate = (value: string) => {
  const d = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("ru-RU");
};

export default function StoreBookPage({ book, related, saved, onBack, onOpen, onAdd, onToggle, onNeedLogin, onAsk, onEdit }: {
  book: StoreBook;
  related: StoreBook[];
  saved: boolean;
  onBack: () => void;
  onOpen: (book: StoreBook) => void;
  onAdd: () => void;
  onToggle: () => void;
  onNeedLogin: () => void;
  onAsk: () => void;
  /** Faqat admin uchun. */
  onEdit?: () => void;
}) {
  const [summaryText, setSummaryText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const similar = related.filter((b) => b.id !== book.id && (!book.category || b.category === book.category)).slice(0, 8);

  async function summarize() {
    setAiBusy(true);
    const reply = await askAi({ mode: "summary", bookId: book.id });
    setAiBusy(false);
    if (reply.needsLogin) return onNeedLogin();
    setSummaryText(reply.text);
  }

  return (
    <article className="zb-book">
      <button className="zb-back zb-back-round" onClick={onBack} aria-label="Katalogga qaytish" title="Orqaga"><ArrowLeft size={20} /></button>
      <section className="zb-book-hero" style={{ ["--book" as string]: book.color }}>
        <BookCover book={book} size="lg" />
        <div className="zb-book-info">
          {book.category && <span className="zb-chip">{book.category}</span>}
          <h2>{book.title}</h2>
          <p className="zb-author">{book.author}</p>
          <div className="zb-book-facts">
            <RatingLine rating={book.rating} count={book.reviews} />
            <span><BookOpen size={14} />{book.pages} bet</span>
            {book.hasAudio && <span className="zb-audio-chip"><Headphones size={14} />Audiokitob Javonda</span>}
          </div>
          <p className="zb-price">{formatPrice(book.price)}</p>
          <div className="zb-book-actions">
            <button className="zb-btn zb-btn-primary zb-cart-btn" onClick={onAdd} aria-label="Savatga qo‘shish" title="Savatga qo‘shish"><ShoppingCart size={22} /></button>
            <button className="zb-btn zb-btn-icon" onClick={onAsk} aria-label="Adminga yozish" title="Adminga yozish"><MessageCircle size={20} /></button>
            {onEdit && <button className="zb-btn zb-btn-icon" onClick={onEdit} aria-label="Tahrirlash" title="Tahrirlash"><Pencil size={19} /></button>}
            <button className={`zb-btn zb-btn-icon ${saved ? "is-on" : ""}`} aria-pressed={saved} aria-label={saved ? "Javondan olish" : "Javonga qo‘shish"} onClick={onToggle}>
              <Heart size={20} fill={saved ? "currentColor" : "none"} />
            </button>
          </div>
        </div>
      </section>

      {book.summary && (
        <section className="zb-panel">
          <h3>Kitob haqida</h3>
          <FormattedText className="zb-about" text={book.summary} />
        </section>
      )}

      <section className="zb-panel zb-ai-panel">
        <div className="zb-panel-head">
          <h3><Sparkles size={18} />AI xulosa</h3>
          {!summaryText && <button className="zb-btn zb-btn-ghost" disabled={aiBusy} onClick={() => void summarize()}>{aiBusy ? "Tayyorlanmoqda..." : "Xulosa olish"}</button>}
        </div>
        {summaryText ? <FormattedText className="zb-ai-text" text={summaryText} /> : <p className="zb-muted">Asosiy g‘oya, muhim xulosalar va kimga foydali ekanini AI qisqacha tushuntiradi.</p>}
      </section>

      <Reviews bookId={book.id} onNeedLogin={onNeedLogin} />

      {similar.length > 0 && (
        <section className="zb-panel">
          <h3>O‘xshash kitoblar</h3>
          <div className="zb-rail">
            {similar.map((b) => (
              <button key={b.id} className="zb-rail-item" onClick={() => onOpen(b)}>
                <BookCover book={b} size="sm" />
                <strong>{b.title}</strong>
                <span>{formatPrice(b.price)}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}

function Reviews({ bookId, onNeedLogin }: { bookId: string; onNeedLogin: () => void }) {
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const apply = useCallback((next: ReviewSummary) => {
    setSummary(next);
    const mine = next.items.find((r) => r.mine);
    setRating(mine?.rating ?? 0);
    setBody(mine?.body ?? "");
    setError("");
  }, []);

  useEffect(() => {
    let alive = true;
    fetchReviews(bookId)
      .then((next) => { if (alive) apply(next); })
      .catch((e: Error) => { if (alive) { setError(e.message); setSummary({ average: 0, count: 0, items: [] }); } });
    return () => { alive = false; };
  }, [bookId, apply]);

  async function run(action: () => Promise<ReviewSummary>, success: string) {
    setBusy(true);
    try {
      apply(await action());
      notifyStoreChanged();
      toast.success(success);
    } catch (e) {
      if (e instanceof StoreError && e.status === 401) onNeedLogin();
      else toast.error(e instanceof Error ? e.message : "Saqlanmadi.");
    } finally {
      setBusy(false);
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (rating) void run(() => saveReview(bookId, { rating, body: body.trim() }), "Sharhingiz saqlandi");
  };
  const mine = summary?.items.find((r) => r.mine);

  return (
    <section className="zb-panel">
      <div className="zb-panel-head">
        <h3>Sharhlar</h3>
        {summary?.count ? (
          <span className="zb-review-avg"><strong>{summary.average.toFixed(1)}</strong><Stars value={summary.average} /><span className="zb-muted">{summary.count} ta baho</span></span>
        ) : null}
      </div>
      <form className="zb-review-form" onSubmit={submit}>
        <span className="zb-muted">{mine ? "Sizning bahoyingiz" : "Kitobni baholang"}</span>
        <StarInput value={rating} onChange={setRating} />
        <textarea aria-label="Sharh matni" maxLength={STORE_LIMITS.reviewBody} rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Kitob sizga nima berdi? Boshqalarga tavsiya qilasizmi?" />
        <div className="zb-review-form-foot">
          <span className="zb-muted">{body.length}/{STORE_LIMITS.reviewBody}</span>
          {mine && <button type="button" className="zb-btn zb-btn-ghost" disabled={busy} onClick={() => void run(() => deleteReview(bookId), "Sharh o‘chirildi")}><Trash2 size={16} />O‘chirish</button>}
          <button className="zb-btn zb-btn-primary" disabled={busy || !rating}>{busy ? "Saqlanmoqda..." : mine ? "Yangilash" : "Yuborish"}</button>
        </div>
      </form>
      {error && <p className="zb-muted" role="alert">{error}</p>}
      {summary === null ? (
        <p className="zb-muted" role="status">Yuklanmoqda...</p>
      ) : summary.items.length === 0 ? (
        <p className="zb-muted">Hali sharh yo‘q. Birinchi bo‘lib fikr bildiring.</p>
      ) : (
        <ul className="zb-reviews">
          {summary.items.map((r) => (
            <li key={r.id}>
              <span className="zb-avatar">{r.name.slice(0, 1).toUpperCase()}</span>
              <div>
                <div className="zb-review-head"><strong>{r.name}{r.mine ? " (siz)" : ""}</strong><Stars value={r.rating} size={12} /><time>{reviewDate(r.updatedAt)}</time></div>
                {r.body && <p>{r.body}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
