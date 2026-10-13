import { CARD_THEME_IDS, type CardBackground } from "@/shared/contract/community";

/**
 * Karta mavzulari: fon (gradient + naqsh) va matn rangi.
 * Ilhom: Registon/Buxoro naqshlari (peshtoq, girih, sakkiz qirrali yulduz), Bir Ilm logotipidagi
 * daraxt va barglar (to'q kulrang-ko'k va zumrad yashil), hamda zamonaviy gradientlar.
 */

export type CardThemeGroup = "milliy" | "daraxt" | "rang" | "zamonaviy";

export type CardTheme = {
  label: string;
  group: CardThemeGroup;
  /** CSS `background` qiymati (naqsh qatlami gradient ustida). */
  background: string;
  /** Matn rangi: fon to'q bo'lsa oq, och bo'lsa to'q siyoh. */
  ink: string;
};

export const CARD_THEME_GROUPS: ReadonlyArray<{ id: CardThemeGroup; label: string }> = [
  { id: "milliy", label: "Milliy" },
  { id: "daraxt", label: "Bir Ilm" },
  { id: "rang", label: "Ranglar" },
  { id: "zamonaviy", label: "Zamonaviy" },
];

const INK_LIGHT = "#ffffff";
const INK_DARK = "#1b1a2e";

