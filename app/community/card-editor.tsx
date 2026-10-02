"use client";

import { useState } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import {
  CARD_BACKGROUNDS,
  CARD_FONTS,
  CARD_LIMITS,
  CARD_STICKERS,
  type CardBackground,
  type CardDesign,
} from "@/shared/contract/community";
import DesignCard, { CARD_FONT_FAMILY } from "./design-card";

const FONT_LABELS = { serif: "Klassik", sans: "Zamonaviy", mono: "Mashinka" } as const;
const BG_LABELS: Record<CardBackground, string> = {
  lojuvard: "Lojuvard", firuza: "Firuza", tilla: "Tilla", anor: "Anor", tun: "Tun", shom: "Shom", gul: "Gul", qogoz: "Qog‘oz",
};

export const EMPTY_CARD: CardDesign = { bg: "lojuvard", font: "serif", text: "", stickers: [] };

/** Karta muharriri: fon, shrift, matn va sudrab joylashtiriladigan stikerlar. */
export function CardEditor({ design, onChange }: { design: CardDesign; onChange: (next: CardDesign) => void }) {
  const [selected, setSelected] = useState(-1);
  const sel = design.stickers[selected];

  const updateSticker = (index: number, patch: Partial<CardDesign["stickers"][number]>) =>
    onChange({ ...design, stickers: design.stickers.map((s, i) => (i === index ? { ...s, ...patch } : s)) });

  const addSticker = (e: (typeof CARD_STICKERS)[number]) => {
    if (design.stickers.length >= CARD_LIMITS.stickers) return;
    const n = design.stickers.length;
    onChange({ ...design, stickers: [...design.stickers, { e, x: 22 + ((n * 17) % 56), y: 18 + ((n * 23) % 60), s: 1 }] });
    setSelected(n);
  };

  return (
    <div className="card-editor">
      <DesignCard
        design={design}
        selected={selected}
        placeholder="Matn yozing yoki stiker qo‘shing"
        onSelectSticker={setSelected}
        onMoveSticker={(i, x, y) => updateSticker(i, { x: Math.min(100, Math.max(0, x)), y: Math.min(100, Math.max(0, y)) })}
      />
      <textarea
        className="card-editor-text"
        aria-label="Karta matni"
        rows={2}
        maxLength={CARD_LIMITS.text}
        value={design.text}
        onChange={(e) => onChange({ ...design, text: e.target.value })}
        placeholder="Kitobdan iqtibos yoki fikr…"
      />
      <div className="card-editor-row" role="radiogroup" aria-label="Fon rangi">
        {(Object.keys(CARD_BACKGROUNDS) as CardBackground[]).map((bg) => (
          <button key={bg} type="button" role="radio" aria-checked={design.bg === bg} aria-label={`Fon: ${BG_LABELS[bg]}`} title={BG_LABELS[bg]} className="card-swatch" style={{ background: CARD_BACKGROUNDS[bg] }} onClick={() => onChange({ ...design, bg })} />
        ))}
      </div>
      <div className="card-editor-row" role="radiogroup" aria-label="Shrift">
        {CARD_FONTS.map((font) => (
          <button key={font} type="button" role="radio" aria-checked={design.font === font} className="card-font" style={{ fontFamily: CARD_FONT_FAMILY[font] }} onClick={() => onChange({ ...design, font })}>{FONT_LABELS[font]}</button>
        ))}
      </div>
      <div className="card-stickers" aria-label="Stikerlar">
        {CARD_STICKERS.map((e) => (
          <button key={e} type="button" aria-label={`Stiker qo‘shish ${e}`} disabled={design.stickers.length >= CARD_LIMITS.stickers} onClick={() => addSticker(e)}>{e}</button>
        ))}
      </div>
      {sel && (
        <div className="card-sticker-tools">
          <span>{sel.e} tanlangan · kartada sudrab joylang</span>
          <button type="button" aria-label="Kichraytirish" onClick={() => updateSticker(selected, { s: Math.max(0.6, sel.s - 0.2) })}><Minus size={16} /></button>
          <button type="button" aria-label="Kattalashtirish" onClick={() => updateSticker(selected, { s: Math.min(2.5, sel.s + 0.2) })}><Plus size={16} /></button>
          <button type="button" aria-label="Stikerni o‘chirish" onClick={() => { onChange({ ...design, stickers: design.stickers.filter((_, i) => i !== selected) }); setSelected(-1); }}><Trash2 size={16} /></button>
        </div>
      )}
    </div>
  );
}
