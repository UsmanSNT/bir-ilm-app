"use client";

import { type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, useRef } from "react";
import { CARD_LIMITS, COMMUNITY_LIMITS, type CardDesign, type CardFont } from "@/shared/contract/community";
import { type CardTheme, DEFAULT_PAD, themeOf } from "./card-themes";

type CardFontStyle = {
  family: string;
  weight: number;
  italic?: boolean;
  /** Ko'zga bir xil kattalikda ko'rinishi uchun koeffitsient. */
  scale: number;
  /** Harfning o'rtacha eni (em ulushida) — qatorlar sonini taxminlash uchun. */
  advance: number;
  tracking?: string;
};

export const CARD_FONT_STYLE: Record<CardFont, CardFontStyle> = {
  serif: { family: "var(--f-display)", weight: 500, scale: 1, advance: 0.5 },
  sans: { family: "var(--f-ui)", weight: 700, scale: 0.94, advance: 0.56 },
  mono: { family: "ui-monospace, 'SF Mono', 'Cascadia Mono', Menlo, monospace", weight: 500, scale: 0.84, advance: 0.6 },
  italic: { family: "var(--f-display)", weight: 400, italic: true, scale: 1.04, advance: 0.46 },
  bold: { family: "var(--f-ui)", weight: 800, scale: 1, advance: 0.58, tracking: "-0.02em" },
  hand: { family: "'Caveat Variable', 'Segoe Print', 'Bradley Hand', cursive", weight: 600, scale: 1.3, advance: 0.4 },
};

const LINE_HEIGHT = 1.32;
const MIN_TEXT_SIZE = 2.6;
/** Bezaklar egallaydigan joy (cqw): plashka ichki chegarasi va belgisi, iqtibos belgisi, kitob qatori. */
const PLATE_X = 12.8;
const PLATE_Y = 15.4;
const QUOTE_H = 10;
const BOOK_SIZE = 3.1;
const BOOK_ADVANCE = 0.8;

/** Boshlang'ich o'lcham matn uzunligiga qarab (qisqa iqtibos — yirik). */
function baseTextSize(text: string): number {
  const length = text.length;
  if (length <= 30) return 9.2;
  if (length <= 60) return 7.6;
  if (length <= 110) return 6.2;
  if (length <= 170) return 5.2;
  if (length <= 230) return 4.5;
  return 4;
}

/**
 * Matn o'lchami (karta enining foizida). Uzunlikka qarab boshlanadi, so'ng qatorlar soni taxminlanib
 * matn maydoniga sig'guncha kichraytiriladi — 280 belgi ham, ko'p qatorli ro'yxat ham kartadan chiqmaydi.
 * Hisob faqat matnga bog'liq (DOM o'lchanmaydi), shuning uchun muharrir, lenta va namunada natija bir xil.
 */
export function cardTextSize(text: string, font: CardFontStyle, theme: CardTheme, book: string): number {
  const [top, right, bottom, left] = theme.pad ?? DEFAULT_PAD;
  const width = 100 - left - right - (theme.plate ? PLATE_X : 0);
  let height = 100 - top - bottom - (theme.plate ? PLATE_Y : 0) - (theme.quote ? QUOTE_H : 0);
  if (book) height -= Math.ceil((book.length * BOOK_ADVANCE * BOOK_SIZE) / width) * BOOK_SIZE * 1.35 + 2.6;
  const paragraphs = text.split("\n");
  const lines = (size: number) => {
    // So'zlar qator oxirida to'liq ko'chadi — sig'imning ~90% i ishlatiladi.
    const perLine = Math.max(1, (width / (font.advance * size)) * 0.9);
    return paragraphs.reduce((sum, part) => sum + Math.max(1, Math.ceil(part.length / perLine)), 0);
  };
  let size = baseTextSize(text) * font.scale * (theme.fit ?? 1);
  while (size > MIN_TEXT_SIZE && lines(size) * LINE_HEIGHT * size > height) size *= 0.94;
  return Math.max(MIN_TEXT_SIZE, size);
}

/** Muharrir rejimi: matn va kitob nomi kartaning o'zida yoziladi, stikerlar sudraladi. */
export type CardEditing = {
  selected: number;
  onSelectSticker: (index: number) => void;
  onMoveSticker: (index: number, x: number, y: number) => void;
  onRemoveSticker: (index: number) => void;
  onText: (text: string) => void;
  onBook: (book: string) => void;
};

