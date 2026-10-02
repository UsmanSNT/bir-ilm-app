/**
 * Community: formatlangan postlar, maqolalar, rasm/video va reaksiyalar.
 *
 * Matn HTML sifatida EMAS, bloklar ro'yxati (JSON) sifatida saqlanadi. Server
 * uni shu sxema bilan tekshiradi, mijoz esa React elementlariga aylantiradi —
 * shuning uchun post orqali skript (XSS) kiritib bo'lmaydi.
 */
import { z } from "zod";

/** Telegram'dagidek matn belgilari: qalin, kursiv, tagiga chizilgan, ustidan chizilgan, monospace, spoiler. */
export const TEXT_MARKS = ["b", "i", "u", "s", "code", "spoiler"] as const;
export type TextMark = (typeof TEXT_MARKS)[number];

export const REACTIONS = ["👍", "❤️", "🔥", "👏", "😂", "😮", "😢", "🙏", "🤔", "📚"] as const;
export type Reaction = (typeof REACTIONS)[number];

export const POST_FORMATS = ["post", "article", "card"] as const;
export type PostFormat = (typeof POST_FORMATS)[number];

const MB = 1024 * 1024;

export const COMMUNITY_LIMITS = {
  title: 160,
  book: 160,
  /** Oddiy post matni (Telegram xabari kabi). */
  postText: 4096,
  /** Maqola matni. */
  articleText: 60_000,
  blocks: 600,
  listItems: 100,
  /** Post tepasidagi albom (Telegram albomi kabi 10 tagacha). */
  attachments: 10,
  /** Matn ichidagi rasm/videolar. */
  inlineMedia: 40,
  caption: 300,
  url: 2048,
  imageBytes: 15 * MB,
  videoBytes: 300 * MB,
  chunkBytes: 8 * MB,
  /** Lentada maqola o'rniga ko'rsatiladigan qisqa matn. */
  excerpt: 320,
} as const;

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"] as const;
export const MEDIA_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

/** Havola faqat http(s) yoki mailto bo'lsin — `javascript:` kabi sxemalar rad etiladi. */
export function isSafeHref(href: string): boolean {
  return /^(https?:\/\/|mailto:)[^\s<>"]+$/i.test(href);
}

const inlineSchema = z.object({
  t: z.string().max(COMMUNITY_LIMITS.articleText),
  m: z.array(z.enum(TEXT_MARKS)).max(TEXT_MARKS.length).optional(),
  href: z.string().max(COMMUNITY_LIMITS.url).refine(isSafeHref, "Havola http:// yoki https:// bilan boshlansin.").optional(),
});
export type InlineText = z.infer<typeof inlineSchema>;

const inlines = z.array(inlineSchema).max(2000);

export const blockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("p"), c: inlines }),
  z.object({ type: z.literal("h"), level: z.union([z.literal(2), z.literal(3)]), c: inlines }),
  z.object({ type: z.literal("quote"), c: inlines }),
  z.object({ type: z.literal("code"), text: z.string().max(COMMUNITY_LIMITS.articleText) }),
  z.object({ type: z.literal("list"), ordered: z.boolean(), items: z.array(inlines).min(1).max(COMMUNITY_LIMITS.listItems) }),
  z.object({ type: z.literal("media"), id: z.string().uuid(), caption: z.string().trim().max(COMMUNITY_LIMITS.caption).optional() }),
  z.object({ type: z.literal("hr") }),
]);
export type Block = z.infer<typeof blockSchema>;

export const docSchema = z.array(blockSchema).max(COMMUNITY_LIMITS.blocks);
export type Doc = z.infer<typeof docSchema>;

// Spoiler matni oddiy nusxada ochilib qolmasin (lenta, e'lon, ulashish ko'rinishi) — Telegram kabi ▒ bilan.
const inlineText = (items: InlineText[]) =>
  items.map((item) => (item.m?.includes("spoiler") ? item.t.replace(/[^\s]/g, "▒") : item.t)).join("");

/**
 * Formatlangan matnning oddiy matnli nusxasi (uzunlik, qidiruv, e'lon, eski mijozlar uchun).
 * Rasm izohlari kirmaydi — ular qisqa matnda ("excerpt") gapni bo'lib yubormasin.
 */
export function docToText(doc: Doc): string {
  return doc
    .map((block) => {
      switch (block.type) {
        case "p":
        case "h":
        case "quote":
          return inlineText(block.c);
        case "code":
          return block.text;
        case "list":
          return block.items.map((item, i) => `${block.ordered ? `${i + 1}.` : "•"} ${inlineText(item)}`).join("\n");
        case "media":
        case "hr":
          return "";
      }
    })
    .filter((text) => text.trim())
    .join("\n\n")
    .trim();
}

/** Oddiy matnni bloklarga aylantiradi: bo'sh qator — yangi paragraf. */
export function plainToDoc(text: string): Doc {
  return text
    .split(/\n{2,}/)
    .filter((part) => part.trim())
    .map((t) => ({ type: "p" as const, c: [{ t }] }));
}

