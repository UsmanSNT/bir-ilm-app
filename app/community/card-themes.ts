import { CARD_THEME_IDS, type CardBackground } from "@/shared/contract/community";

/**
 * Karta shablonlari: fon (gradient + naqsh), ustidagi bezak (ramka, peshtoq, gulchambar) va ranglar.
 * Ilhom: Registon va Buxoro peshtoqlari, girih va koshin, Marg'ilon atlasi, bodom (buta) naqshi,
 * Bir Ilm logotipidagi daraxt va barglar hamda zamonaviy gradientlar.
 *
 * O'lchamlar karta enining foizida (`cqw`) — shablon lentada, muharrirda va kichik namunada bir xil ko'rinadi.
 * Id lar `CARD_THEME_IDS` da qotirilgan (saqlangan postlar va eski ilovalar); bu yerda faqat ko'rinish.
 */

export type CardThemeGroup = "milliy" | "daraxt" | "rang" | "zamonaviy";
export type CardPad = readonly [top: number, right: number, bottom: number, left: number];
export const DEFAULT_PAD: CardPad = [12, 10, 12, 10];

export type CardTheme = {
  label: string;
  group: CardThemeGroup;
  /** CSS `background` qiymati (naqsh qatlamlari gradient ustida). */
  background: string;
  /** Matn rangi. */
  ink: string;
  /** Bezak rangi: iqtibos belgisi, kitob nomi, kursor, «Bir Ilm» belgisi. */
  accent: string;
  /** Karta ustidagi bezak qatlami: 100×100 SVG, karta o'lchamiga cho'ziladi. */
  frame?: string;
  /** Matn maydonining chegarasi (ramka ichida qolishi uchun), cqw: [yuqori, o'ng, past, chap]. */
  pad?: CardPad;
  /** Matn o'lchami koeffitsienti (tor maydonli shablonlar uchun < 1). */
  fit?: number;
  /** Matn ostidagi plashka — naqshi yorqin fonda o'qilishi uchun («Bir Ilm» belgisi ham plashka ichida). */
  plate?: string;
  /** Matn tepasida katta iqtibos belgisi. */
  quote?: boolean;
  /** Matn soyasi (`text-shadow`). */
  glow?: string;
  /** «Bir Ilm» belgisining rangi (bezak ustiga tushsa). */
  brand?: string;
  /** «Bir Ilm» belgisining pastdan masofasi (bezak ostida qolmasligi uchun). */
  brandAt?: string;
};

export const CARD_THEME_GROUPS: ReadonlyArray<{ id: CardThemeGroup; label: string }> = [
  { id: "milliy", label: "Milliy" },
  { id: "daraxt", label: "Bir Ilm" },
  { id: "rang", label: "Ranglar" },
  { id: "zamonaviy", label: "Zamonaviy" },
];

// ── SVG yordamchilari ────────────────────────────────────────────────

const svgUrl = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

/** Takrorlanadigan naqsh plitkasi; `size` — karta enining foizida. */
function tile(view: number, size: number, body: string, height = view): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${view} ${height}">${body}</svg>`;
  return `${svgUrl(svg)} 0 0 / ${size}cqw ${(size * height) / view}cqw`;
}

/** Kartaning ustidagi bezak: 100×100 koordinatalar. */
function layer(body: string): string {
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none">${body}</svg>`);
}

const f = (n: number) => Number(n.toFixed(2));

/** Sakkiz qirrali yulduz (rub el-hizb): 8 uchi va 8 botiqligi. */
function star(cx: number, cy: number, outer: number, inner: number): string {
  const points: string[] = [];
  for (let i = 0; i < 16; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const angle = (Math.PI / 8) * i - Math.PI / 2;
    points.push(`${f(cx + r * Math.cos(angle))},${f(cy + r * Math.sin(angle))}`);
  }
  return points.join(" ");
}

const LEAF = "M0 -9 C5 -5 5 4 0 9 C-5 4 -5 -5 0 -9Z";

/** Barg: markazi (x, y), uchi `angle` gradus yo'nalishida. */
function leaf(x: number, y: number, angle: number, scale: number, fill: string, opacity: number, vein?: string): string {
  const transform = `translate(${f(x)} ${f(y)}) rotate(${f(angle + 90)}) scale(${scale})`;
  const veinPath = vein ? `<path d="M0 -7 V8" stroke="${vein}" stroke-width=".35" stroke-opacity=".28" fill="none"/>` : "";
  return `<g transform="${transform}"><path d="${LEAF}" fill="${fill}" fill-opacity="${opacity}"/>${veinPath}</g>`;
}

