/**
 * Barcha platformalar (web, Android, iOS) uchun umumiy API shartnomasi.
 *
 * Bu papka SERVER va MIJOZ tomonidan birgalikda ishlatiladi, shuning uchun
 * bu yerda `cloudflare:workers`, `next/*` yoki DOM API'lariga bog'liqlik
 * BO'LMASLIGI kerak. Faqat toza TypeScript va zod.
 */
import { z } from "zod";

/** API versiyasi. Yo'l prefiksi: `/api/v1`. */
export const API_VERSION = "v1" as const;

/**
 * Xato kodlari mijozga barqaror (stabil) shartnoma beradi: mobil ilova
 * matnni emas, kodni tekshiradi, shuning uchun xabarni o'zgartirsak ham
 * ilova buzilmaydi.
 */
export const ERROR_CODES = [
  "bad_request",
  "unauthorized",
  "forbidden",
  "not_found",
  "rate_limited",
  "validation_failed",
  "db_unavailable",
  "internal_error",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export type ApiError = {
  code: ErrorCode;
  /** Foydalanuvchiga ko'rsatiladigan o'zbekcha xabar. */
  message: string;
  /** Maydon bo'yicha validatsiya xatolari: `{ body: ["Bo'sh bo'lmasin"] }`. */
  fields?: Record<string, string[]>;
};

export type ApiSuccess<T> = { ok: true; data: T };
export type ApiFailure = { ok: false; error: ApiError };
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

/** Mijoz o'zini tanishtiradi — analitika va platformaga xos xatti-harakat uchun. */
export const CLIENT_PLATFORMS = ["web", "android", "ios"] as const;
export type ClientPlatform = (typeof CLIENT_PLATFORMS)[number];

export const CLIENT_PLATFORM_HEADER = "x-client-platform";
export const CLIENT_VERSION_HEADER = "x-client-version";

/**
 * Kursor "<created_at>|<id>" juftligini base64url qiladi, ya'ni ~76 belgi.
 * Chegara biroz zaxira bilan olingan.
 */
export const CURSOR_MAX_LENGTH = 128;

/** Kursorli sahifalash — cheksiz lenta (infinite scroll) uchun. */
export const cursorQuerySchema = z.object({
  cursor: z.string().max(CURSOR_MAX_LENGTH).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type CursorQuery = z.infer<typeof cursorQuerySchema>;

export type Page<T> = {
  items: T[];
  /** Keyingi sahifa uchun kursor. `null` — oxiriga yetdik. */
  nextCursor: string | null;
};

/** Bo'sh javob (masalan DELETE) uchun. */
export type Empty = Record<string, never>;
