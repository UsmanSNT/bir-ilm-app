/**
 * Viktorina muqovasi: BIR_ILM_MEDIA_DIR/quiz/<tasodifiy>.<ext>.
 * Yuklash viktorina saqlanishidan oldin bo'ladi (yangi viktorinada id hali yo'q), shuning uchun
 * fayl yo'li tasodifiy va viktorina saqlanganda `quizzes.image` ga yoziladi.
 * Saqlanmagan yetim fayllar tozalanmaydi — hajmi kichik (6 MB gacha, faqat admin/moderator).
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { QUIZ_IMAGE_MAX_BYTES, QUIZ_IMAGE_PATTERN } from "@/shared/contract";
import { badRequest, ApiException } from "@/server/http/errors";
import { mediaRoot } from "./books";
import { requireRole } from "./roles";
import { hasImageSignature, IMAGE_EXT } from "./store-chat";
import type { Database } from "@/server/db/client";

export const QUIZ_IMAGE_FILE = /^[a-z0-9]{16,32}\.(jpg|png|webp)$/;

export const quizMediaDir = () => path.join(mediaRoot(), "quiz");

/** Diskdagi fayl; URL noto'g'ri bo'lsa hech narsa qilinmaydi. */
export async function removeQuizImage(url: string): Promise<void> {
  if (!QUIZ_IMAGE_PATTERN.test(url)) return;
  await rm(path.join(quizMediaDir(), path.basename(url)), { force: true });
}

export async function saveQuizImage(db: Database, userId: string, mime: string, bytes: Uint8Array): Promise<string> {
  await requireRole(db, userId, ["admin", "moderator"], "Viktorina rasmini faqat admin yoki moderator yuklaydi.");
  if (!(mime in IMAGE_EXT)) throw badRequest("Faqat JPG, PNG yoki WebP rasm yuklang.");
  if (!bytes.length) throw badRequest("Rasm bo'sh.");
  if (bytes.length > QUIZ_IMAGE_MAX_BYTES) {
    throw new ApiException("bad_request", `Rasm ${QUIZ_IMAGE_MAX_BYTES / 1024 / 1024} MB dan oshmasin.`, 413);
  }
  if (!hasImageSignature(mime, bytes.subarray(0, 16))) throw badRequest("Fayl rasm emas.");

  const file = `${Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 20)}.${IMAGE_EXT[mime]}`;
  await mkdir(quizMediaDir(), { recursive: true });
  await writeFile(path.join(quizMediaDir(), file), bytes);
  return `/media/quiz/${file}`;
}
