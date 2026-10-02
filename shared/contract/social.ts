/** Ijtimoiy bo'lim: postlar, izohlar, obunalar, fokus seanslari. */
import { z } from "zod";
import { CURSOR_MAX_LENGTH } from "./common";

export const FEED_SCOPES = ["all", "following", "mine", "author"] as const;
export type FeedScope = (typeof FEED_SCOPES)[number];

export const FOCUS_MINUTE_OPTIONS = [15, 25, 45, 60] as const;

/** Chegaralar bitta joyda — mijoz ham, server ham shu raqamlarni ishlatadi. */
export const LIMITS = {
  name: 40,
  bio: 300,
  bookTitle: 160,
  postBody: 2000,
  replyBody: 1000,
} as const;

const trimmed = (max: number) => z.string().trim().max(max);

export const feedQuerySchema = z.object({
  scope: z.enum(FEED_SCOPES).default("all"),
  /** `scope=author` bo'lganda majburiy. */
  author: z.string().max(80).optional(),
  cursor: z.string().max(CURSOR_MAX_LENGTH).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type FeedQuery = z.infer<typeof feedQuerySchema>;

export const createPostSchema = z.object({
  book: trimmed(LIMITS.bookTitle).min(1, "Kitob nomini yozing."),
  body: trimmed(LIMITS.postBody).min(1, "Fikringizni yozing."),
});

export const createReplySchema = z.object({
  body: trimmed(LIMITS.replyBody).min(1, "Izohni yozing."),
});

export const updateProfileSchema = z.object({
  name: trimmed(LIMITS.name).min(1).optional(),
  bio: trimmed(LIMITS.bio).optional(),
});

export const followSchema = z.object({
  target: z.string().max(80).min(1),
  follow: z.boolean(),
});

export const focusSessionSchema = z.object({
  /** UUID — takroriy yuborilsa ham bir marta hisoblanadi (idempotent). */
  sessionId: z.string().uuid(),
  minutes: z.union([
    z.literal(15),
    z.literal(25),
    z.literal(45),
    z.literal(60),
  ]),
});

export type CreatePostInput = z.infer<typeof createPostSchema>;
export type CreateReplyInput = z.infer<typeof createReplySchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type FollowInput = z.infer<typeof followSchema>;
export type FocusSessionInput = z.infer<typeof focusSessionSchema>;

export type Reply = {
  id: string;
  postId: string;
  userId: string;
  name: string;
  body: string;
  createdAt: string;
};

export type Post = {
  id: string;
  userId: string;
  name: string;
  book: string;
  body: string;
  createdAt: string;
  replies: Reply[];
};

export type ReaderProfile = {
  id: string;
  name: string;
  bio: string;
  posts: number;
  followers: number;
};

export type FocusSummary = {
  minutes: number;
  sessions: number;
};
