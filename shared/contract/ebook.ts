/**
 * Elektron kitob (matn rejimi). Matn `shared/ebook-markup.ts` belgilashida saqlanadi.
 *
 * Kim nimani o'qiydi:
 *   - `free`    — to'liq matn hammaga (Javon/kutubxona kitoblari);
 *   - `preview` — hammaga faqat boshlang'ich qismi (do'kon kitoblari). To'liq matnni hozircha admin va
 *                 moderator o'qiydi; keyinchalik premium yoki xarid shu yerga qo'shiladi.
 */
import { z } from "zod";
import { ebookTextLength, tidyEbookSource, type PreviewRule } from "../ebook-markup";
import type { BookKind } from "./library";
import { normalizeWebsite, websiteLabel } from "./team";

export const EBOOK_ACCESS = ["free", "preview"] as const;
export type EbookAccess = (typeof EBOOK_ACCESS)[number];

export const EBOOK_LIMITS = {
  /** Taxminan 1000 sahifalik kitob. */
  bodyChars: 2_000_000,
  /** Admin import qiladigan PDF: 100 MB (brauzerning o'zida o'qiladi, serverga yuborilmaydi). */
  pdfBytes: 100 * 1024 * 1024,
  sourceName: 120,
  sourceUrl: 300,
} as const;

/** Matn qayerdan olingani: manba nomi va/yoki https havolasi (kamida bittasi bo'ladi). */
export type EbookSource = { name: string; url: string };

/** Bazadagi ikki maydondan manba; ikkisi ham bo'sh — manba ko'rsatilmaydi. */
export const ebookSourceOf = (name: string, url: string): EbookSource | null => (name || url ? { name, url } : null);

/** Ekranda ko'rinadigan nom: yozilgan nom, bo'lmasa havola domeni («wikisource.org/…»). */
export const ebookSourceLabel = (source: EbookSource): string => source.name || websiteLabel(source.url);

/** Do'kon kitobining tanishuv qismi: matnning 10 foizi, kamida 4000 belgi, ko'pi bilan yarmi. */
export const EBOOK_PREVIEW: PreviewRule = { share: 0.1, minChars: 4000, maxShare: 0.5 };

/** Kitob turidan kelib chiqadigan ruxsat. Premium qo'shilganda shu funksiya kengayadi. */
export function ebookAccessFor(kind: BookKind): EbookAccess {
  return kind === "store" ? "preview" : "free";
}

/** Katalogdagi kitob kartasida: e-kitob bormi va qanday ochiladi. */
export type EbookInfo = {
  access: EbookAccess;
  /** Matn uzunligi (belgilarsiz). */
  chars: number;
  updatedAt: string;
  /** Matn qayerdan olingani; kitobga kirishdan oldin ko'rsatiladi. null — ko'rsatilmagan. */
  source: EbookSource | null;
};

/** O'qish oynasi oladigan matn. */
export type Ebook = {
  bookId: string;
  title: string;
  author: string;
  access: EbookAccess;
  /** false — faqat boshlang'ich qismi berildi. */
  full: boolean;
  body: string;
  /** To'liq matn uzunligi (tanishuv qismida ham — qancha qolganini ko'rsatish uchun). */
  chars: number;
  updatedAt: string;
  source: EbookSource | null;
};

const sourceNameField = z.string().trim().max(EBOOK_LIMITS.sourceName, `Manba nomi ${EBOOK_LIMITS.sourceName} belgidan oshmasin.`);
const sourceUrlField = z
  .string()
  .max(EBOOK_LIMITS.sourceUrl, `Manba havolasi ${EBOOK_LIMITS.sourceUrl} belgidan oshmasin.`)
  .transform((value, ctx) => {
    const url = normalizeWebsite(value);
    if (url === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Manba havolasini to‘g‘ri yozing. Masalan: https://uz.wikisource.org/…" });
      return z.NEVER;
    }
    return url;
  });

/** Faqat manbani almashtirish (matn tegilmaydi). Ikkalasi ham bo'sh — manba olib tashlanadi. */
export const ebookSourceSchema = z.object({
  sourceName: sourceNameField.default(""),
  sourceUrl: sourceUrlField.default(""),
});
export type EbookSourceInput = z.input<typeof ebookSourceSchema>;
export type EbookSourceData = z.output<typeof ebookSourceSchema>;

export const saveEbookSchema = z.object({
  /** Berilmasa — mavjud manba o'zgarmaydi; bittasi berilsa, ikkinchisi bo'sh deb olinadi. */
  sourceName: sourceNameField.optional(),
  sourceUrl: sourceUrlField.optional(),
  body: z
    .string()
    .max(EBOOK_LIMITS.bodyChars * 2, "Matn juda katta.")
    .transform(tidyEbookSource)
    .superRefine((body, ctx) => {
      if (!ebookTextLength(body)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Matn bo‘sh." });
      else if (body.length > EBOOK_LIMITS.bodyChars)
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Matn ${EBOOK_LIMITS.bodyChars.toLocaleString("en-US")} belgidan oshmasin.` });
    }),
});
export type SaveEbookInput = z.output<typeof saveEbookSchema>;

export const EBOOK_MARK_LIMITS = {
  /** Bitta foydalanuvchi bitta kitobda. */
  perBook: 500,
  quote: 500,
} as const;

export const EBOOK_MARK_KINDS = ["bookmark", "highlight"] as const;

/** Belgi ranglari: kalit (bazada) → rang (ekranda, sahifada oqimli ko'rinishi uchun ochiq ton). */
export const HIGHLIGHT_COLORS = [
  { key: "tilla", label: "Oltin", hex: "#e2b65c" },
  { key: "firuza", label: "Firuza", hex: "#7fd3cf" },
  { key: "anor", label: "Anor", hex: "#ef9a8b" },
  { key: "binafsha", label: "Binafsha", hex: "#bfa9ea" },
  { key: "yashil", label: "Yashil", hex: "#a6d99a" },
] as const;
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number]["key"];
export const HIGHLIGHT_COLOR_KEYS = HIGHLIGHT_COLORS.map((c) => c.key) as [HighlightColor, ...HighlightColor[]];
export type EbookMarkKind = (typeof EBOOK_MARK_KINDS)[number];

/**
 * Xatcho‘p (`bookmark`, end === start) yoki belgilangan matn (`highlight`, start < end). Joy — blok
 * (xatboshi/she'r bandi) ichidagi belgi o'rni; `quote` — shu oraliqdagi matn.
 */
export type EbookMark = {
  id: string;
  kind: EbookMarkKind;
  block: number;
  start: number;
  end: number;
  quote: string;
  color: HighlightColor;
  createdAt: string;
};

export const createEbookMarkSchema = z
  .object({
    kind: z.enum(EBOOK_MARK_KINDS),
    block: z.number().int().min(0).max(1_000_000),
    start: z.number().int().min(0).max(10_000_000),
    end: z.number().int().min(0).max(10_000_000),
    quote: z.string().max(EBOOK_MARK_LIMITS.quote),
    color: z.enum(HIGHLIGHT_COLOR_KEYS).default("tilla"),
  })
  .superRefine((mark, ctx) => {
    if (mark.kind === "bookmark" && mark.end !== mark.start) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Xatcho‘p oralig‘i bo‘lmasin." });
    if (mark.kind === "highlight" && mark.end <= mark.start) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Belgi bo‘sh bo‘lmasin." });
    if (mark.kind === "highlight" && !mark.quote) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Belgilangan matn kerak." });
  });
export type CreateEbookMarkInput = z.infer<typeof createEbookMarkSchema>;
