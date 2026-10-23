/** «Biz haqimizda»: tanishtiruv matni, video va haftalik muhokamalar hisobining tayanch nuqtasi. */
import { z } from "zod";
import { isValidAnchor, saturdaySessionAt, type Anchor } from "../journey";
import { parseVideoUrl, type ParsedVideo } from "./site";

export const ABOUT_LIMITS = { intro: 1500, videoUrl: 500, anchorMax: 10_000 } as const;

/** Ilova bilan birga keladigan tanishtiruv videosi (admin boshqa havola qo'ymasa). */
export const DEFAULT_INTRO_VIDEO = { src: "/assets/bir-ilm-intro.mp4", poster: "/assets/bir-ilm-intro-poster.jpg" } as const;

export type AboutSettings = {
  intro: string;
  /** Bo'sh — ilova bilan kelgan video; aks holda YouTube/Instagram/Facebook yoki https .mp4/.webm havola. */
  videoUrl: string;
  anchor: Anchor;
};

export const DEFAULT_ABOUT: AboutSettings = {
  intro:
    "Bir Ilm — har hafta bitta kitobni birga o‘qib, shanba kuni jonli suhbatda muhokama qiladigan kitobxonlar jamoasi.\n\n" +
    "Maqsadimiz oddiy: o‘qishni odatga aylantirish, o‘qiganlarimizni fikr almashish orqali chuqurroq anglash va bir-birimizni ilm yo‘lida qo‘llab-quvvatlash.",
  videoUrl: "",
  anchor: { number: 248, date: "2026-10-24" },
};

export type AboutVideo = { kind: "file"; src: string; poster: string | null } | ({ kind: "embed" } & ParsedVideo);

/** Ko'rsatiladigan video: admin havolasi yoki ilova bilan kelgan fayl. Noto'g'ri havola — null. */
export function resolveAboutVideo(videoUrl: string): AboutVideo | null {
  const raw = videoUrl.trim();
  if (!raw) return { kind: "file", src: DEFAULT_INTRO_VIDEO.src, poster: DEFAULT_INTRO_VIDEO.poster };
  const embed = parseVideoUrl(raw);
  if (embed) return { kind: "embed", ...embed };
  try {
    const url = new URL(raw);
    if (url.protocol === "https:" && !url.username && !url.password && /\.(mp4|webm)$/i.test(url.pathname)) {
      return { kind: "file", src: url.toString(), poster: null };
    }
  } catch {
    return null;
  }
  return null;
}

export const aboutInputSchema = z.object({
  intro: z.string().trim().min(1, "Bir Ilm haqida matn kiriting.").max(ABOUT_LIMITS.intro, `Matn ${ABOUT_LIMITS.intro} belgidan oshmasin.`),
  videoUrl: z
    .string()
    .trim()
    .max(ABOUT_LIMITS.videoUrl)
    .default("")
    .refine((value) => resolveAboutVideo(value) !== null, "Video havolasi YouTube, Instagram, Facebook yoki https .mp4/.webm fayl bo'lsin."),
  anchor: z.object({
    number: z.number().int("Butun son kiriting.").min(1, "Kamida 1.").max(ABOUT_LIMITS.anchorMax, `Ko'pi bilan ${ABOUT_LIMITS.anchorMax}.`),
    date: z.string().refine((value) => saturdaySessionAt(value) !== null, "Sana shanba kuni bo'lishi kerak (YYYY-MM-DD)."),
  }),
});
export type AboutInput = z.input<typeof aboutInputSchema>;

/** Bazadagi JSON ni o'qiydi: buzilgan yoki eskirgan maydonlar standart qiymat bilan almashtiriladi. */
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
  const anchorRaw = (record.anchor ?? {}) as Record<string, unknown>;
  const anchor: Anchor = { number: Number(anchorRaw.number), date: String(anchorRaw.date ?? "") };
  return {
    intro: typeof record.intro === "string" && record.intro.trim() ? record.intro : DEFAULT_ABOUT.intro,
    videoUrl: typeof record.videoUrl === "string" && resolveAboutVideo(record.videoUrl) ? record.videoUrl : "",
    anchor: isValidAnchor(anchor) ? anchor : DEFAULT_ABOUT.anchor,
  };
}
