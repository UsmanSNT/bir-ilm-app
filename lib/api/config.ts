/**
 * API manzili va token saqlash.
 *
 * Web va native ilova AYNAN bir xil frontend kodini ishlatadi. Farq faqat
 * shu faylda: web nisbiy manzil (`/api/v1`) va cookie ishlatadi, native esa
 * to'liq manzil (`https://api.bir-ilm.uz/api/v1`) va Bearer token.
 */
import { API_VERSION, type ClientPlatform } from "@/shared/contract";

export const API_PREFIX = `/api/${API_VERSION}`;

/** Native ilova tokenni saqlaydigan kalit. */
export const TOKEN_STORAGE_KEY = "bir_ilm_token";

export type TokenStorage = {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
  clear(): Promise<void>;
};

/** Token saqlanmaydi — web uchun, chunki HttpOnly cookie shu vazifani bajaradi. */
export function noopStorage(): TokenStorage {
  return {
    get: async () => null,
    set: async () => {},
    clear: async () => {},
  };
}

/**
 * Brauzer saqlovi. Capacitor/WebView ichida ham ishlaydi.
 *
 * Ishlab chiqarishda native uchun buni Capacitor Preferences yoki Keychain
 * plaginiga almashtirish tavsiya etiladi — interfeys bir xil qoladi.
 */
export function browserStorage(): TokenStorage {
  return {
    get: async () => {
      try {
        return globalThis.localStorage?.getItem(TOKEN_STORAGE_KEY) ?? null;
      } catch {
        return null;
      }
    },
    set: async (token) => {
      try {
        globalThis.localStorage?.setItem(TOKEN_STORAGE_KEY, token);
      } catch {
        // Maxfiy rejimda saqlov bloklangan bo'lishi mumkin — sessiya
        // xotirada davom etadi, bu jiddiy emas.
      }
    },
    clear: async () => {
      try {
        globalThis.localStorage?.removeItem(TOKEN_STORAGE_KEY);
      } catch {
        // Yuqoridagi izohga qarang.
      }
    },
  };
}

/**
 * Ishlayotgan muhitni aniqlaydi.
 *
 * Capacitor ilova ichida `window.Capacitor` mavjud bo'ladi, shuning uchun
 * bitta bundle ham webda, ham ilovada to'g'ri sozlanadi.
 */
export function detectPlatform(): ClientPlatform {
  const capacitor = (globalThis as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  const platform = capacitor?.getPlatform?.();

  if (platform === "android" || platform === "ios") return platform;
  return "web";
}

/**
 * Backend manzili.
 *
 * Web: bo'sh satr — so'rov o'z originiga ketadi.
 * Native: `NEXT_PUBLIC_API_BASE_URL` da ko'rsatilgan to'liq manzil, chunki
 * ilova ichidagi sahifa `capacitor://localhost` da ishlaydi va serverni
 * o'zi bilmaydi.
 */
/**
 * Server beradigan nisbiy media manzili (`/media/books/...`). Ilova ichida sahifa
 * `https://localhost` dan ochiladi, shuning uchun server manzilini qo'shamiz.
 */
export function absoluteUrl<T extends string | null>(path: T): T {
  if (!path || !path.startsWith("/") || detectPlatform() === "web") return path;
  return `${resolveBaseUrl()}${path}` as T;
}

export function resolveBaseUrl(platform: ClientPlatform = detectPlatform()): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "");

  if (platform === "web") return configured ?? "";
  if (!configured) {
    throw new Error(
      "Native ilova uchun NEXT_PUBLIC_API_BASE_URL sozlanmagan. " +
        "Masalan: NEXT_PUBLIC_API_BASE_URL=https://bir-ilm.uz",
    );
  }

  return configured;
}
