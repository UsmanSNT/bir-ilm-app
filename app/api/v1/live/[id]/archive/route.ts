/**
 * Ishlov berilgan suhbat audiosi — joylangach «O'tgan suhbatlar»da hammaga ko'rinadi
 * (admin/moderator). Kitob audiosi kabi bo'laklab yuklanadi:
 *
 *   GET    → { received, total, type } — uzilgan yuklash qayerdan davom etadi
 *   PUT    + X-Upload-Offset, X-Upload-Total, X-Upload-Type, [X-Audio-Seconds]
 *   DELETE → audioni olib tashlaydi (suhbat yana faqat adminlarga ko'rinadi)
 */
import { appendFile, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { defineRoute } from "@/server/http/handler";
import { ApiException, badRequest, notFound } from "@/server/http/errors";
import type { Database } from "@/server/db/client";
import { ensureLiveDir, getLiveSession, setArchive } from "@/server/services/live";
import { requireRole } from "@/server/services/roles";
import { BOOK_LIMITS, LIMITS_LIVE, type LiveSession } from "@/shared/contract";

export const runtime = "edge";

const STAFF = ["admin", "moderator"] as const;
const EXTENSIONS: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/ogg": "ogg",
  "audio/opus": "opus",
  "audio/webm": "webm",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/flac": "flac",
};

type Upload = { total: number; type: string };

async function prepare(db: Database, userId: string, id: string) {
  await requireRole(db, userId, STAFF, "Suhbat audiosini faqat admin yoki moderator joylaydi.");
  const session = await getLiveSession(db, id);
  if (!session) throw notFound("Suhbat topilmadi.");
  const dir = await ensureLiveDir(id);
  return { dir, part: path.join(dir, "archive.upload"), meta: path.join(dir, "archive.upload.json") };
}

const readMeta = (meta: string) => readFile(meta, "utf8").then((t) => JSON.parse(t) as Upload, () => null);
const sizeOf = (file: string) => stat(file).then((s) => s.size, () => 0);

export const GET = defineRoute<undefined, { received: number; total: number; type: string | null }>({
  handler: async ({ db, identity, params }) => {
    const { part, meta } = await prepare(db, identity.userId, params.id);
    const info = await readMeta(meta);
    return { received: info ? await sizeOf(part) : 0, total: info?.total ?? 0, type: info?.type ?? null };
  },
});

export const PUT = defineRoute<undefined, { done: boolean; received: number; session?: LiveSession }>({
  handler: async ({ db, identity, request, params }) => {
    const { dir, part, meta } = await prepare(db, identity.userId, params.id);
    const total = Number(request.headers.get("x-upload-total"));
    const offset = Number(request.headers.get("x-upload-offset"));
    const type = (request.headers.get("x-upload-type") ?? "").toLowerCase().split(";")[0].trim();
    const ext = EXTENSIONS[type];
    if (!ext) throw new ApiException("bad_request", "Bu audio formati qo'llab-quvvatlanmaydi (MP3, M4A, OGG, WAV, FLAC).", 415);
    if (!Number.isInteger(total) || total <= 0 || total > LIMITS_LIVE.archiveBytes) {
      throw new ApiException("bad_request", "Audio 1 GB dan oshmasin.", 413);
    }
    if (!Number.isInteger(offset) || offset < 0) throw badRequest("X-Upload-Offset noto'g'ri.");

    // Yangi yuklash yoki boshqa fayl — eski qoldiqni tashlaymiz.
    const previous = await readMeta(meta);
    if (offset === 0 || !previous || previous.total !== total || previous.type !== type) {
      if (offset !== 0) throw new ApiException("bad_request", "Yuklash boshidan boshlanishi kerak.", 409, { received: ["0"] });
      await rm(part, { force: true });
      await writeFile(meta, JSON.stringify({ total, type }));
    }
    const received = await sizeOf(part);
    if (offset !== received) throw new ApiException("bad_request", "Bo'lak tartibi buzildi.", 409, { received: [String(received)] });

    const chunk = new Uint8Array(await request.arrayBuffer());
    if (!chunk.length || chunk.length > BOOK_LIMITS.chunkBytes) throw new ApiException("bad_request", "Bo'lak hajmi noto'g'ri.", 413);
    if (offset + chunk.length > total) throw new ApiException("bad_request", "Fayl e'lon qilingan hajmdan katta.", 413);
    await appendFile(part, chunk);

    const now = offset + chunk.length;
    if (now < total) return { done: false, received: now };

    const file = `archive.${ext}`;
    for (const name of await readdir(dir)) {
      if (name.startsWith("archive.") && !name.startsWith("archive.upload") && name !== file) await rm(path.join(dir, name), { force: true });
    }
    await rename(part, path.join(dir, file));
    await rm(meta, { force: true });
    const seconds = Math.max(0, Math.round(Number(request.headers.get("x-audio-seconds")) || 0));
    const session = await setArchive(db, params.id, { file, mime: type, bytes: total, seconds });
    return { done: true, received: total, session };
  },
});

export const DELETE = defineRoute<undefined, LiveSession>({
  handler: async ({ db, identity, params }) => {
    const { dir } = await prepare(db, identity.userId, params.id);
    for (const name of await readdir(dir)) {
      if (name.startsWith("archive.")) await rm(path.join(dir, name), { force: true });
    }
    return setArchive(db, params.id, null);
  },
});

export const OPTIONS = PUT;
