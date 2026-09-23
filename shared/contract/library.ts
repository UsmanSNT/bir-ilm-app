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
  active: boolean;
};

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