const TEXT_PLACEHOLDER = "Bu yerga yozing…";
const BOOK_PLACEHOLDER = "kitob nomi (ixtiyoriy)";
const STICKER_STEP = 2;

/**
 * Karta postini chizadi (lenta, o'qish oynasi, muharrir, shablon namunasi).
 * O'lchamlar karta enining foizida (`cqw`), shuning uchun muharrirda qanday ko'rinsa, lentada ham shunday.
 */
export default function DesignCard({ design, book = "", editing, sample = false }: {
  design: CardDesign;
  /** Kitob nomi — matn ostida «— KITOB» bo'lib chiqadi. */
  book?: string;
  editing?: CardEditing;
  /** Shablon tanlash uchun kichik namuna: matn o'rnida «Aa». */
  sample?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const textArea = useRef<HTMLTextAreaElement>(null);
  const drag = useRef<{ index: number; dx: number; dy: number } | null>(null);
  /** Oxirgi bosish stikerga tushganmi — sudrab bo'lgach keladigan «click» yozishni ochmasin. */
  const pressedSticker = useRef(false);
  const theme = themeOf(design.bg);
  const font = CARD_FONT_STYLE[design.font] ?? CARD_FONT_STYLE.serif;
  const text = sample ? "Aa" : design.text;
  const bookLine = book.trim();
  const size = sample ? 25 * font.scale * (theme.fit ?? 1) : cardTextSize(text || (editing ? TEXT_PLACEHOLDER : ""), font, theme, editing ? book || BOOK_PLACEHOLDER : bookLine);
  const showBody = sample || Boolean(editing) || Boolean(text) || Boolean(bookLine);
  // Naqshi yorqin fonda belgi plashka ichida turadi, aks holda — kartaning pastida.
  const brandInPlate = Boolean(theme.plate) && showBody;

  const style = {
    "--dc-ink": theme.ink,
    "--dc-accent": theme.accent,
    "--dc-pad": theme.pad && theme.pad.map((side) => `${side}cqw`).join(" "),
    "--dc-plate": theme.plate,
    "--dc-glow": theme.glow,
    "--dc-brand": theme.brand,
    "--dc-brand-at": theme.brandAt,
  } as CSSProperties;

  const pointer = (event: ReactPointerEvent) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return null;
    return { x: ((event.clientX - rect.left) / rect.width) * 100, y: ((event.clientY - rect.top) / rect.height) * 100 };
  };
  const move = (event: ReactPointerEvent) => {
    const at = drag.current && pointer(event);
    if (!drag.current || !at || !editing) return;
    editing.onMoveSticker(drag.current.index, at.x - drag.current.dx, at.y - drag.current.dy);
  };
  const stop = () => { drag.current = null; };

  /** Kartaning bo'sh joyiga bosilsa — yozishga o'tadi (stiker tanlovi bekor bo'ladi). */
  const focusText = (event: ReactMouseEvent) => {
    if (!editing || pressedSticker.current || (event.target as HTMLElement).closest("textarea, input, .design-sticker")) return;
    editing.onSelectSticker(-1);
    textArea.current?.focus();
  };

  const stickerKeys = (event: ReactKeyboardEvent, index: number) => {
    if (!editing) return;
    const sticker = design.stickers[index];
    const step = { ArrowLeft: [-STICKER_STEP, 0], ArrowRight: [STICKER_STEP, 0], ArrowUp: [0, -STICKER_STEP], ArrowDown: [0, STICKER_STEP] }[event.key];
    if (step) {
      event.preventDefault();
      editing.onMoveSticker(index, sticker.x + step[0], sticker.y + step[1]);
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      editing.onRemoveSticker(index);
    }
  };

  // Yashirin nusxa maydon balandligini belgilaydi; oxiridagi bo'sh qator ham hisoblansin.
  const mirror = editing ? (text ? (text.endsWith("\n") ? `${text}​` : text) : TEXT_PLACEHOLDER) : text;

  return (
    <div
      ref={box}
      className={`design-card${editing ? " is-editable" : ""}${sample ? " is-sample" : ""}`}
      style={style}
      onPointerDown={editing ? (event) => { pressedSticker.current = Boolean((event.target as HTMLElement).closest(".design-sticker")); } : undefined}
      onPointerMove={editing ? move : undefined}
      onPointerUp={editing ? stop : undefined}
      onPointerCancel={editing ? stop : undefined}
      onClick={editing ? focusText : undefined}
      role={editing ? undefined : "img"}
      aria-label={editing ? undefined : sample ? undefined : [design.text || "Karta", bookLine && `— ${bookLine}`].filter(Boolean).join(" ")}
      aria-hidden={sample || undefined}
    >
      <span className="design-card-bg" style={{ background: theme.background }} aria-hidden="true" />
      {theme.frame && <span className="design-card-frame" style={{ backgroundImage: theme.frame }} aria-hidden="true" />}
      <div className="design-card-inner">
        {showBody && (
          <div
            className={`design-card-body${theme.plate ? " has-plate" : ""}`}
            style={{ textAlign: design.align ?? "center", fontFamily: font.family, fontWeight: font.weight, fontStyle: font.italic ? "italic" : undefined, letterSpacing: font.tracking }}
          >
            {theme.quote && <span className="design-card-quote" aria-hidden="true">“</span>}
            {(text || editing) && (
              <div className="design-card-text-box" style={{ fontSize: `${size.toFixed(2)}cqw` }}>
                <p className="design-card-text" aria-hidden={editing ? true : undefined}>{mirror}</p>
                {editing && (
                  <textarea
                    ref={textArea}
                    className="design-card-input"
                    aria-label="Karta matni"
                    rows={1}
                    maxLength={CARD_LIMITS.text}
                    value={design.text}
                    placeholder={TEXT_PLACEHOLDER}
                    onChange={(event) => editing.onText(event.target.value)}
                    onFocus={() => editing.onSelectSticker(-1)}
                  />
                )}
              </div>
            )}
            {editing ? (
              <span className="design-card-book is-input">
                <span aria-hidden="true">—&nbsp;</span>
                <span className="design-card-grow" data-value={book || BOOK_PLACEHOLDER}>
                  <input
                    aria-label="Kitob nomi (ixtiyoriy)"
                    maxLength={COMMUNITY_LIMITS.book}
                    value={book}
                    placeholder={BOOK_PLACEHOLDER}
                    onChange={(event) => editing.onBook(event.target.value)}
                    onFocus={() => editing.onSelectSticker(-1)}
                  />
                </span>
              </span>
            ) : bookLine && !sample ? <p className="design-card-book">— {bookLine}</p> : null}
            {brandInPlate && !sample && <span className="design-card-brand is-in-plate" aria-hidden="true">BIR ILM</span>}
          </div>
        )}
      </div>
      {!sample && !brandInPlate && <span className="design-card-brand" aria-hidden="true">BIR ILM</span>}
      {!sample && design.stickers.map((sticker, i) => (
        <span
          key={i}
          className={`design-sticker${editing?.selected === i ? " is-selected" : ""}`}
          style={{ left: `${sticker.x}%`, top: `${sticker.y}%`, fontSize: `${(sticker.s * 10).toFixed(2)}cqw` }}
          role={editing ? "button" : undefined}
          aria-label={editing ? `Stiker ${sticker.e}: strelkalar bilan suring, Delete — o‘chirish` : undefined}
          aria-pressed={editing ? editing.selected === i : undefined}
          tabIndex={editing ? 0 : undefined}
          onKeyDown={editing ? (event) => stickerKeys(event, i) : undefined}
          onFocus={editing ? () => editing.onSelectSticker(i) : undefined}
          onPointerDown={editing ? (event) => {
            event.preventDefault();
            // Sudrash paytida klaviatura yopilsin (telefonda karta ko'rinib tursin).
            const active = document.activeElement;
            if (active instanceof HTMLElement && box.current?.contains(active)) active.blur();
            const at = pointer(event);
            box.current?.setPointerCapture(event.pointerId);
            drag.current = { index: i, dx: at ? at.x - sticker.x : 0, dy: at ? at.y - sticker.y : 0 };
            editing.onSelectSticker(i);
          } : undefined}
        >
          {sticker.e}
        </span>
      ))}
    </div>
  );
}