/** Taxminiy o'qish vaqti (daqiqa), 200 so'z/daqiqa. */
export function readingMinutes(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

// ── Karta post: rangli fon + qisqa matn + stikerlar (Instagram "story" kabi) ──

export const CARD_BACKGROUNDS = {
  lojuvard: "linear-gradient(135deg, #131f4c 0%, #2c4398 100%)",
  firuza: "linear-gradient(135deg, #0b4d4d 0%, #17a2a0 100%)",
  tilla: "linear-gradient(135deg, #c08a2e 0%, #f3d48d 100%)",
  anor: "linear-gradient(135deg, #7a2620 0%, #d0574a 100%)",
  tun: "linear-gradient(160deg, #0d1022 0%, #262b55 100%)",
  shom: "linear-gradient(135deg, #f58529 0%, #dd2a7b 55%, #8134af 100%)",
  gul: "linear-gradient(135deg, #f8cdda 0%, #c86b98 100%)",
  qogoz: "linear-gradient(135deg, #fffbf3 0%, #efe5d1 100%)",
} as const;
export type CardBackground = keyof typeof CARD_BACKGROUNDS;
/** Och fonlarda matn to'q bo'ladi. */
export const CARD_LIGHT_BACKGROUNDS: readonly CardBackground[] = ["tilla", "gul", "qogoz"];
export const CARD_FONTS = ["serif", "sans", "mono"] as const;
export type CardFont = (typeof CARD_FONTS)[number];
export const CARD_STICKERS = ["📚", "📖", "✨", "💡", "❤️", "🔥", "🌙", "☕", "🖋️", "🌿", "⭐", "🎯", "🕌", "🤲", "🌸", "🧠", "🏆", "👏"] as const;
export const CARD_LIMITS = { text: 280, stickers: 12 } as const;

const round = (value: number, step: number) => Math.round(value / step) * step;

export const cardDesignSchema = z
  .object({
    bg: z.enum(Object.keys(CARD_BACKGROUNDS) as [CardBackground, ...CardBackground[]]),
    font: z.enum(CARD_FONTS),
    text: z.string().trim().max(CARD_LIMITS.text, `Karta matni ${CARD_LIMITS.text} belgidan oshmasin.`),
    stickers: z
      .array(z.object({
        e: z.enum(CARD_STICKERS),
        x: z.number().finite().transform((v) => round(Math.min(100, Math.max(0, v)), 0.1)),
        y: z.number().finite().transform((v) => round(Math.min(100, Math.max(0, v)), 0.1)),
        s: z.number().finite().transform((v) => round(Math.min(2.5, Math.max(0.6, v)), 0.01)),
      }))
      .max(CARD_LIMITS.stickers),
  })
  .refine((d) => d.text.length > 0 || d.stickers.length > 0, "Kartaga matn yozing yoki stiker qo'shing.");
export type CardDesign = z.infer<typeof cardDesignSchema>;

export const createCommunityPostSchema = z.object({
  format: z.enum(POST_FORMATS).default("post"),
  kind: z.enum(["post", "announcement"]).default("post"),
  title: z.string().trim().max(COMMUNITY_LIMITS.title).default(""),
  /** Qaysi kitob haqida (ixtiyoriy teg). */
  book: z.string().trim().max(COMMUNITY_LIMITS.book).default(""),
  content: docSchema,
  /** Tepadagi albom — yuklangan media ID lari, tartib bilan. */
  attachments: z.array(z.string().uuid()).max(COMMUNITY_LIMITS.attachments).default([]),
  /** Faqat `format: "card"` uchun. */
  design: cardDesignSchema.nullable().default(null),
});
export type CreateCommunityPostInput = z.infer<typeof createCommunityPostSchema>;

export const reactSchema = z.object({
  postId: z.string().max(64).min(1),
  /** null — reaksiyani olib tashlash. */
  emoji: z.enum(REACTIONS).nullable(),
});
export type ReactInput = z.infer<typeof reactSchema>;

export const createUploadSchema = z.object({
  type: z.enum([...IMAGE_TYPES, ...VIDEO_TYPES]),
  bytes: z.number().int().positive(),
  width: z.number().int().min(0).max(20_000).default(0),
  height: z.number().int().min(0).max(20_000).default(0),
  seconds: z.number().min(0).max(24 * 3600).default(0),
});
export type CreateUploadInput = z.infer<typeof createUploadSchema>;

export type MediaItem = {
  id: string;
  kind: "image" | "video";
  mime: string;
  /** Nisbiy manzil (`/media/posts/...`); ilovada `absoluteUrl` bilan to'ldiriladi. */
  url: string;
  width: number;
  height: number;
  seconds: number;
};

export type UploadTicket = { id: string; chunkBytes: number; received: number; total: number };
export type UploadProgress = { done: boolean; received: number; media?: MediaItem };

export type ReactionCount = { emoji: string; count: number };
