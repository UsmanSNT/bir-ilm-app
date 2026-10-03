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
  /** Google/Telegram bog'langan yoki admin/moderator: jonli suhbatga kira oladi, boshqa qurilmani ulay oladi. */
  signedIn: boolean;
  /** Serverda sozlangan kirish usullari. */
  loginProviders: { google: boolean; telegramBot: string | null; password: boolean; passwordReset: boolean };
  /** Email + parol bilan kirish sozlanganmi (parolni o'zgartirish uchun). */
  hasPassword: boolean;
  /** Ikki bosqichli himoya (xavfsizlik kodi) yoqilganmi. */
  twoFactor: boolean;
  /** Shaxsiy sahifa orqa foni (rasm manzili) yoki null. */
  coverUrl: string | null;
};

export type LinkedAccount = {
  provider: "google" | "telegram" | "email";
  /** Email (Google, email) yoki ism (Telegram). */
  label: string;
};

/** Boshqa qurilmani ulash: kirgan qurilma kod oladi, ikkinchisi uni kiritadi. */
export type LinkCode = { code: string; expiresAt: string };

export const redeemLinkCodeSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, "Kod 6 ta raqamdan iborat."),
  /** Native ilova tokenni tanada oladi; web cookie oladi. */
  wantToken: z.boolean().default(false),
});
export type RedeemLinkCodeInput = z.infer<typeof redeemLinkCodeSchema>;

/**
 * Ilovada Google/Telegram bilan kirish (PKCE): ilova tasodifiy `verifier` yaratadi,
 * serverga faqat uning SHA-256 xeshini (`challenge`) yuboradi va qaytgan havolani
 * telefon brauzerida ochadi. Brauzer `uz.birilm.app://auth?code=…` ga qaytaradi,
 * ilova `code` + `verifier` bilan tokenni oladi.
 */
export const startAppLoginSchema = z.object({
  provider: z.enum(["google", "telegram"]),
  challenge: z.string().regex(/^[a-f0-9]{64}$/),
});
export type StartAppLoginInput = z.infer<typeof startAppLoginSchema>;
export type AppLoginStart = { url: string };

export const finishAppLoginSchema = z.object({
  code: z.string().regex(/^[a-f0-9]{64}$/),
  verifier: z.string().regex(/^[a-f0-9]{64}$/),
});
export type FinishAppLoginInput = z.infer<typeof finishAppLoginSchema>;

// ── Email va parol ──────────────────────────────────────────────────

export const PASSWORD_LIMITS = { min: 8, max: 128 } as const;

const emailField = z.string().trim().toLowerCase().max(254).email("Email manzili noto'g'ri.");
const passwordField = z
  .string()
  .min(PASSWORD_LIMITS.min, `Parol kamida ${PASSWORD_LIMITS.min} belgi bo'lsin.`)
  .max(PASSWORD_LIMITS.max, "Parol juda uzun.");

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Ismingizni yozing.").max(40),
  email: emailField,
  password: passwordField,
  wantToken: z.boolean().default(false),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const passwordLoginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Parolni yozing.").max(PASSWORD_LIMITS.max),
  wantToken: z.boolean().default(false),
});
export type PasswordLoginInput = z.infer<typeof passwordLoginSchema>;

export const forgotPasswordSchema = z.object({ email: emailField });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const RESET_TOKEN_PATTERN = /^[a-f0-9]{64}$/;
export const resetPasswordSchema = z.object({
  token: z.string().regex(RESET_TOKEN_PATTERN, "Havola noto'g'ri."),
  password: passwordField,
  wantToken: z.boolean().default(false),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z.object({
  /** Parol avval o'rnatilgan bo'lsa majburiy. */
  current: z.string().max(PASSWORD_LIMITS.max).default(""),
  password: passwordField,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

// ── Ikki bosqichli himoya (xavfsizlik kodi) ─────────────────────────

export const SECURITY_CODE_LIMITS = { min: 6, max: 32 } as const;

const securityCodeField = z
  .string()
  .min(SECURITY_CODE_LIMITS.min, `Kod kamida ${SECURITY_CODE_LIMITS.min} belgi bo'lsin.`)
  .max(SECURITY_CODE_LIMITS.max, `Kod ${SECURITY_CODE_LIMITS.max} belgidan oshmasin.`);

/** Birinchi bosqich (parol / Google / Telegram) tugadi, lekin xavfsizlik kodi kerak. */
export type TwoFactorPending = { twoFactor: true; challenge: string };
export const CHALLENGE_PATTERN = /^[a-f0-9]{64}$/;

export const verifyTwoFactorSchema = z.object({
  code: z.string().min(1, "Kodni yozing.").max(SECURITY_CODE_LIMITS.max),
  /** Google/Telegram oqimida challenge cookie'da keladi, shuning uchun ixtiyoriy. */
  challenge: z.string().regex(CHALLENGE_PATTERN).optional(),
  wantToken: z.boolean().default(false),
});
export type VerifyTwoFactorInput = z.infer<typeof verifyTwoFactorSchema>;

export const setTwoFactorSchema = z.object({
  code: securityCodeField,
  /** Kod avval o'rnatilgan bo'lsa majburiy. */
  current: z.string().max(SECURITY_CODE_LIMITS.max).default(""),
});
export type SetTwoFactorInput = z.infer<typeof setTwoFactorSchema>;

export const removeTwoFactorSchema = z.object({ current: z.string().min(1, "Joriy kodni yozing.").max(SECURITY_CODE_LIMITS.max) });
export type RemoveTwoFactorInput = z.infer<typeof removeTwoFactorSchema>;
