import { sameHash } from "./auth-session";

const MAX_AGE_SECONDS = 86400;

/**
 * Telegram Login Widget ma'lumotini tekshiradi (https://core.telegram.org/widgets/login#checking-authorization):
 * data_check_string = hash'dan boshqa maydonlar, kalit bo'yicha saralangan "kalit=qiymat" qatorlari;
 * hash = HMAC-SHA256(data_check_string, SHA256(bot_token)).
 */
export async function verifyTelegram(params: URLSearchParams, botToken: string, now = Date.now()) {
  const hash = params.get("hash") ?? "";
  const authDate = Number(params.get("auth_date"));
  if (!/^[a-f0-9]{64}$/.test(hash) || !Number.isInteger(authDate)) return false;
  if (now / 1000 - authDate > MAX_AGE_SECONDS || authDate - now / 1000 > 60) return false;
  const check = [...params.entries()].filter(([k]) => k !== "hash").sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(botToken));
  const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(check));
  const hex = Array.from(new Uint8Array(sig), b => b.toString(16).padStart(2, "0")).join("");
  return sameHash(hex, hash);
}