/** Dafna gulchambari: ikki shox pastdan yuqoriga, matnni o'rab turadi. */
function laurel(color: string): string {
  const R = 41;
  const cy = 52;
  const rad = (deg: number) => (deg * Math.PI) / 180;
  let body = "";
  for (const side of [-1, 1] as const) {
    // Chap shox: aylana bo'ylab pastdan (100°) yuqori-chapga (212°); o'ngi — ko'zgu aksi.
    const mirror = (x: number) => (side === -1 ? x : 100 - x);
    const point = (deg: number) => ({ x: mirror(50 + R * Math.cos(rad(deg))), y: cy + R * Math.sin(rad(deg)) });
    /** Shox bo'ylab uchiga qarab yo'nalish (gradus). */
    const tangent = (deg: number) => (Math.atan2(Math.cos(rad(deg)), -Math.sin(rad(deg)) * -side) * 180) / Math.PI;
    const start = point(100);
    const end = point(212);
    body += `<path d="M${f(start.x)} ${f(start.y)} A${R} ${R} 0 0 ${side === -1 ? 1 : 0} ${f(end.x)} ${f(end.y)}" fill="none" stroke="${color}" stroke-width=".55" stroke-opacity=".75"/>`;
    for (let deg = 108; deg <= 204; deg += 12) {
      const p = point(deg);
      const size = 0.34 - ((deg - 108) / 96) * 0.1;
      for (const spread of [-38, 38]) {
        const dir = tangent(deg) + spread;
        body += leaf(p.x + Math.cos(rad(dir)) * 3, p.y + Math.sin(rad(dir)) * 3, dir, size, color, 0.85);
      }
    }
    const dir = tangent(212);
    body += leaf(end.x + Math.cos(rad(dir)) * 2.6, end.y + Math.sin(rad(dir)) * 2.6, dir, 0.26, color, 0.85);
  }
  return body;
}

// ── Naqshlar ─────────────────────────────────────────────────────────

const GOLD = "#e8c271";

