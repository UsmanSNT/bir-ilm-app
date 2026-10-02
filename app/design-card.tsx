"use client";

import { PointerEvent as ReactPointerEvent, useRef } from "react";
import { backgrounds, fonts, textColor, type PostDesign } from "./post-design";

/** Karta postini chizadi. `onMoveSticker` berilsa stikerlarni sudrab joylashtirish mumkin (muharrir rejimi). */
export default function DesignCard({ design, selected, onSelectSticker, onMoveSticker, placeholder }: {
  design: PostDesign; selected?: number; placeholder?: string;
  onSelectSticker?: (index: number) => void; onMoveSticker?: (index: number, x: number, y: number) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef<number | null>(null);
  const editable = !!onMoveSticker;
  const len = design.text.length;
  const fontSize = len > 200 ? "clamp(15px, 3.6vw, 19px)" : len > 110 ? "clamp(18px, 4.4vw, 24px)" : len > 50 ? "clamp(22px, 5.4vw, 30px)" : "clamp(26px, 6.6vw, 38px)";

  const move = (e: ReactPointerEvent) => {
    if (dragging.current === null || !box.current || !onMoveSticker) return;
    const r = box.current.getBoundingClientRect();
    onMoveSticker(dragging.current, ((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100);
  };

  return <div ref={box} className={`design-card ${editable ? "is-editable" : ""}`}
    style={{ background: backgrounds[design.bg], color: textColor(design.bg), fontFamily: fonts[design.font] }}
    onPointerMove={move} onPointerUp={() => { dragging.current = null; }} onPointerCancel={() => { dragging.current = null; }}>
    <p className="design-card-text" style={{ fontSize }}>{design.text || <span className="design-card-placeholder">{placeholder}</span>}</p>
    {design.stickers.map((s, i) => <span key={i} className={`design-sticker ${selected === i ? "is-selected" : ""}`}
      style={{ left: `${s.x}%`, top: `${s.y}%`, fontSize: `calc(${s.s} * clamp(28px, 8vw, 44px))` }}
      role={editable ? "button" : undefined} aria-label={editable ? `Stiker ${s.e}` : undefined} tabIndex={editable ? 0 : undefined}
      onPointerDown={editable ? e => { e.preventDefault(); (e.currentTarget.parentElement as HTMLElement).setPointerCapture(e.pointerId); dragging.current = i; onSelectSticker?.(i); } : undefined}>
      {s.e}</span>)}
  </div>;
}