/** Naqshni takrorlanadigan plitka sifatida SVG data URI qilib beradi. */
function tile(size: number, body: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${body}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** Sakkiz qirrali yulduz (rub el-hizb) ko'pburchagi: 8 uchi va 8 botiqligi. */
function star(cx: number, cy: number, outer: number, inner: number): string {
  const points: string[] = [];
  for (let i = 0; i < 16; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const angle = (Math.PI / 8) * i - Math.PI / 2;
    points.push(`${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`);
  }
  return points.join(" ");
}

/** Bargning tomchi shakli, (x, y) nuqtada `rotate` gradus burilgan. */
function leaf(x: number, y: number, rotate: number, fill: string, opacity: number): string {
  return `<path transform="translate(${x} ${y}) rotate(${rotate})" d="M0 -9 C5 -5 5 4 0 9 C-5 4 -5 -5 0 -9Z" fill="${fill}" fill-opacity="${opacity}"/>`;
}

const starLine = (color: string, opacity: number) =>
  tile(40, `<polygon points="${star(20, 20, 18, 8)}" fill="none" stroke="${color}" stroke-opacity="${opacity}" stroke-width="1"/>`);

const PESHTOQ_STAR = starLine("#e2b65c", 0.28);
const GIRIH_STARS = tile(40, `<polygon points="${star(20, 20, 18, 8)}" fill="none" stroke="#ffffff" stroke-opacity=".2"/><polygon points="${star(20, 20, 8, 3.5)}" fill="none" stroke="#ffffff" stroke-opacity=".2"/>`);
const KASHI_STAR = starLine("#1e2f6e", 0.14);
const BODOM_STAR = starLine("#8a6511", 0.22);

const DAARAXT_LEAVES = tile(44, leaf(11, 11, 20, "#3cb88a", 0.2) + leaf(33, 33, -20, "#3cb88a", 0.2) + leaf(33, 9, 0, "#3cb88a", 0.12) + leaf(9, 33, 0, "#3cb88a", 0.12));
const BARG_LEAVES = tile(44, leaf(11, 11, 20, "#ffffff", 0.22) + leaf(33, 33, -20, "#ffffff", 0.22) + leaf(33, 9, 0, "#ffffff", 0.14) + leaf(9, 33, 0, "#ffffff", 0.14));
const ILDIZ_BRANCHES = tile(60, `<path d="M30 60 Q30 40 14 26 M30 60 Q30 40 46 26 M30 36 Q24 20 30 6" fill="none" stroke="#2b3d4f" stroke-opacity=".14" stroke-width="1.6" stroke-linecap="round"/>`);
const NUQTA_DOTS = tile(16, `<circle cx="8" cy="8" r="1.4" fill="#ffffff" fill-opacity=".14"/>`);

export const CARD_THEMES: Record<CardBackground, CardTheme> = {
  peshtoq: { label: "Peshtoq", group: "milliy", background: `${PESHTOQ_STAR}, linear-gradient(160deg, #131f4c 0%, #2c4398 100%)`, ink: INK_LIGHT },
  girih: { label: "Girih", group: "milliy", background: `${GIRIH_STARS}, linear-gradient(135deg, #0b4d4d 0%, #17a2a0 100%)`, ink: INK_LIGHT },
  kashi: { label: "Kashi", group: "milliy", background: `${KASHI_STAR}, linear-gradient(135deg, #ffffff 0%, #eaf1fb 100%)`, ink: INK_DARK },
  atlas: { label: "Atlas", group: "milliy", background: "repeating-linear-gradient(45deg, rgba(255,255,255,.07) 0 6px, transparent 6px 14px), linear-gradient(135deg, #7a2620 0%, #d0574a 100%)", ink: INK_LIGHT },
  bodom: { label: "Bodom", group: "milliy", background: `${BODOM_STAR}, linear-gradient(135deg, #f6e7c6 0%, #e2b65c 100%)`, ink: INK_DARK },

  daraxt: { label: "Daraxt", group: "daraxt", background: `${DAARAXT_LEAVES}, linear-gradient(160deg, #2b3d4f 0%, #3a5366 100%)`, ink: INK_LIGHT },
  barg: { label: "Barg", group: "daraxt", background: `${BARG_LEAVES}, linear-gradient(135deg, #1f8f66 0%, #3cb88a 100%)`, ink: INK_LIGHT },
  ildiz: { label: "Ildiz", group: "daraxt", background: `${ILDIZ_BRANCHES}, linear-gradient(180deg, #f7f9f7 0%, #e6eee9 100%)`, ink: INK_DARK },

  lojuvard: { label: "Lojuvard", group: "rang", background: "linear-gradient(135deg, #131f4c 0%, #2c4398 100%)", ink: INK_LIGHT },
  firuza: { label: "Firuza", group: "rang", background: "linear-gradient(135deg, #0b4d4d 0%, #17a2a0 100%)", ink: INK_LIGHT },
  tilla: { label: "Tilla", group: "rang", background: "linear-gradient(135deg, #c08a2e 0%, #f3d48d 100%)", ink: INK_DARK },
  anor: { label: "Anor", group: "rang", background: "linear-gradient(135deg, #7a2620 0%, #d0574a 100%)", ink: INK_LIGHT },
  tun: { label: "Tun", group: "rang", background: "linear-gradient(160deg, #0d1022 0%, #262b55 100%)", ink: INK_LIGHT },
  shom: { label: "Shom", group: "rang", background: "linear-gradient(135deg, #f58529 0%, #dd2a7b 55%, #8134af 100%)", ink: INK_LIGHT },
  gul: { label: "Gul", group: "rang", background: "linear-gradient(135deg, #f8cdda 0%, #c86b98 100%)", ink: INK_DARK },
  qogoz: { label: "Qog‘oz", group: "rang", background: "linear-gradient(135deg, #fffbf3 0%, #efe5d1 100%)", ink: INK_DARK },

  mesh: { label: "Aralash", group: "zamonaviy", background: "radial-gradient(circle at 18% 22%, #ff8a5c 0, transparent 46%), radial-gradient(circle at 84% 18%, #7c5cff 0, transparent 48%), radial-gradient(circle at 70% 88%, #2ed3b7 0, transparent 50%), linear-gradient(135deg, #1b1b3a 0%, #3a1f4f 100%)", ink: INK_LIGHT },
  okean: { label: "Okean", group: "zamonaviy", background: "linear-gradient(160deg, #00c6fb 0%, #005bea 100%)", ink: INK_LIGHT },
  neon: { label: "Yorqin", group: "zamonaviy", background: "radial-gradient(circle at 12% 88%, rgba(255,45,149,.55) 0, transparent 45%), radial-gradient(circle at 88% 12%, rgba(0,229,255,.5) 0, transparent 45%), #0d0d1a", ink: INK_LIGHT },
  nuqta: { label: "Nuqta", group: "zamonaviy", background: `${NUQTA_DOTS}, linear-gradient(180deg, #17171f 0%, #0b0b10 100%)`, ink: INK_LIGHT },
};

/** Guruhlar bo'yicha mavzu id lari, `CARD_THEME_IDS` tartibida. */
export function themesInGroup(group: CardThemeGroup): CardBackground[] {
  return CARD_THEME_IDS.filter((id) => CARD_THEMES[id].group === group);
}
