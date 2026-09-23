/**
 * CORS — native ilovalar uchun HAYOTIY muhim.
 *
 * Android (Capacitor) `https://localhost` yoki `http://localhost` dan,
 * iOS `capacitor://localhost` dan so'rov yuboradi. Ular serverning o'z
 * origini emas, shuning uchun CORS sarlavhalarisiz brauzer qatlami
 * so'rovni bloklaydi.
 */

/** Native qobiqlar ishlatadigan barqaror originlar. */
const NATIVE_ORIGINS = [
  "capacitor://localhost",
  "ionic://localhost",
  "http://localhost",
  "https://localhost",
];

/** Lokal ishlab chiqish uchun (har qanday portli localhost). */
const LOCALHOST_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export type CorsContext = {
  /** So'rov kelgan origin (`Origin` sarlavhasi). */
  origin: string | null;
  /** Serverning o'z origini — bir xil bo'lsa CORS kerak emas. */
  selfOrigin: string;
  /**
   * Qo'shimcha ruxsat etilgan originlar. Serverga joylashtirilganda
   * `ALLOWED_ORIGINS` muhit o'zgaruvchisidan (vergul bilan) keladi.
   */
  allowed?: string[];
};

export function isAllowedOrigin({ origin, selfOrigin, allowed = [] }: CorsContext): boolean {
  if (!origin) return true; // Native fetch ko'pincha Origin yubormaydi.
  if (origin === selfOrigin) return true;
  if (NATIVE_ORIGINS.includes(origin)) return true;
  if (LOCALHOST_PATTERN.test(origin)) return true;
  return allowed.includes(origin);
}

/** Muhit o'zgaruvchisidagi ro'yxatni massivga o'giradi. */
export function parseAllowedOrigins(value: string | undefined | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function corsHeaders(context: CorsContext): Headers {
  const headers = new Headers();
  const { origin } = context;

  if (origin && isAllowedOrigin(context)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    // Javob origin'ga bog'liq — kesh uni aralashtirib yubormasin.
    headers.set("Vary", "Origin");
  }

  return headers;
}

/** OPTIONS preflight javobi. */
export function preflightResponse(context: CorsContext): Response {
  const headers = corsHeaders(context);
  headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Client-Platform, X-Client-Version",
  );
  headers.set("Access-Control-Max-Age", "86400");
  return new Response(null, { status: 204, headers });
}
