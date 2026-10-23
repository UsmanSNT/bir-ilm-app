import { isValidAnchor, saturdaySessionAt, type Anchor } from "./journey";

export type AboutSettings = {
  intro: string;
  videoUrl: string;
  anchor: Anchor;
};

export type VideoSource = { kind: "youtube"; id: string } | { kind: "file"; src: string };

export const ABOUT_LIMITS = { intro: 1500, videoUrl: 500 } as const;

export const DEFAULT_ABOUT: AboutSettings = {
  intro:
    "Bir Ilm — har hafta bitta kitobni birga o'qib, shanba kuni jonli suhbatda muhokama qiladigan kitobxonlar jamoasi. " +
    "Maqsadimiz oddiy: o'qishni odatga aylantirish, o'qiganimizni fikr almashish orqali chuqurroq anglash va bir-birimizni ilm yo'lida qo'llab-quvvatlash.",
  videoUrl: "",
  anchor: { number: 248, date: "2026-10-24" },
};

export class AboutValidationError extends Error {}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"]);

/** Faqat YouTube havolasi yoki https orqali .mp4/.webm fayl qabul qilinadi. */
export function parseVideoUrl(value: string): VideoSource | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split("/").filter(Boolean);
  let id: string | null = null;
  if (host === "youtu.be") id = segments[0] ?? null;
  else if (YOUTUBE_HOSTS.has(host)) {
    id = url.pathname === "/watch" ? url.searchParams.get("v") : ["shorts", "embed", "live"].includes(segments[0] ?? "") ? (segments[1] ?? null) : null;
  }
  if (id !== null) return YOUTUBE_ID.test(id) ? { kind: "youtube", id } : null;
  return /\.(mp4|webm)$/i.test(url.pathname) ? { kind: "file", src: url.toString() } : null;
}

/** Bazadagi JSON ni o'qiydi; buzilgan yoki yetishmayotgan maydonlar standart qiymat bilan to'ldiriladi. */
export function readStoredAbout(raw: string | null | undefined): AboutSettings {
  if (!raw) return DEFAULT_ABOUT;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return DEFAULT_ABOUT;
  }
  if (!value || typeof value !== "object") return DEFAULT_ABOUT;
  const record = value as Record<string, unknown>;
  const anchor = record.anchor as Partial<Anchor> | undefined;
  const candidate: Anchor = { number: Number(anchor?.number), date: String(anchor?.date ?? "") };
  return {
    intro: typeof record.intro === "string" && record.intro.trim() ? record.intro : DEFAULT_ABOUT.intro,
    videoUrl: typeof record.videoUrl === "string" && parseVideoUrl(record.videoUrl) ? record.videoUrl : "",
    anchor: isValidAnchor(candidate) ? candidate : DEFAULT_ABOUT.anchor,
  };
}

/** Admin yuborgan ma'lumotni qat'iy tekshiradi; xato bo'lsa AboutValidationError tashlaydi. */
export function parseAboutInput(raw: Record<string, unknown>): AboutSettings {
  const intro = typeof raw.intro === "string" ? raw.intro.trim() : "";
  if (!intro) throw new AboutValidationError("Bir Ilm haqida matn kiritilishi shart.");
  if (intro.length > ABOUT_LIMITS.intro) throw new AboutValidationError(`Matn ${ABOUT_LIMITS.intro} belgidan oshmasin.`);

  const videoUrl = typeof raw.videoUrl === "string" ? raw.videoUrl.trim() : "";
  if (videoUrl.length > ABOUT_LIMITS.videoUrl || (videoUrl && !parseVideoUrl(videoUrl))) {
    throw new AboutValidationError("Video havolasi YouTube yoki https .mp4/.webm fayl bo'lishi kerak.");
  }

  const anchorRaw = raw.anchor && typeof raw.anchor === "object" ? (raw.anchor as Record<string, unknown>) : {};
  const anchor: Anchor = { number: Number(anchorRaw.number), date: typeof anchorRaw.date === "string" ? anchorRaw.date : "" };
  if (!Number.isInteger(anchor.number) || anchor.number < 1 || anchor.number > 10_000) {
    throw new AboutValidationError("Kitob raqami 1 dan 10 000 gacha butun son bo'lsin.");
  }
  if (saturdaySessionAt(anchor.date) === null) throw new AboutValidationError("Sana shanba kuni bo'lishi kerak.");

  return { intro, videoUrl, anchor };
}
