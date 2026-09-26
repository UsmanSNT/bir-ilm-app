/**
 * Kitob muqovasi va audiosini bo'laklab yuklash (admin/moderator).
 *
 *   GET  ?kind=audio  → { received }  — uzilgan yuklash qayerdan davom etishi
 *   PUT  ?kind=audio  + X-Upload-Offset, X-Upload-Total, X-Upload-Type, [X-Audio-Seconds]
 *                     → bo'lakni qo'shadi; oxirgi bo'lakda fayl joyiga qo'yiladi
 *
 * 1 GB faylni bitta so'rovda yuborish xotira va ulanish uchun xavfli, shuning uchun bo'laklar.
 */
import { appendFile, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveIdentity } from "@/server/auth/identity";
import { tryGetDb } from "@/server/db/client";
import { isAllowedOrigin, parseAllowedOrigins } from "@/server/http/cors";
import { ensureBookDir, getBookRow, setBookMedia } from "@/server/services/books";
import { getUserRole } from "@/server/services/roles";
import { BOOK_LIMITS } from "@/shared/contract";

type Kind = "cover" | "audio";
type Segment = { params: Promise<Record<string, string | string[]>> };

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
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

class UploadError extends Error {
  status: number;
  extra: Record<string, unknown>;
  constructor(message: string, status = 400, extra: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const json = (data: unknown, status = 200) =>
  Response.json(status < 400 ? { ok: true, data } : { ok: false, error: data }, { status, headers: { "Cache-Control": "no-store" } });

async function authorize(request: Request, segment: Segment) {
  if (request.method !== "GET" && !isAllowedOrigin({
    origin: request.headers.get("origin"),
    selfOrigin: new URL(request.url).origin,
    allowed: parseAllowedOrigins(process.env.ALLOWED_ORIGINS),
  })) throw new UploadError("So'rov rad etildi.", 403);

  const db = await tryGetDb();
  if (!db) throw new UploadError("Ma'lumotlar bazasi ulanmagan.", 503);
  const { userId } = await resolveIdentity(request);
  const role = await getUserRole(db, userId);
  if (role !== "admin" && role !== "moderator") throw new UploadError("Faylni faqat admin yoki moderator yuklaydi.", 403);

  const raw = (await segment.params).id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  await getBookRow(db, id).catch(() => { throw new UploadError("Kitob topilmadi.", 404); });

  const kind = new URL(request.url).searchParams.get("kind");
  if (kind !== "cover" && kind !== "audio") throw new UploadError("kind=cover yoki kind=audio bo'lsin.");
  const dir = await ensureBookDir(id);
  return { db, id, kind: kind as Kind, part: path.join(dir, `${kind}.upload`), meta: path.join(dir, `${kind}.upload.json`), dir };
}

async function sizeOf(file: string): Promise<number> {
  return stat(file).then((s) => s.size, () => 0);
}

async function handle(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof UploadError) return json({ code: "upload_error", message: error.message, ...error.extra }, error.status);
    console.error("[upload]", error);
    return json({ code: "internal_error", message: "Yuklashda kutilmagan xato." }, 500);
  }
}

export function GET(request: Request, segment: Segment) {
  return handle(async () => {
    const { part, meta } = await authorize(request, segment);
    const info = await readFile(meta, "utf8").then((t) => JSON.parse(t) as { total: number; type: string }, () => null);
    return json({ received: info ? await sizeOf(part) : 0, total: info?.total ?? 0, type: info?.type ?? null });
  });
}

export function PUT(request: Request, segment: Segment) {
  return handle(async () => {
    const { db, id, kind, part, meta, dir } = await authorize(request, segment);
    const total = Number(request.headers.get("x-upload-total"));
    const offset = Number(request.headers.get("x-upload-offset"));
    const type = (request.headers.get("x-upload-type") ?? "").toLowerCase().split(";")[0].trim();

    const ext = EXTENSIONS[type];
    if (!ext || !type.startsWith(kind === "cover" ? "image/" : "audio/")) {
      throw new UploadError(kind === "cover" ? "Muqova JPG, PNG yoki WEBP bo'lsin." : "Bu audio formati qo'llab-quvvatlanmaydi (MP3, M4A, OGG, WAV, FLAC).", 415);
    }
    const limit = kind === "cover" ? BOOK_LIMITS.coverBytes : BOOK_LIMITS.audioBytes;
    if (!Number.isInteger(total) || total <= 0 || total > limit) {
      throw new UploadError(kind === "cover" ? "Muqova 5 MB dan oshmasin." : "Audio 1 GB dan oshmasin.", 413);
    }
    if (!Number.isInteger(offset) || offset < 0) throw new UploadError("X-Upload-Offset noto'g'ri.");

    // Yangi yuklash boshlanadi yoki boshqa fayl kelsa — eski qoldiqni tashlaymiz.
    const previous = await readFile(meta, "utf8").then((t) => JSON.parse(t) as { total: number; type: string }, () => null);
    if (offset === 0 || !previous || previous.total !== total || previous.type !== type) {
      if (offset !== 0) throw new UploadError("Yuklash boshidan boshlanishi kerak.", 409, { received: 0 });
      await rm(part, { force: true });
      await writeFile(meta, JSON.stringify({ total, type }));
    }
    const received = await sizeOf(part);
    if (offset !== received) throw new UploadError("Bo'lak tartibi buzildi.", 409, { received });

    const chunk = new Uint8Array(await request.arrayBuffer());
    if (!chunk.length || chunk.length > BOOK_LIMITS.chunkBytes) throw new UploadError("Bo'lak hajmi noto'g'ri.", 413);
    if (offset + chunk.length > total) throw new UploadError("Fayl e'lon qilingan hajmdan katta.", 413);
    await appendFile(part, chunk);

    const now = offset + chunk.length;
    if (now < total) return json({ done: false, received: now });

    // Oxirgi bo'lak: eski faylni almashtiramiz va bazaga yozamiz.
    const file = `${kind}.${ext}`;
    for (const name of await readdir(dir)) {
      if (name.startsWith(`${kind}.`) && !name.startsWith(`${kind}.upload`) && name !== file) await rm(path.join(dir, name), { force: true });
    }
    await rename(part, path.join(dir, file));
    await rm(meta, { force: true });
    const seconds = Math.max(0, Math.round(Number(request.headers.get("x-audio-seconds")) || 0));
    const book = await setBookMedia(db, id, kind, file, { mime: type, bytes: total, seconds });
    return json({ done: true, received: total, book });
  });
}
