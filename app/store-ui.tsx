"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import type { Book } from "./app-data";
import type { ReviewSummary } from "./review-types";

/** CSS bilan chizilgan kitob muqovasi (haqiqiy muqova rasmlari ulanmaguncha). */
export function BookCover({ book, size = "md" }: { book: Book; size?: "sm" | "md" | "lg" }) {
  // Eng uzun so'z muqova kengligiga bo'linmasdan sig'ishi uchun shrift o'lchami (cqi = muqova ichki kengligining 1%).
  const longest = Math.max(...book.title.split(/\s+/).map(w => w.length), 1);
  const titleSize = Math.min(17, 92 / (longest * 0.6));
  return <span className={`zb-cover zb-cover-${size}`} style={{ backgroundColor: book.color }} aria-hidden="true">
    <span className="zb-cover-spine" />
    <strong style={{ fontSize: `${titleSize.toFixed(2)}cqi` }}>{book.title}</strong>
    <small>{book.author}</small>
  </span>;
}

export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return <span className="zb-stars" aria-label={`${value} / 5`}>
    {[1, 2, 3, 4, 5].map(i => <Star key={i} size={size} fill={value >= i - 0.25 ? "currentColor" : "none"} strokeWidth={1.6} />)}
  </span>;
}

export function RatingLine({ summary }: { summary?: ReviewSummary }) {
  if (!summary?.count) return <span className="zb-rating zb-muted">Hali baho yo‘q</span>;
  return <span className="zb-rating"><Star size={13} fill="currentColor" />{summary.avg.toFixed(1)}<span className="zb-muted">({summary.count})</span></span>;
}

export function StarInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return <div className="zb-star-input" role="radiogroup" aria-label="Baho">
    {[1, 2, 3, 4, 5].map(i => <button key={i} type="button" role="radio" aria-checked={value === i} aria-label={`${i} yulduz`} onClick={() => onChange(i)}>
      <Star size={28} fill={value >= i ? "currentColor" : "none"} strokeWidth={1.5} />
    </button>)}
  </div>;
}

/** Barcha kitoblar bo'yicha o'rtacha baholar (bazadagi haqiqiy sharhlardan). */
export function useReviewSummaries(version: number) {
  const [summaries, setSummaries] = useState<Record<string, ReviewSummary>>({});
  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/reviews", { signal: ctrl.signal, cache: "no-store" })
      .then(r => (r.ok ? r.json() : null))
      .then((d: unknown) => { const s = (d as { summaries?: Record<string, ReviewSummary> } | null)?.summaries; if (s) setSummaries(s); })
      .catch(() => {});
    return () => ctrl.abort();
  }, [version]);
  return summaries;
}
