/** Yuklanadigan media turlari va chegaralari (klient oldindan tekshiradi, server baribir qayta tekshiradi). */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 40 * 1024 * 1024;
export const UPLOADS_PER_HOUR = 30;
export const MEDIA_KEY = /^[a-f0-9]{32}\.(jpg|png|gif|webp|mp4|mov|webm)$/;
export type MediaType = "image" | "video";

export const mediaUrl = (key: string) => `/api/media?k=${encodeURIComponent(key)}`;

/** Fayl boshidagi "sehrli baytlar" bo'yicha haqiqiy turini aniqlaydi; brauzer yuborgan MIME ga ishonilmaydi. */
export function sniff(bytes: Uint8Array): { ext: string; mime: string; type: MediaType } | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { ext: "jpg", mime: "image/jpeg", type: "image" };
  if (bytes[0] === 0x89 && ascii(1, 4) === "PNG") return { ext: "png", mime: "image/png", type: "image" };
  if (ascii(0, 4) === "GIF8") return { ext: "gif", mime: "image/gif", type: "image" };
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { ext: "webp", mime: "image/webp", type: "image" };
  if (ascii(4, 8) === "ftyp") return ascii(8, 10) === "qt" ? { ext: "mov", mime: "video/quicktime", type: "video" } : { ext: "mp4", mime: "video/mp4", type: "video" };
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return { ext: "webm", mime: "video/webm", type: "video" };
  return null;
}

export const mimeForKey = (key: string) => ({ jpg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm" } as Record<string, string>)[key.split(".").pop() ?? ""] ?? "application/octet-stream";