/** Mayda don (bosma qog'oz kabi): rangli fonlarga «jonli» tus beradi. */
const GRAIN = `${svgUrl(
  `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .9 -.35"/></filter><rect width="160" height="160" filter="url(#n)" opacity=".16"/></svg>`,
)} 0 0 / 160px 160px`;

/** Girih: ikki kvadratdan sakkiz qirrali yulduz va ular orasidagi xochlar. */
const GIRIH = tile(40, 18, `<g fill="none" stroke="#ffffff" stroke-opacity=".11" stroke-width=".9"><path d="M20 0 L40 20 L20 40 L0 20Z"/><rect x="5.86" y="5.86" width="28.28" height="28.28"/><circle cx="20" cy="20" r="4.5"/></g>`);

/** Ikat (abr): pog'onali chetli rombsimon «olov» shakllari, ikki ustunda. */
function ikatLozenge(cx: number, cy: number, w: number, h: number, fill: string): string {
  const steps = 7;
  const pts: string[] = [];
  const push = (x: number, y: number) => pts.push(`${f(x)},${f(y)}`);
  for (let i = 0; i <= steps; i++) push(cx + (w / 2) * (i / steps) + (i % 2 ? 1.1 : 0), cy - h / 2 + (h / 2) * (i / steps));
  for (let i = 1; i <= steps; i++) push(cx + (w / 2) * (1 - i / steps) + (i % 2 ? 1.1 : 0), cy + (h / 2) * (i / steps));
  for (let i = 1; i <= steps; i++) push(cx - (w / 2) * (i / steps) - (i % 2 ? 1.1 : 0), cy + h / 2 - (h / 2) * (i / steps));
  for (let i = 1; i < steps; i++) push(cx - (w / 2) * (1 - i / steps) - (i % 2 ? 1.1 : 0), cy - (h / 2) * (i / steps));
  return `<polygon points="${pts.join(" ")}" fill="${fill}"/>`;
}
const IKAT = tile(
  40,
  30,
  [
    `<rect width="40" height="80" fill="#24205e"/>`,
    ...[20, 60].flatMap((cy) => [ikatLozenge(10, cy, 19, 40, "#c2185b"), ikatLozenge(10, cy, 11, 24, "#f6b81a"), ikatLozenge(10, cy, 4, 10, "#24205e")]),
    ...[0, 40, 80].flatMap((cy) => [ikatLozenge(30, cy, 19, 40, "#0f8a68"), ikatLozenge(30, cy, 11, 24, "#fff4dc"), ikatLozenge(30, cy, 4, 10, "#d43f2f")]),
  ].join(""),
  80,
);

/** Bodom (buta) naqshi. */
const BUTA = "M10 17 C5 17 3.4 12.6 5.4 9.6 C7.4 6.6 11.6 6.4 12.6 2.6 C14.8 5.8 15.2 9.2 14.1 12.2 C13 15.2 12.2 17 10 17Z";
const BODOM = tile(
  40,
  20,
  `<g fill="#7a4a12" fill-opacity=".1"><path d="${BUTA}"/><path d="${BUTA}" transform="rotate(180 20 20) translate(-10 -10)"/></g><g fill="#7a4a12" fill-opacity=".12"><circle cx="9.6" cy="12.4" r="1.4"/><circle cx="30" cy="27.6" r="1.4"/></g>`,
);

const LEAVES = (color: string, opacity: number) =>
  tile(44, 22, leaf(11, 11, -70, 0.9, color, opacity) + leaf(33, 33, -110, 0.9, color, opacity) + leaf(33, 9, -40, 0.6, color, opacity * 0.7) + leaf(9, 33, -140, 0.6, color, opacity * 0.7));

const RULED = tile(100, 100, `<g stroke="#9db6dc" stroke-opacity=".55" stroke-width=".35">${Array.from({ length: 14 }, (_, i) => `<line x1="0" x2="100" y1="${f(9 + i * 6.6)}" y2="${f(9 + i * 6.6)}"/>`).join("")}</g><line x1="13" x2="13" y1="0" y2="100" stroke="#e58f8f" stroke-width=".45"/>`);

const DOTS = tile(10, 5, `<circle cx="5" cy="5" r=".7" fill="#ffffff" fill-opacity=".16"/>`);

// ── Bezak qatlamlari ─────────────────────────────────────────────────

const ARCH = "M14 100 V47 C14 31 36 19 50 9.5 C64 19 86 31 86 47 V100";
const ARCH_IN = "M17 100 V47.6 C17 33.4 37.4 22.6 50 13.6 C62.6 22.6 83 33.4 83 47.6 V100";

const PESHTOQ_FRAME = layer(
  `<defs><pattern id="s" width="8" height="8" patternUnits="userSpaceOnUse"><polygon points="${star(4, 4, 3.6, 1.55)}" fill="none" stroke="${GOLD}" stroke-width=".32" stroke-opacity=".75"/><circle cx="0" cy="0" r=".55" fill="${GOLD}" fill-opacity=".6"/><circle cx="8" cy="0" r=".55" fill="${GOLD}" fill-opacity=".6"/><circle cx="0" cy="8" r=".55" fill="${GOLD}" fill-opacity=".6"/><circle cx="8" cy="8" r=".55" fill="${GOLD}" fill-opacity=".6"/></pattern></defs>`
  + `<path fill-rule="evenodd" fill="#060c2c" fill-opacity=".5" d="M0 0H100V100H0Z ${ARCH}Z"/>`
  + `<path fill-rule="evenodd" fill="url(#s)" d="M0 0H100V100H0Z ${ARCH}Z"/>`
  + `<rect x="3" y="3" width="94" height="94" fill="none" stroke="${GOLD}" stroke-width=".5" stroke-opacity=".8"/>`
  + `<path d="${ARCH}" fill="none" stroke="${GOLD}" stroke-width=".9"/>`
  + `<path d="${ARCH_IN}" fill="none" stroke="${GOLD}" stroke-width=".35" stroke-opacity=".7"/>`
  + `<polygon points="${star(50, 4.6, 2.6, 1.1)}" fill="${GOLD}"/>`,
);

const corner = (x: number, y: number) => `<polygon points="${star(x, y, 4.4, 1.9)}" fill="${GOLD}"/><circle cx="${x}" cy="${y}" r="1.25" fill="#0a4f4e"/>`;
const diamond = (x: number, y: number) => `<rect x="${x - 1.4}" y="${y - 1.4}" width="2.8" height="2.8" transform="rotate(45 ${x} ${y})" fill="${GOLD}"/>`;
const GIRIH_FRAME = layer(
  `<g fill="none" stroke="${GOLD}"><rect x="5.5" y="5.5" width="89" height="89" stroke-width=".7"/><rect x="8" y="8" width="84" height="84" stroke-width=".3" stroke-opacity=".7"/></g>`
  + corner(5.5, 5.5) + corner(94.5, 5.5) + corner(5.5, 94.5) + corner(94.5, 94.5)
  + diamond(50, 5.5) + diamond(50, 94.5) + diamond(5.5, 50) + diamond(94.5, 50),
);

const kashiBand = (y: number, id: string) =>
  `<defs><pattern id="${id}" width="10" height="13" patternUnits="userSpaceOnUse" patternTransform="translate(0 ${y})"><rect width="10" height="13" fill="#1d3f91"/><polygon points="${star(5, 6.5, 3.5, 1.5)}" fill="#ffffff" fill-opacity=".92"/><circle cx="5" cy="6.5" r=".9" fill="#1aa39f"/><circle cx="0" cy="6.5" r="1" fill="#59c3e8"/><circle cx="10" cy="6.5" r="1" fill="#59c3e8"/></pattern></defs><rect x="0" y="${y}" width="100" height="13" fill="url(#${id})"/>`;
const KASHI_FRAME = layer(
  kashiBand(0, "t") + kashiBand(87, "b")
  + `<g stroke-width=".5"><line x1="0" x2="100" y1="13.6" y2="13.6" stroke="#1aa39f"/><line x1="0" x2="100" y1="15" y2="15" stroke="#c99a3c" stroke-width=".3"/><line x1="0" x2="100" y1="86.4" y2="86.4" stroke="#1aa39f"/><line x1="0" x2="100" y1="85" y2="85" stroke="#c99a3c" stroke-width=".3"/></g>`,
);

const butaCorner = (x: number, y: number, rotate: number) => `<path d="${BUTA}" transform="translate(${x} ${y}) rotate(${rotate}) scale(.55) translate(-10 -10)" fill="#8b2c2c" fill-opacity=".75"/>`;
const BODOM_FRAME = layer(
  `<g fill="none" stroke="#8b2c2c"><rect x="4.5" y="4.5" width="91" height="91" rx="3" stroke-width=".6" stroke-opacity=".7"/><rect x="6.5" y="6.5" width="87" height="87" rx="2" stroke-width=".3" stroke-opacity=".5"/></g>`
  + butaCorner(11, 11, -45) + butaCorner(89, 11, 45) + butaCorner(11, 89, -135) + butaCorner(89, 89, 135),
);

const DARAXT_FRAME = layer(laurel("#3cb88a"));

const BARG_FRAME = layer(
  leaf(6, 8, 45, 3.3, "#ffffff", 0.12, "#ffffff") + leaf(19, 3, 20, 1.9, "#ffffff", 0.1, "#ffffff") + leaf(4, 22, 70, 1.7, "#ffffff", 0.09)
  + leaf(94, 92, -135, 3.3, "#ffffff", 0.12, "#ffffff") + leaf(81, 97, -160, 1.9, "#ffffff", 0.1, "#ffffff") + leaf(96, 78, -110, 1.7, "#ffffff", 0.09),
);

const ILDIZ_FRAME = layer(
  `<path d="M10 90 C28 84 40 93 56 88 S82 83 90 89" fill="none" stroke="#1f8f66" stroke-width=".5" stroke-opacity=".7"/>`
  + leaf(22, 85.6, -120, 0.4, "#1f8f66", 0.75) + leaf(34, 89.8, -60, 0.36, "#3cb88a", 0.75) + leaf(47, 88.2, -110, 0.4, "#1f8f66", 0.75)
  + leaf(62, 85.6, -70, 0.38, "#3cb88a", 0.75) + leaf(75, 84.6, -115, 0.36, "#1f8f66", 0.75) + leaf(87, 86.5, -40, 0.32, "#3cb88a", 0.75)
  + `<line x1="38" x2="62" y1="9" y2="9" stroke="#1f8f66" stroke-width=".35" stroke-opacity=".6"/>` + leaf(50, 9, -90, 0.3, "#3cb88a", 0.8),
);

/** Yulduzlar faqat chetlarda — matn ustiga tushmaydi. [x, y, r, shaffoflik] */
const NIGHT_SKY: ReadonlyArray<readonly [number, number, number, number]> = [
  [6, 7, 0.55, 0.8], [17, 4, 0.35, 0.6], [29, 10, 0.45, 0.7], [41, 5, 0.3, 0.5], [55, 8, 0.5, 0.8], [66, 3.5, 0.35, 0.6],
  [4, 22, 0.35, 0.5], [9, 36, 0.5, 0.7], [3.5, 52, 0.3, 0.5], [8, 67, 0.45, 0.6], [5, 82, 0.35, 0.6],
  [95, 34, 0.4, 0.6], [92, 48, 0.5, 0.7], [96.5, 62, 0.35, 0.5], [93, 76, 0.45, 0.6],
  [16, 94, 0.4, 0.6], [30, 90, 0.3, 0.5], [70, 93, 0.45, 0.7], [84, 89, 0.35, 0.6], [94, 95, 0.3, 0.5],
];
const sparkle = (x: number, y: number, r: number) => `<path d="M${x} ${y - r} L${f(x + r * 0.28)} ${f(y - r * 0.28)} L${x + r} ${y} L${f(x + r * 0.28)} ${f(y + r * 0.28)} L${x} ${y + r} L${f(x - r * 0.28)} ${f(y + r * 0.28)} L${x - r} ${y} L${f(x - r * 0.28)} ${f(y - r * 0.28)}Z" fill="#ffffff" fill-opacity=".9"/>`;
const TUN_FRAME = layer(
  NIGHT_SKY.map(([x, y, r, o]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#ffffff" fill-opacity="${o}"/>`).join("")
  + sparkle(22, 17, 1.6) + sparkle(12, 74, 1.2) + sparkle(88, 64, 1.3) + sparkle(60, 95, 1)
  + `<defs><mask id="m"><rect width="100" height="100" fill="#fff"/><circle cx="85.6" cy="13.6" r="6.6" fill="#000"/></mask></defs><circle cx="82" cy="17" r="7.4" fill="${GOLD}" mask="url(#m)"/>`,
);

