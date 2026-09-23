/**
 * Yagona identifikatsiya qatlami.
 *
 * Bitta xom token ikki yo'l bilan kelishi mumkin:
 *   - `Cookie: bir_reader=<token>`      → web brauzer (HttpOnly)
 *   - `Authorization: Bearer <token>`   → Android / iOS native ilova
 *
 * Ikkalasi ham AYNAN bir xil `reader_<sha256(token)>` identifikatorini beradi.
 * Shu sababli foydalanuvchi webda yaratgan ma'lumotini ilovada ham ko'radi.
 *
 * MUHIM: identifikator serverda tokendan hisoblanadi — hech qachon mijoz
 * yuborgan `userId` ga ishonilmaydi.
 */
import {
  AUTH_COOKIE_NAME,
  AUTH_TOKEN_PATTERN,
  CLIENT_PLATFORM_HEADER,
  type ClientPlatform,
} from "@/shared/contract";

/** Token bir yil amal qiladi; har so'rovda cookie yangilanmaydi. */
export const TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export type Identity = {
  /** `reader_<64 hex>` — ommaviy, barqaror identifikator. */
  userId: string;
  /** Xom token. Faqat yangi sessiya ochilganda mijozga qaytariladi. */
  token: string;
  /** Token shu so'rovda yangi yaratildimi? */
  isNew: boolean;
  platform: ClientPlatform;
};

export function generateToken(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

/** Tokendan ommaviy identifikatorni hosil qiladi (SHA-256). */
export async function deriveUserId(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return `reader_${toHex(new Uint8Array(digest))}`;
}

/** Cookie yoki Authorization sarlavhasidan xom tokenni oladi. */
export function readToken(request: Request): string | null {
  const bearer = request.headers.get("authorization");
  if (bearer) {
    const match = /^Bearer\s+([a-f0-9]{64})$/i.exec(bearer.trim());
    if (match) return match[1].toLowerCase();
  }

  const cookie = request.headers.get("cookie");
  if (cookie) {
    const pattern = new RegExp(`(?:^|;\s*)${AUTH_COOKIE_NAME}=([a-f0-9]{64})(?:;|$)`);
    const match = pattern.exec(cookie);
    if (match) return match[1].toLowerCase();
  }

  return null;
}

export function readPlatform(request: Request): ClientPlatform {
  const value = request.headers.get(CLIENT_PLATFORM_HEADER)?.toLowerCase();
  return value === "android" || value === "ios" ? value : "web";
}

/**
 * So'rovdan identifikatorni aniqlaydi. Token bo'lmasa yangisini yaratadi —
 * shuning uchun mehmon (guest) foydalanuvchi ro'yxatdan o'tmasdan ham
 * ishlatishi mumkin.
 */
export async function resolveIdentity(request: Request): Promise<Identity> {
  const existing = readToken(request);
  const token = existing && AUTH_TOKEN_PATTERN.test(existing) ? existing : generateToken();

  return {
    userId: await deriveUserId(token),
    token,
    isNew: token !== existing,
    platform: readPlatform(request),
  };
}

/**
 * Web uchun cookie o'rnatadi. Native mijozlar tokenni o'zlari saqlaydi,
 * shuning uchun ularga cookie yuborilmaydi.
 */
export function sessionCookie(request: Request, token: string): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${AUTH_COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${TOKEN_MAX_AGE_SECONDS}${secure}`;
}

/** Cookie'ni o'chiradi (chiqish uchun). */
export function clearSessionCookie(request: Request): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${AUTH_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
