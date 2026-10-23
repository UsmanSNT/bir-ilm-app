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
  profession: 60,
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
  /** Shu postdagi qaysi izohga javob (ixtiyoriy). */
  parentId: z.string().min(1).max(64).optional(),
});

// ── Shaxsiy ma'lumotlar ─────────────────────────────────────────────

export const GENDERS = ["male", "female"] as const;
export type Gender = (typeof GENDERS)[number];
export const GENDER_LABELS: Record<Gender, string> = { male: "Erkak", female: "Ayol" };

/** Tahallus: 3–24 belgi — lotin kichik harf, raqam, «_» va «.» (nuqta boshida/oxirida yoki ketma-ket emas). */
export const USERNAME_PATTERN = /^(?![.])(?!.*[.]{2})[a-z0-9_.]{3,24}(?<![.])$/;
/** Ilova nomi va xizmat rollari bilan adashtiradigan tahalluslar band qilingan. */
const RESERVED_USERNAMES = new Set(["admin", "administrator", "moderator", "birilm", "bir_ilm", "bir.ilm", "support", "help", "root", "system", "official"]);

/** «@Ali_99 » → «ali_99». */
export const normalizeUsername = (value: string) => value.trim().replace(/^@+/, "").toLowerCase();

const usernameSchema = z
  .string()
  .max(40)
  .transform(normalizeUsername)
  .refine((value) => USERNAME_PATTERN.test(value), "Tahallus 3–24 belgi: lotin harflari, raqam, «_» yoki «.» bo'lsin.")
  .refine((value) => !RESERVED_USERNAMES.has(value), "Bu tahallusni tanlab bo'lmaydi.");

/** Tug'ilgan sana: haqiqiy kun, 1900-yildan keyin va kamida 5 yosh. */
const birthDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Sanani YYYY-MM-DD ko'rinishida yuboring.")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return false;
    const latest = new Date();
    latest.setUTCFullYear(latest.getUTCFullYear() - 5);
    return date.getUTCFullYear() >= 1900 && date <= latest;
  }, "Tug'ilgan sana noto'g'ri.");

export const updateProfileSchema = z.object({
  name: trimmed(LIMITS.name).min(1).optional(),
  bio: trimmed(LIMITS.bio).optional(),
  /** null — olib tashlash. */
  username: usernameSchema.nullable().optional(),
  birthDate: birthDateSchema.nullable().optional(),
  gender: z.enum(GENDERS).nullable().optional(),
  profession: trimmed(LIMITS.profession).optional(),
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
  /** Qaysi izohga javob; null — postning o'ziga izoh. */
  parentId: string | null;
  /** Javob berilgan izoh muallifi (izoh o'chirilgan bo'lsa null). */
  parentName: string | null;
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