const OKEAN_FRAME = layer(
  `<path d="M0 84 Q12.5 79 25 84 T50 84 T75 84 T100 84 V100 H0Z" fill="#ffffff" fill-opacity=".08"/>`
  + `<g fill="none" stroke="#ffffff" stroke-width=".5"><path d="M0 84 Q12.5 79 25 84 T50 84 T75 84 T100 84" stroke-opacity=".45"/><path d="M0 89 Q12.5 84.5 25 89 T50 89 T75 89 T100 89" stroke-opacity=".3"/><path d="M0 94 Q12.5 90 25 94 T50 94 T75 94 T100 94" stroke-opacity=".2"/></g>`,
);

const NEON_FRAME = layer(
  `<defs><filter id="g" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="1.1" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`
  + `<rect x="6" y="6" width="88" height="88" rx="5" fill="none" stroke="#ff3d9a" stroke-width=".7" filter="url(#g)"/>`
  + `<rect x="9" y="9" width="82" height="82" rx="3.5" fill="none" stroke="#36e3ff" stroke-width=".3" stroke-opacity=".7" filter="url(#g)"/>`,
);

const NUQTA_FRAME = layer(
  `<g fill="none" stroke="#d4ff3a" stroke-width=".9" stroke-linecap="square"><path d="M7 19 V7 H19"/><path d="M81 7 H93 V19"/><path d="M93 81 V93 H81"/><path d="M19 93 H7 V81"/></g>`,
);

