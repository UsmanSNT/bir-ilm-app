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

export const EBOOK_ACCESS = ["free", "preview"] as const;
export type EbookAccess = (typeof EBOOK_ACCESS)[number];

export const EBOOK_LIMITS = {
  /** Taxminan 1000 sahifalik kitob. */
  bodyChars: 2_000_000,
  /** Admin import qiladigan PDF: 100 MB (brauzerning o'zida o'qiladi, serverga yuborilmaydi). */
  pdfBytes: 100 * 1024 * 1024,
} as const;

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
};

export const saveEbookSchema = z.object({
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
export type SaveEbookInput = z.infer<typeof saveEbookSchema>;
