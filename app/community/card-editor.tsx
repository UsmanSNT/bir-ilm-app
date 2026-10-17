"use client";

import { useState } from "react";
import { AlignCenter, AlignLeft, AlignRight, Check, LayoutTemplate, Minus, Plus, Smile, Trash2, Type, type LucideIcon } from "lucide-react";
import {
  CARD_FONTS,
  CARD_LIMITS,
  CARD_STICKERS,
  type CardAlign,
  type CardDesign,
  type CardFont,
} from "@/shared/contract/community";
import DesignCard, { CARD_FONT_STYLE } from "./design-card";
import { CARD_THEMES, CARD_THEME_GROUPS, type CardThemeGroup, themeOf, themesInGroup } from "./card-themes";

const FONT_LABELS: Record<CardFont, string> = { serif: "Klassik", sans: "Zamonaviy", mono: "Mashinka", italic: "Nafis", bold: "Qalin", hand: "Qo‘lyozma" };
const ALIGN_META: Record<CardAlign, { label: string; icon: LucideIcon }> = {
  left: { label: "Chapga", icon: AlignLeft },
  center: { label: "O‘rtaga", icon: AlignCenter },
  right: { label: "O‘ngga", icon: AlignRight },
};
/** Ekrandagi tartib (chap → o'ng). */
const ALIGN_ORDER: CardAlign[] = ["left", "center", "right"];

type Tool = "theme" | "text" | "sticker";
const TOOLS: ReadonlyArray<{ id: Tool; label: string; icon: LucideIcon }> = [
  { id: "theme", label: "Shablon", icon: LayoutTemplate },
  { id: "text", label: "Matn", icon: Type },
  { id: "sticker", label: "Stiker", icon: Smile },
];

const STICKER_SCALE = { min: 0.6, max: 2.5, step: 0.2 } as const;
/** Kartada ko'pi bilan shuncha qator — matn o'qiladigan kattalikda qolsin; ortiqchasi oxirgi qatorga qo'shiladi. */
const MAX_LINES = 12;

function limitLines(text: string): string {
  const lines = text.split("\n");
  return lines.length <= MAX_LINES ? text : [...lines.slice(0, MAX_LINES - 1), lines.slice(MAX_LINES - 1).join(" ")].join("\n");
}
const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

export const EMPTY_CARD: CardDesign = { bg: "peshtoq", font: "serif", align: "center", text: "", stickers: [] };

/**
 * Karta muharriri: matn va kitob nomi kartaning o'zida yoziladi; pastda uchta asbob —
 * shablon, matn (shrift va tekislash) va stikerlar. Tanlangan stiker uchun alohida panel.
 */
