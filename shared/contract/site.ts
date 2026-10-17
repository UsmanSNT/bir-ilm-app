/** Ijtimoiy tarmoq havolalari va qisqa videolar (havola orqali, serverga video yuklanmaydi). */
import { z } from "zod";

export const SOCIAL_KEYS = ["telegram", "youtube", "instagram", "facebook"] as const;
export type SocialKey = (typeof SOCIAL_KEYS)[number];
export const SOCIAL_LABELS: Record<SocialKey, string> = {
  telegram: "Telegram",
  youtube: "YouTube",
  instagram: "Instagram",
  facebook: "Facebook",
};
export type SiteLinks = Partial<Record<SocialKey, string>>;

const HOSTS: Record<SocialKey, string[]> = {
  telegram: ["t.me", "telegram.me", "telegram.dog"],
  youtube: ["youtube.com", "m.youtube.com", "youtu.be"],
  instagram: ["instagram.com"],
  facebook: ["facebook.com", "m.facebook.com", "fb.com", "fb.me", "fb.watch"],
};

const bare = (host: string) => host.toLowerCase().replace(/^www\./, "");

/**
 * Admin kiritgan havolani tekshiradi va normallashtiradi (faqat https va shu tarmoqning o'z domeni).
 * Telegram uchun `@kanal` ham qabul qilinadi. Bo'sh qator — havolani o'chirish (`""`). Noto'g'ri bo'lsa — `null`.
 */
export function normalizeSocialUrl(key: SocialKey, input: string): string | null {
  const raw = input.trim();
  if (!raw) return "";
  if (key === "telegram" && /^@[A-Za-z0-9_]{4,32}$/.test(raw)) return `https://t.me/${raw.slice(1)}`;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!HOSTS[key].includes(bare(url.hostname)) || url.username || url.password) return null;
    url.protocol = "https:";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export const siteLinksSchema = z.object(
  Object.fromEntries(SOCIAL_KEYS.map((key) => [key, z.string().max(300).optional()])) as Record<SocialKey, z.ZodOptional<z.ZodString>>,
);
export type SiteLinksInput = z.infer<typeof siteLinksSchema>;

// ── Qisqa videolar ──────────────────────────────────────────────────

export const VIDEO_PLATFORMS = ["youtube", "instagram", "facebook"] as const;
export type VideoPlatform = (typeof VIDEO_PLATFORMS)[number];

export type ParsedVideo = { platform: VideoPlatform; url: string; externalId: string };

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const IG_CODE = /^[A-Za-z0-9_-]{5,40}$/;

/** YouTube / Instagram / Facebook video havolasini tanib, kanonik ko'rinishga keltiradi. Boshqa havola — `null`. */
export function parseVideoUrl(input: string): ParsedVideo | null {
  let url: URL;
  try {
    const raw = input.trim();
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  const host = bare(url.hostname);
  const parts = url.pathname.split("/").filter(Boolean);

  if (["youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com"].includes(host) || host === "youtu.be") {
    let id = "";
    let shorts = false;
    if (host === "youtu.be") id = parts[0] ?? "";
    else if (parts[0] === "shorts") { id = parts[1] ?? ""; shorts = true; }
    else if (parts[0] === "embed" || parts[0] === "live" || parts[0] === "v") id = parts[1] ?? "";
    else if (parts[0] === "watch") id = url.searchParams.get("v") ?? "";
    if (!YT_ID.test(id)) return null;
    return { platform: "youtube", externalId: id, url: shorts ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}` };
  }

  if (host === "instagram.com") {
    // /username/reel/CODE shaklidagi havolalar ham uchraydi.
    const at = ["p", "reel", "reels", "tv"].includes(parts[0]) ? 0 : ["p", "reel", "reels", "tv"].includes(parts[1]) ? 1 : -1;
    if (at < 0) return null;
    const type = parts[at] === "reels" ? "reel" : parts[at];
    const code = parts[at + 1] ?? "";
    if (!IG_CODE.test(code)) return null;
    return { platform: "instagram", externalId: code, url: `https://www.instagram.com/${type}/${code}/` };
  }

  if (["facebook.com", "m.facebook.com", "fb.watch", "fb.com"].includes(host)) {
    const isVideo = host === "fb.watch" ? parts.length > 0 : /\/(videos|reel|watch)\b|^\/share\/(v|r)\//.test(url.pathname);
    if (!isVideo) return null;
    const keep = new URL(`https://${host === "fb.com" ? "www.facebook.com" : url.hostname.replace(/^m\./, "")}${url.pathname}`);
    const v = url.searchParams.get("v");
    if (v && /^\d+$/.test(v)) keep.searchParams.set("v", v);
    return { platform: "facebook", externalId: "", url: keep.toString() };
  }
  return null;
}

/** Ilova ichidagi pleyer manzili (iframe). Faqat `parseVideoUrl` dan o'tgan havolaga quriladi. */
export function videoEmbedUrl(video: { platform: VideoPlatform; url: string; externalId: string }): string {
  if (video.platform === "youtube") return `https://www.youtube-nocookie.com/embed/${video.externalId}?rel=0&playsinline=1&autoplay=1`;
  if (video.platform === "instagram") return `${video.url}embed/`;
  return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(video.url)}&show_text=false&autoplay=true`;
}

/** YouTube'da muqova rasmi tayyor beriladi; boshqalarda yo'q. */
export const videoThumbnail = (video: { platform: VideoPlatform; externalId: string }): string | null =>
  video.platform === "youtube" ? `https://i.ytimg.com/vi/${video.externalId}/hqdefault.jpg` : null;

export const addVideoSchema = z.object({
  url: z.string().trim().min(1, "Havolani kiriting.").max(500),
  title: z.string().trim().max(100).default(""),
});
export type AddVideoInput = z.infer<typeof addVideoSchema>;

export type SiteVideo = {
  id: string;
  platform: VideoPlatform;
  url: string;
  externalId: string;
  title: string;
  createdAt: string;
};
