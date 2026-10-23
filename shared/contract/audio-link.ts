/** Audio uchun tashqi havola (YouTube, Telegram yoki istalgan sayt): tekshirish va ko'rsatish. */

export const AUDIO_LINK_MAX = 2048;

export type AudioLinkInfo = {
  /** Brauzerda ochiladigan to'liq manzil (faqat https/http). */
  href: string;
  /** Platforma nomi: YouTube, Telegram... yoki sayt nomi. */
  label: string;
  /** Odamga ko'rinadigan manzil: protokolsiz, `www.`siz. */
  display: string;
};

// Ma'lum platformalar: sayt nomi (www/m. siz) → ko'rsatiladigan nom.
const PLATFORMS: Record<string, string> = {
  "youtube.com": "YouTube",
  "youtu.be": "YouTube",
  "music.youtube.com": "YouTube Music",
  "t.me": "Telegram",
  "telegram.me": "Telegram",
  "telegram.dog": "Telegram",
  "soundcloud.com": "SoundCloud",
  "open.spotify.com": "Spotify",
  "podcasts.apple.com": "Apple Podcasts",
  "drive.google.com": "Google Drive",
  "instagram.com": "Instagram",
};

const bareHost = (hostname: string) => hostname.toLowerCase().replace(/^(www|m|mobile)\./, "");

/**
 * Foydalanuvchi yozgan havolani xavfsiz https/http manzilga keltiradi; yaroqsiz bo'lsa `null`.
 * `youtu.be/abc`, `t.me/kanal`, `@kanal` (Telegram) kabi sxemasiz yozuvlar ham qabul qilinadi.
 * `javascript:`, `data:`, `file:` va login:parolli manzillar rad etiladi.
 */
export function normalizeAudioLink(input: string): string | null {
  let text = input.trim();
  if (!text || text.length > AUDIO_LINK_MAX || /\s/.test(text)) return null;
  if (/^@[A-Za-z0-9_]{4,32}$/.test(text)) text = `t.me/${text.slice(1)}`;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) text = `https://${text}`;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  // Haqiqiy sayt nomi bo'lsin ("localhost", "abc" emas).
  if (!/^[^.]+(\.[^.]+)+$/.test(url.hostname) || url.hostname.endsWith(".")) return null;
  // Ma'lum platformalar doim xavfsiz https orqali ochiladi.
  if (PLATFORMS[bareHost(url.hostname)]) url.protocol = "https:";
  return url.href;
}

/** Saqlangan havola uchun ko'rsatiladigan nom va manzil. */
export function describeAudioLink(href: string): AudioLinkInfo | null {
  const normalized = normalizeAudioLink(href);
  if (!normalized) return null;
  const url = new URL(normalized);
  const host = bareHost(url.hostname);
  const path = url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "");
  return { href: normalized, label: PLATFORMS[host] ?? host, display: `${host}${path}${url.search}` };
}
