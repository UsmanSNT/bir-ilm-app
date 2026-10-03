"use client";

import { Fragment, type ReactNode } from "react";
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

// ── Matn: markdown belgilarsiz ko'rsatish ────────────────────────────

/** Boshqa joydan (masalan AI'dan) ko'chirilgan matndagi `##`, `**`, `- ` belgilarini oddiy matnga aylantiradi. */
export function stripMarkdown(text: string): string {
  return normalizeBullets(text)
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

/** Bir qatorga yopishib qolgan « - **Sarlavha:** …» bandlarini alohida qatorlarga ajratadi. */
function normalizeBullets(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/[ \t]+(?:[-*•])\s+(?=\*\*)/g, "\n- ").replace(/([^\n])\s*(#{2,6}\s)/g, "$1\n$2");
}

function inline(text: string, key: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (/^\*\*[^*]+\*\*$/.test(part) ? <strong key={`${key}${i}`}>{part.slice(2, -2)}</strong> : <Fragment key={`${key}${i}`}>{part}</Fragment>));
}

/**
 * Tavsif va AI javobini chiroyli ko'rsatadi: `## sarlavha` — sarlavha, `- band` — ro'yxat, `**qalin**` — qalin.
 * HTML ishlatilmaydi (React elementlari), shuning uchun xavfsiz.
 */
export function FormattedText({ text, className = "" }: { text: string; className?: string }) {
  const lines = normalizeBullets(text).split("\n").map((l) => l.trim()).filter(Boolean);
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (!list.length) return;
    const items = list;
    blocks.push(<ul key={`u${blocks.length}`}>{items.map((item, i) => <li key={i}>{inline(item, `l${i}`)}</li>)}</ul>);
    list = [];
  };
  lines.forEach((line) => {
    const heading = /^#{1,6}\s*(.+)$/.exec(line);
    const bullet = /^(?:[-*•])\s+(.+)$/.exec(line);
    if (bullet) { list.push(bullet[1]); return; }
    flush();
    if (heading) blocks.push(<h4 key={`h${blocks.length}`}>{inline(heading[1], "h")}</h4>);
    else blocks.push(<p key={`p${blocks.length}`}>{inline(line, "p")}</p>);
  });
  flush();
  return <div className={`zb-formatted ${className}`}>{blocks}</div>;
}
