/** Gurung "karta" postlari: rangli fon + matn + stikerlar. Klient va server bir xil qoidadan foydalanadi. */

export const backgrounds = {
  emerald: "linear-gradient(135deg, #0f5132 0%, #1f7a55 100%)",
  gold: "linear-gradient(135deg, #b8860b 0%, #f2d16b 100%)",
  night: "linear-gradient(160deg, #0b1210 0%, #1d3a31 100%)",
  sunset: "linear-gradient(135deg, #f58529 0%, #dd2a7b 55%, #8134af 100%)",
  ocean: "linear-gradient(135deg, #1e3c72 0%, #2a8fbd 100%)",
  rose: "linear-gradient(135deg, #f8cdda 0%, #c86b98 100%)",
  sand: "linear-gradient(135deg, #f8f6f0 0%, #e7dcc3 100%)",
  ink: "#1a1a1a",
} as const;
export type Background = keyof typeof backgrounds;
const lightBackgrounds: Background[] = ["gold", "rose", "sand"];
export const textColor = (bg: Background) => (lightBackgrounds.includes(bg) ? "#1a1a1a" : "#ffffff");

export const fonts = { serif: "Georgia, 'Times New Roman', serif", sans: "system-ui, -apple-system, 'Segoe UI', sans-serif", mono: "ui-monospace, 'SF Mono', Menlo, monospace" } as const;
export type FontId = keyof typeof fonts;

export const stickers = ["📚", "📖", "✨", "💡", "❤️", "🔥", "🌙", "☕", "🖋️", "🌿", "⭐", "🎯", "🕌", "🤲", "🌸", "🧠", "🏆", "👏"] as const;

export type Sticker = { e: string; x: number; y: number; s: number };
export type PostDesign = { bg: Background; font: FontId; text: string; stickers: Sticker[] };

export const MAX_CARD_TEXT = 280;
export const MAX_STICKERS = 12;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Ishonchsiz kirishni tekshiradi va normallashtiradi. Noto'g'ri bo'lsa null. */
export function parseDesign(raw: unknown): PostDesign | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const d = raw as Record<string, unknown>;
  if (typeof d.bg !== "string" || !(d.bg in backgrounds)) return null;
  if (typeof d.font !== "string" || !(d.font in fonts)) return null;
  if (typeof d.text !== "string" || d.text.length > MAX_CARD_TEXT) return null;
  if (!Array.isArray(d.stickers) || d.stickers.length > MAX_STICKERS) return null;
  const list: Sticker[] = [];
  for (const item of d.stickers) {
    if (!item || typeof item !== "object") return null;
    const s = item as Record<string, unknown>;
    if (typeof s.e !== "string" || !(stickers as readonly string[]).includes(s.e) || !isNum(s.x) || !isNum(s.y) || !isNum(s.s)) return null;
    list.push({ e: s.e, x: Math.round(clamp(s.x, 0, 100) * 10) / 10, y: Math.round(clamp(s.y, 0, 100) * 10) / 10, s: Math.round(clamp(s.s, 0.6, 2.5) * 100) / 100 });
  }
  const text = d.text.trim();
  if (!text && !list.length) return null;
  return { bg: d.bg as Background, font: d.font as FontId, text, stickers: list };
}
