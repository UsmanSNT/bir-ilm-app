/**
 * Jamoa avatarlari: rasm qo'ymaslikni xohlaganlar uchun yuzsiz, oddiy tasvirlar.
 * Hammasi 200×250 maydonda, yelkadan yuqori qismi; fon yo'q (kartaning o'z foni ko'rinadi).
 * Shakllar tepadan pastga, ya'ni orqadan oldingisiga chiziladi.
 */
import type { TeamAvatar } from "@/shared/contract";

export type AvatarShape = { d: string; fill: string; opacity?: number };

export const AVATAR_VIEWBOX = { width: 200, height: 250 } as const;

const ellipse = (cx: number, cy: number, rx: number, ry: number) =>
  `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;

const SKIN = { woman: "#f1cfae", man: "#dcab84" } as const;
const SHADE = "#1b1a2e";

/** Hijobli ayol: bosh va bo'yin hijob bilan o'ralgan, yuz tasvirsiz. */
const woman: AvatarShape[] = [
  // Kiyim (yelka)
  { d: "M14 250C18 212 54 192 100 192S182 212 186 250Z", fill: "#2f9a95" },
  { d: "M14 250C18 212 54 192 100 192S182 212 186 250Z", fill: SHADE, opacity: 0.12 },
  // Hijobning yelkaga tushgan qismi
  { d: "M100 150C64 150 40 176 34 214C58 202 82 198 100 198S142 202 166 214C160 176 136 150 100 150Z", fill: "#f6efdf" },
  { d: "M100 186C74 188 52 198 34 214C58 202 82 198 100 198S142 202 166 214C148 198 126 188 100 186Z", fill: SHADE, opacity: 0.1 },
  // Hijobning bosh qismi
  { d: "M100 34C64 34 48 66 48 106C48 140 56 160 66 176C80 186 120 186 134 176C144 160 152 140 152 106C152 66 136 34 100 34Z", fill: "#f6efdf" },
  // Yuz atrofidagi qatlam (hijob ichi)
  { d: ellipse(100, 108, 36, 46), fill: "#d9ccb0" },
  // Yuz
  { d: ellipse(100, 110, 29, 38), fill: SKIN.woman },
  { d: "M71 112C71 134 84 148 100 148S129 134 129 112C122 130 112 138 100 138S78 130 71 112Z", fill: SHADE, opacity: 0.06 },
  // Hijob burmasi (iyak ostida)
  { d: "M70 168C86 180 114 180 130 168C124 186 76 186 70 168Z", fill: "#e5d9bd" },
];

/** Yigit: qisqa, ixcham soch va oz ildiz soqol; yuz tasvirsiz. */
const man: AvatarShape[] = [
  // Kiyim (yelka)
  { d: "M8 250C12 212 50 192 100 192S188 212 192 250Z", fill: "#3d5aa5" },
  { d: "M8 250C12 212 50 192 100 192S188 212 192 250Z", fill: SHADE, opacity: 0.1 },
  // Yoqa ichidagi ko'ylak
  { d: "M72 196L100 236L128 196C118 202 82 202 72 196Z", fill: "#f6efdf" },
  { d: "M72 196L84 230L100 236L72 196ZM128 196L116 230L100 236L128 196Z", fill: SHADE, opacity: 0.12 },
  // Bo'yin
  { d: "M84 150H116V196C108 204 92 204 84 196Z", fill: SKIN.man },
  { d: "M84 168C94 178 106 178 116 168V150H84Z", fill: SHADE, opacity: 0.12 },
  // Quloqlar
  { d: ellipse(66, 112, 7, 12), fill: SKIN.man },
  { d: ellipse(134, 112, 7, 12), fill: SKIN.man },
  // Yuz
  { d: "M66 96C66 60 82 44 100 44S134 60 134 96V116C134 142 120 158 100 158S66 142 66 116Z", fill: SKIN.man },
  // Soqol (ildiz)
  { d: "M66 116C66 142 80 158 100 158S134 142 134 116C130 128 124 134 116 138C108 134 92 134 84 138C76 134 70 128 66 116Z", fill: SHADE, opacity: 0.55 },
  // Soch
  { d: "M63 100C58 62 76 34 104 34C128 34 144 56 137 100C134 84 128 72 118 66C104 74 80 72 70 80C66 84 64 92 63 100Z", fill: "#2a2434" },
];

export const AVATAR_ART: Record<TeamAvatar, AvatarShape[]> = { woman, man };
