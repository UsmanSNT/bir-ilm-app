/** Kutubxona: kitoblar, o'qish jarayoni, izohlar va reyting. */
import { z } from "zod";

export const LIBRARY_LIMITS = {
  commentBody: 2000,
  maxPages: 5000,
} as const;

export const createCommentSchema = z.object({
  bookId: z.string().trim().min(1).max(96),
  body: z.string().trim().min(1, "Izoh matni kerak.").max(LIBRARY_LIMITS.commentBody),
});

export const updateProgressSchema = z.object({
  bookId: z.string().trim().min(1).max(96),
  page: z.coerce.number().int().min(0),
  total: z.coerce.number().int().min(1).max(LIBRARY_LIMITS.maxPages),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type UpdateProgressInput = z.infer<typeof updateProgressSchema>;

export type Book = {
  id: string;
  title: string;
  author: string;
  summary: string;
  color: string;
  pages: number;
  /** Haftaning kitobi. */
  active: boolean;
  /** Muqova rasmi (yo'q bo'lsa rangli muqova chiziladi). */
  coverUrl: string | null;
  /** Birinchi qism (eski ilova versiyalari uchun); null — audio hali yuklanmagan. */
  audioUrl: string | null;
  /** Barcha qismlar jami. */
  audioSeconds: number;
  audioBytes: number;
  /** Audiokitob qismlari — tartib bilan ketma-ket ijro etiladi. */
  tracks: BookTrack[];
  /** library — suhbat/kutubxona kitobi; store — sotuv uchun alohida mahsulot. */
  kind: BookKind;
  /** Do'kondagi narx (Koreya woni, ₩); 0 — sotuvda emas. Faqat store mahsulotida. */
  price: number;
  /** Do'kon janri. */
  category: string;
};

export type BookTrack = {
  id: string;
  title: string;
  url: string;
  seconds: number;
  bytes: number;
};

export const BOOK_KINDS = ["library", "store"] as const;
export type BookKind = (typeof BOOK_KINDS)[number];

export const BOOK_LIMITS = {
  title: 160,
  author: 120,
  summary: 2000,
  /** Muqova rasmi: 5 MB. */
  coverBytes: 5 * 1024 * 1024,
  /** Audiokitob: barcha qismlar jami 1 GB. */
  audioBytes: 1024 * 1024 * 1024,
  /** Audiokitob qismlari soni. */
  maxTracks: 50,
  trackTitle: 120,
  /** Bo'laklab yuklashda bitta bo'lak: 8 MB. */
  chunkBytes: 8 * 1024 * 1024,
} as const;

export const createBookSchema = z.object({
  kind: z.enum(BOOK_KINDS).default("library"),
  title: z.string().trim().min(1, "Kitob nomini yozing.").max(BOOK_LIMITS.title),
  author: z.string().trim().min(1, "Muallifni yozing.").max(BOOK_LIMITS.author),
  summary: z.string().trim().max(BOOK_LIMITS.summary).default(""),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Rang #RRGGBB ko'rinishida bo'lsin.").default("#0f4f45"),
  /** Kitobdagi sahifalar soni (o'qish jarayoni shundan hisoblanadi). */
  pages: z.coerce.number().int("Sahifalar soni butun son bo'lsin.").min(1, "Sahifalar soni kamida 1.").max(5000, "Sahifalar soni 5000 dan oshmasin.").default(320),
  price: z.coerce.number().int("Narx butun wonda bo'lsin.").min(0).max(10_000_000).default(0),
  category: z.string().trim().max(40).default(""),
});
export type CreateBookInput = z.infer<typeof createBookSchema>;

export const updateBookSchema = createBookSchema.omit({ kind: true }).partial().extend({ active: z.boolean().optional() });
export type UpdateBookInput = z.infer<typeof updateBookSchema>;

/** Qismlar tartibi va nomlari: ro'yxatdagi tartib — ijro tartibi. */
export const reorderTracksSchema = z.object({
  tracks: z
    .array(z.object({ id: z.string().min(1).max(40), title: z.string().trim().max(BOOK_LIMITS.trackTitle) }))
    .max(BOOK_LIMITS.maxTracks),
});
export type ReorderTracksInput = z.infer<typeof reorderTracksSchema>;

export type BookComment = {
  id: number;
  bookId: string;
  userId: string;
  name: string;
  body: string;
  demo: boolean;
  createdAt: string;
};

export type ReadingProgress = {
  bookId: string;
  page: number;
  total: number;
  updatedAt: string;
};

export type LeaderboardEntry = {
  id: string;
  name: string;
  pages: number;
  books: number;
  comments: number;
  streak: number;
  score: number;
};