// ── Shablonlar ───────────────────────────────────────────────────────

const WHITE = "#ffffff";

export const CARD_THEMES: Record<CardBackground, CardTheme> = {
  peshtoq: {
    label: "Peshtoq",
    group: "milliy",
    background: "radial-gradient(70% 55% at 50% 38%, #2f4fae 0%, transparent 72%), linear-gradient(180deg, #14245e 0%, #0c1742 100%)",
    ink: WHITE,
    accent: GOLD,
    frame: PESHTOQ_FRAME,
    pad: [31, 21, 13, 21],
    fit: 0.86,
    brandAt: "6cqw",
  },
  girih: {
    label: "Girih",
    group: "milliy",
    background: `${GIRIH}, radial-gradient(75% 60% at 50% 40%, #138a85 0%, transparent 75%), linear-gradient(160deg, #063a3d 0%, #0b5c5a 55%, #05373a 100%)`,
    ink: WHITE,
    accent: GOLD,
    frame: GIRIH_FRAME,
    pad: [17, 16, 17, 16],
    fit: 0.94,
    brandAt: "10.4cqw",
  },
  kashi: {
    label: "Koshin",
    group: "milliy",
    background: "radial-gradient(80% 60% at 50% 50%, #ffffff 0%, transparent 80%), linear-gradient(180deg, #faf6ec 0%, #efe7d5 100%)",
    ink: "#13285e",
    accent: "#1d3f91",
    frame: KASHI_FRAME,
    pad: [21, 12, 22, 12],
    fit: 0.94,
    brandAt: "16.4cqw",
  },
  atlas: {
    label: "Atlas",
    group: "milliy",
    background: IKAT,
    ink: "#2a1430",
    accent: "#b0175b",
    plate: "rgba(255, 249, 238, .95)",
    pad: [14, 11, 14, 11],
    fit: 0.9,
  },
  bodom: {
    label: "Bodom",
    group: "milliy",
    background: `${BODOM}, radial-gradient(75% 60% at 50% 45%, #fbf2dc 0%, transparent 75%), linear-gradient(160deg, #f4e4c0 0%, #e4c88c 100%)`,
    ink: "#3a2410",
    accent: "#8b2c2c",
    frame: BODOM_FRAME,
    pad: [17, 15, 17, 15],
    fit: 0.94,
    brandAt: "9cqw",
    quote: true,
  },

  daraxt: {
    label: "Gulchambar",
    group: "daraxt",
    background: `${GRAIN}, radial-gradient(70% 60% at 50% 42%, #3c5872 0%, transparent 75%), linear-gradient(170deg, #22313f 0%, #1a2632 100%)`,
    ink: WHITE,
    accent: "#57d3a4",
    frame: DARAXT_FRAME,
    pad: [17, 23, 19, 23],
    fit: 0.86,
  },
  barg: {
    label: "Barg",
    group: "daraxt",
    background: `${GRAIN}, radial-gradient(70% 60% at 30% 25%, #2fbf8b 0%, transparent 70%), linear-gradient(150deg, #0f6b4f 0%, #12855f 55%, #0b5a42 100%)`,
    ink: WHITE,
    accent: "#d9f99d",
    frame: BARG_FRAME,
    quote: true,
  },
  ildiz: {
    label: "Ildiz",
    group: "daraxt",
    background: `${LEAVES("#1f8f66", 0.06)}, linear-gradient(180deg, #f7faf6 0%, #e6efe7 100%)`,
    ink: "#22313f",
    accent: "#1f8f66",
    frame: ILDIZ_FRAME,
    pad: [14, 12, 18, 12],
  },

  lojuvard: {
    label: "Lojuvard",
    group: "rang",
    background: `${GRAIN}, radial-gradient(80% 60% at 18% 8%, #3a5fd0 0%, transparent 62%), linear-gradient(150deg, #142160 0%, #0d1745 100%)`,
    ink: WHITE,
    accent: GOLD,
    quote: true,
  },
  firuza: {
    label: "Firuza",
    group: "rang",
    background: `${GRAIN}, radial-gradient(80% 60% at 85% 5%, #2bc4b9 0%, transparent 62%), linear-gradient(160deg, #06464a 0%, #0b6f6b 100%)`,
    ink: WHITE,
    accent: "#ffe2a0",
    quote: true,
  },
  tilla: {
    label: "Tilla",
    group: "rang",
    background: `${GRAIN}, radial-gradient(70% 60% at 25% 15%, #fff1c6 0%, transparent 62%), linear-gradient(150deg, #ebc56c 0%, #b7852c 100%)`,
    ink: "#2a1b05",
    accent: "#6e4210",
    quote: true,
  },
  anor: {
    label: "Anor",
    group: "rang",
    background: `${GRAIN}, radial-gradient(70% 60% at 78% 10%, #e0554a 0%, transparent 62%), linear-gradient(160deg, #520b19 0%, #8e1a28 100%)`,
    ink: WHITE,
    accent: "#ffc9a8",
    quote: true,
  },
  tun: {
    label: "Tun",
    group: "rang",
    background: `${GRAIN}, radial-gradient(80% 60% at 50% 110%, #2a3375 0%, transparent 70%), linear-gradient(180deg, #050816 0%, #12173d 100%)`,
    ink: WHITE,
    accent: GOLD,
    frame: TUN_FRAME,
  },
  shom: {
    label: "Shom",
    group: "rang",
    background: `${GRAIN}, radial-gradient(45% 45% at 50% 100%, #ffd27a 0%, transparent 70%), linear-gradient(175deg, #ffae7a 0%, #ef6079 45%, #6d3a9e 100%)`,
    ink: WHITE,
    accent: "#fff3d6",
    glow: "0 0.4cqw 2.4cqw rgba(60, 10, 60, .35)",
  },
  gul: {
    label: "Gul",
    group: "rang",
    background: `${GRAIN}, radial-gradient(70% 60% at 25% 15%, #ffffff 0%, transparent 62%), linear-gradient(160deg, #fde6ec 0%, #f2b3c4 100%)`,
    ink: "#4d1630",
    accent: "#b0406f",
    quote: true,
  },
  qogoz: {
    label: "Daftar",
    group: "rang",
    background: `${RULED}, linear-gradient(180deg, #fffdf6 0%, #f7f1e3 100%)`,
    ink: "#23252f",
    accent: "#c0392b",
    pad: [13, 10, 14, 19],
  },

  mesh: {
    label: "Shafaq",
    group: "zamonaviy",
    background: `${GRAIN}, radial-gradient(60% 50% at 15% 20%, #ff7a59 0%, transparent 70%), radial-gradient(60% 55% at 85% 15%, #7b61ff 0%, transparent 70%), radial-gradient(70% 60% at 70% 92%, #19d3b0 0%, transparent 70%), linear-gradient(135deg, #17153a 0%, #2c1747 100%)`,
    ink: WHITE,
    accent: "#ffd6c4",
    glow: "0 0.3cqw 2cqw rgba(10, 5, 30, .35)",
  },
  okean: {
    label: "Okean",
    group: "zamonaviy",
    background: `${GRAIN}, radial-gradient(70% 55% at 20% 10%, #33c9ff 0%, transparent 65%), linear-gradient(170deg, #0a8fe0 0%, #0657d6 55%, #062b8a 100%)`,
    ink: WHITE,
    accent: "#c8f1ff",
    frame: OKEAN_FRAME,
    pad: [12, 10, 20, 10],
  },
  neon: {
    label: "Neon",
    group: "zamonaviy",
    background: "radial-gradient(55% 45% at 12% 88%, rgba(255, 45, 149, .35) 0%, transparent 70%), radial-gradient(55% 45% at 88% 12%, rgba(0, 229, 255, .3) 0%, transparent 70%), #0b0b16",
    ink: WHITE,
    accent: "#ff6fb5",
    frame: NEON_FRAME,
    pad: [15, 14, 15, 14],
    fit: 0.94,
    brandAt: "11.4cqw",
    glow: "0 0 1.2cqw rgba(54, 227, 255, .75), 0 0 4cqw rgba(255, 61, 154, .45)",
  },
  nuqta: {
    label: "Nuqta",
    group: "zamonaviy",
    background: `${DOTS}, linear-gradient(180deg, #17171f 0%, #0d0d12 100%)`,
    ink: "#f4f4f6",
    accent: "#d4ff3a",
    frame: NUQTA_FRAME,
    pad: [15, 14, 15, 14],
  },
};

/** Notanish fon (yangiroq ilovadan kelgan) — oddiy lojuvard bilan ko'rsatiladi. */
export const themeOf = (id: string): CardTheme => CARD_THEMES[id as CardBackground] ?? CARD_THEMES.lojuvard;

/** Guruhlar bo'yicha mavzu id lari, `CARD_THEME_IDS` tartibida. */
export function themesInGroup(group: CardThemeGroup): CardBackground[] {
  return CARD_THEME_IDS.filter((id) => CARD_THEMES[id].group === group);
}
