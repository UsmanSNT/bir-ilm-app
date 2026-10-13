"use client";

import { useState } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import {
  CARD_FONTS,
  CARD_LIMITS,
  CARD_STICKERS,
  type CardDesign,
} from "@/shared/contract/community";
import DesignCard, { CARD_FONT_FAMILY } from "./design-card";
import { CARD_THEMES, CARD_THEME_GROUPS, type CardThemeGroup, themesInGroup } from "./card-themes";

const FONT_LABELS = { serif: "Klassik", sans: "Zamonaviy", mono: "Mashinka" } as const;

export const EMPTY_CARD: CardDesign = { bg: "lojuvard", font: "serif", text: "", stickers: [] };

/** Karta muharriri: fon, shrift, matn va sudrab joylashtiriladigan stikerlar. */
export function CardEditor({ design, onChange }: { design: CardDesign; onChange: (next: CardDesign) => void }) {
  const [selected, setSelected] = useState(-1);
  const [group, setGroup] = useState<CardThemeGroup>(CARD_THEMES[design.bg].group);
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
      <div className="card-editor-row" role="radiogroup" aria-label="Mavzu guruhi">
        {CARD_THEME_GROUPS.map((g) => (
          <button key={g.id} type="button" role="radio" aria-checked={group === g.id} className="card-group" onClick={() => setGroup(g.id)}>{g.label}</button>
        ))}
      </div>
      <div className="card-editor-row" role="radiogroup" aria-label="Karta mavzusi">
        {themesInGroup(group).map((id) => {
          const theme = CARD_THEMES[id];
          return (
            <button key={id} type="button" role="radio" aria-checked={design.bg === id} aria-label={`Mavzu: ${theme.label}`} className="card-theme" onClick={() => onChange({ ...design, bg: id })}>
              <span className="card-theme-tile" aria-hidden="true" style={{ background: theme.background, color: theme.ink, fontFamily: CARD_FONT_FAMILY[design.font] }}>Aa</span>
              <span className="card-theme-label">{theme.label}</span>
            </button>
          );
        })}
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
