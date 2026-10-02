"use client";

import { Star } from "lucide-react";
import type { StoreBook } from "@/shared/contract";

type CoverBook = Pick<StoreBook, "title" | "author" | "color" | "coverUrl">;

/** Kitob muqovasi: admin yuklagan rasm, bo'lmasa rangli "Naqsh" muqova. */
export function BookCover({ book, size }: { book: CoverBook; size?: "sm" | "md" | "lg" }) {
  // Eng uzun so'z muqova kengligiga bo'linmasdan sig'ishi uchun shrift o'lchami (cqi = muqova ichki kengligining 1%).
  const longest = Math.max(...book.title.split(/\s+/).map((w) => w.length), 1);
  const titleSize = Math.min(17, 92 / (longest * 0.6));
  return (
    <span className={`zb-cover${size ? ` zb-cover-${size}` : ""}${book.coverUrl ? " has-image" : ""}`} style={{ backgroundColor: book.color }} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- muqova serverdagi media yo'li, Next optimizatsiyasi ishlamaydi */}
      {book.coverUrl && <img src={book.coverUrl} alt="" loading="lazy" decoding="async" />}
      <span className="zb-cover-spine" />
      <strong style={{ fontSize: `${titleSize.toFixed(2)}cqi` }}>{book.title}</strong>
      <small>{book.author}</small>
    </span>
  );
}

export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="zb-stars" aria-label={`${value} / 5`}>
      {[1, 2, 3, 4, 5].map((i) => <Star key={i} size={size} fill={value >= i - 0.25 ? "currentColor" : "none"} strokeWidth={1.6} />)}
    </span>
  );
}

export function RatingLine({ rating, count }: { rating: number; count: number }) {
  if (!count) return <span className="zb-rating zb-muted">Hali baho yo‘q</span>;
  return <span className="zb-rating"><Star size={13} fill="currentColor" />{rating.toFixed(1)}<span className="zb-muted">({count})</span></span>;
}

export function StarInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="zb-star-input" role="radiogroup" aria-label="Baho">
      {[1, 2, 3, 4, 5].map((i) => (
        <button key={i} type="button" role="radio" aria-checked={value === i} aria-label={`${i} yulduz`} onClick={() => onChange(i)}>
          <Star size={28} fill={value >= i ? "currentColor" : "none"} strokeWidth={1.5} />
        </button>
      ))}
    </div>
  );
}
