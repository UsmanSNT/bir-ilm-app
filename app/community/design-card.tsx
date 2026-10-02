"use client";

import { type PointerEvent as ReactPointerEvent, useRef } from "react";
import { CARD_BACKGROUNDS, CARD_LIGHT_BACKGROUNDS, type CardDesign, type CardFont } from "@/shared/contract/community";

export const CARD_FONT_FAMILY: Record<CardFont, string> = {
  serif: "var(--f-display)",
  sans: "var(--f-ui)",
  mono: "ui-monospace, 'SF Mono', Menlo, monospace",
};

/**
 * Karta postini chizadi (lenta, o'qish oynasi, muharrir).
 * `onMoveSticker` berilsa — muharrir rejimi: stikerlarni sudrab joylashtirish mumkin.
 */
export default function DesignCard({ design, selected, onSelectSticker, onMoveSticker, placeholder }: {
  design: CardDesign;
  selected?: number;
  placeholder?: string;
  onSelectSticker?: (index: number) => void;
  onMoveSticker?: (index: number, x: number, y: number) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef<number | null>(null);
  const editable = Boolean(onMoveSticker);
  const len = design.text.length;
  const fontSize = len > 200 ? "clamp(15px, 3.6vw, 19px)" : len > 110 ? "clamp(18px, 4.4vw, 24px)" : len > 50 ? "clamp(22px, 5.4vw, 30px)" : "clamp(26px, 6.6vw, 38px)";
  const light = CARD_LIGHT_BACKGROUNDS.includes(design.bg);

  const move = (event: ReactPointerEvent) => {
    if (dragging.current === null || !box.current || !onMoveSticker) return;
    const rect = box.current.getBoundingClientRect();
    onMoveSticker(dragging.current, ((event.clientX - rect.left) / rect.width) * 100, ((event.clientY - rect.top) / rect.height) * 100);
  };
  const stop = () => { dragging.current = null; };

  return (
    <div
      ref={box}
      className={`design-card${editable ? " is-editable" : ""}`}
      style={{ background: CARD_BACKGROUNDS[design.bg], color: light ? "#1b1a2e" : "#ffffff", fontFamily: CARD_FONT_FAMILY[design.font] }}
      onPointerMove={move}
      onPointerUp={stop}
      onPointerCancel={stop}
      role={editable ? undefined : "img"}
      aria-label={editable ? undefined : design.text || "Karta"}
    >
      <p className="design-card-text" style={{ fontSize }}>{design.text || <span className="design-card-placeholder">{placeholder}</span>}</p>
      {design.stickers.map((sticker, i) => (
        <span
          key={i}
          className={`design-sticker${selected === i ? " is-selected" : ""}`}
          style={{ left: `${sticker.x}%`, top: `${sticker.y}%`, fontSize: `calc(${sticker.s} * clamp(28px, 8vw, 44px))` }}
          role={editable ? "button" : undefined}
          aria-label={editable ? `Stiker ${sticker.e}` : undefined}
          tabIndex={editable ? 0 : undefined}
          onPointerDown={editable ? (event) => {
            event.preventDefault();
            box.current?.setPointerCapture(event.pointerId);
            dragging.current = i;
            onSelectSticker?.(i);
          } : undefined}
        >
          {sticker.e}
        </span>
      ))}
    </div>
  );
}