export function CardEditor({ design, onChange, book, onBookChange }: {
  design: CardDesign;
  onChange: (next: CardDesign) => void;
  book: string;
  onBookChange: (book: string) => void;
}) {
  const [selected, setSelected] = useState(-1);
  const [tool, setTool] = useState<Tool>("theme");
  const [group, setGroup] = useState<CardThemeGroup>(themeOf(design.bg).group);
  const sel = design.stickers[selected];
  const full = design.stickers.length >= CARD_LIMITS.stickers;

  const updateSticker = (index: number, patch: Partial<CardDesign["stickers"][number]>) =>
    onChange({ ...design, stickers: design.stickers.map((s, i) => (i === index ? { ...s, ...patch } : s)) });

  const removeSticker = (index: number) => {
    onChange({ ...design, stickers: design.stickers.filter((_, i) => i !== index) });
    setSelected(-1);
  };

  const addSticker = (e: (typeof CARD_STICKERS)[number]) => {
    if (full) return;
    const n = design.stickers.length;
    // Yangi stikerlar matnni to'smasin: burchaklarga navbat bilan.
    const spots = [[80, 18], [20, 82], [82, 80], [18, 20], [50, 86], [86, 50], [14, 50], [50, 14]];
    const [x, y] = spots[n % spots.length];
    onChange({ ...design, stickers: [...design.stickers, { e, x, y, s: 1 }] });
    setSelected(n);
  };

  return (
    <div className="ce">
      <div className="ce-stage">
        <DesignCard
          design={design}
          book={book}
          editing={{
            selected,
            onSelectSticker: setSelected,
            onMoveSticker: (i, x, y) => updateSticker(i, { x: clampPercent(x), y: clampPercent(y) }),
            onRemoveSticker: removeSticker,
            onText: (text) => onChange({ ...design, text: limitLines(text) }),
            onBook: onBookChange,
          }}
        />
      </div>

      {sel ? (
        <div className="ce-sticker-bar" role="group" aria-label="Tanlangan stiker">
          <span className="ce-sticker-now" aria-hidden="true">{sel.e}</span>
          <span className="ce-sticker-hint">Sudrab joylang</span>
          <button type="button" aria-label="Kichraytirish" disabled={sel.s <= STICKER_SCALE.min} onClick={() => updateSticker(selected, { s: Math.max(STICKER_SCALE.min, sel.s - STICKER_SCALE.step) })}><Minus size={18} /></button>
          <button type="button" aria-label="Kattalashtirish" disabled={sel.s >= STICKER_SCALE.max} onClick={() => updateSticker(selected, { s: Math.min(STICKER_SCALE.max, sel.s + STICKER_SCALE.step) })}><Plus size={18} /></button>
          <button type="button" className="is-danger" aria-label="Stikerni o‘chirish" onClick={() => removeSticker(selected)}><Trash2 size={18} /></button>
          <button type="button" className="is-done" aria-label="Tayyor" onClick={() => setSelected(-1)}><Check size={18} /></button>
        </div>
      ) : null}

      <div className="ce-tools" role="tablist" aria-label="Karta asboblari">
        {TOOLS.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" role="tab" id={`ce-tab-${id}`} aria-selected={tool === id} aria-controls="ce-panel" onClick={() => setTool(id)}>
            <Icon size={18} aria-hidden="true" />{label}
          </button>
        ))}
      </div>

      <div className="ce-panel" id="ce-panel" role="tabpanel" aria-labelledby={`ce-tab-${tool}`}>
        {tool === "theme" && (
          <>
            <div className="ce-chips" role="radiogroup" aria-label="Shablon turi">
              {CARD_THEME_GROUPS.map((g) => (
                <button key={g.id} type="button" role="radio" aria-checked={group === g.id} onClick={() => setGroup(g.id)}>{g.label}</button>
              ))}
            </div>
            <div className="ce-scroll" role="radiogroup" aria-label="Shablon">
              {themesInGroup(group).map((id) => (
                <button key={id} type="button" role="radio" aria-checked={design.bg === id} className="ce-theme" onClick={() => onChange({ ...design, bg: id })}>
                  <DesignCard design={{ ...design, bg: id, text: "", stickers: [] }} sample />
                  <span>{CARD_THEMES[id].label}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {tool === "text" && (
          <>
            <div className="ce-scroll" role="radiogroup" aria-label="Shrift">
              {CARD_FONTS.map((font) => {
                const style = CARD_FONT_STYLE[font];
                return (
                  <button key={font} type="button" role="radio" aria-checked={design.font === font} className="ce-font" onClick={() => onChange({ ...design, font })}>
                    <b style={{ fontFamily: style.family, fontWeight: style.weight, fontStyle: style.italic ? "italic" : undefined, fontSize: `${Math.round(24 * style.scale)}px` }}>Aa</b>
                    <span>{FONT_LABELS[font]}</span>
                  </button>
                );
              })}
            </div>
            <div className="ce-aligns" role="radiogroup" aria-label="Matnni tekislash">
              {ALIGN_ORDER.map((align) => {
                const { label, icon: Icon } = ALIGN_META[align];
                return (
                  <button key={align} type="button" role="radio" aria-checked={(design.align ?? "center") === align} onClick={() => onChange({ ...design, align })}>
                    <Icon size={18} aria-hidden="true" />{label}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {tool === "sticker" && (
          <>
            <div className="ce-stickers">
              {CARD_STICKERS.map((e) => (
                <button key={e} type="button" aria-label={`Stiker qo‘shish ${e}`} disabled={full} onClick={() => addSticker(e)}>{e}</button>
              ))}
            </div>
            <p className="ce-note">{full ? `Ko‘pi bilan ${CARD_LIMITS.stickers} ta stiker.` : `Bosing — kartaga qo‘shiladi · ${design.stickers.length}/${CARD_LIMITS.stickers}`}</p>
          </>
        )}
      </div>
    </div>
  );
}
