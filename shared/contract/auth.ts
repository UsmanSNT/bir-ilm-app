/**
 * Identifikatsiya shartnomasi.
 *
 * Bitta token — ikkita tashuvchi (transport):
 *   - Web:     `Cookie: bir_reader=<token>` (HttpOnly, XSS'dan himoyalangan)
 *   - Android/iOS: `Authorization: Bearer <token>` (xavfsiz saqlovda)
 *
 * Ikkalasi ham bir xil `reader_<sha256(token)>` identifikatorini beradi,
 * shuning uchun bir foydalanuvchi webda ham, ilovada ham AYNAN bir xil
 * ma'lumotni ko'radi.
 */
import { z } from "zod";
import { CLIENT_PLATFORMS } from "./common";
import type { UserRole } from "./roles";

/** Xom token: 32 bayt tasodifiy son, hex ko'rinishda. */
export const AUTH_TOKEN_PATTERN = /^[a-f0-9]{64}$/;
/** Tokendan olingan ommaviy identifikator. */
export const USER_ID_PATTERN = /^reader_[a-f0-9]{64}$/;

export const AUTH_COOKIE_NAME = "bir_reader";
export const AUTH_HEADER = "authorization";
export const AUTH_SCHEME = "Bearer";

export const createSessionSchema = z.object({
  platform: z.enum(CLIENT_PLATFORMS).default("web"),
  /**
   * Native ilova tokenni o'zi saqlashi kerak, shuning uchun uni javob
   * tanasida so'raydi. Web buni so'ramaydi — cookie yetarli va HttpOnly
   * bo'lgani uchun xavfsizroq.
   */
  wantToken: z.boolean().default(false),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;

export type Session = {
  userId: string;
  /** Faqat `wantToken: true` bo'lganda to'ldiriladi (native mijozlar uchun). */
  token: string | null;
  /** Token qachon eskiradi (ISO 8601). */
  expiresAt: string;
};

export type Viewer = {
  userId: string;
  name: string;
  bio: string;
  posts: number;
  followers: number;
  role: UserRole;
  avatarUrl: string | null;
  /** Bog'langan Google/Telegram hisoblari. Bo'sh bo'lsa — mehmon. */
  accounts: LinkedAccount[];
  /** Serverda sozlangan kirish usullari. */
  loginProviders: { google: boolean; telegramBot: string | null };
};

export type LinkedAccount = {
  provider: "google" | "telegram";
  /** Email (Google) yoki ism (Telegram). */
  label: string;
};
