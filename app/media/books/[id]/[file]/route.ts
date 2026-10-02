/**
 * Kitob muqovasi va audiosini berish. Range so'rovlari qo'llab-quvvatlanadi —
 * audio istalgan joydan boshlanadi va 1 GB faylni butunlay yuklab olish shart emas.
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { BOOK_ID_PATTERN, MEDIA_FILE_PATTERN, bookDir } from "@/server/services/books";

type Segment = { params: Promise<Record<string, string | string[]>> };

const TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  ogg: "audio/ogg",
  opus: "audio/ogg",
  webm: "audio/webm",
  wav: "audio/wav",
  flac: "audio/flac",
};

const notFound = () => new Response("Topilmadi", { status: 404 });

export async function GET(request: Request, segment: Segment) {
  const params = await segment.params;
  const id = String(params.id);
  const file = String(params.file);
  if (!BOOK_ID_PATTERN.test(id) || !MEDIA_FILE_PATTERN.test(file)) return notFound();

  const full = path.join(bookDir(id), file);
  const info = await stat(full).catch(() => null);
  if (!info?.isFile()) return notFound();

  const size = info.size;
  const headers = new Headers({
    "Content-Type": TYPES[file.split(".").pop() ?? ""] ?? "application/octet-stream",
    "Accept-Ranges": "bytes",
    // URL'da ?v=<updatedAt> bor, shuning uchun uzoq keshlash xavfsiz.
    "Cache-Control": "public, max-age=31536000, immutable",
  });

  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  let start = 0;
  let end = size - 1;
  if (range) {
    if (range[1]) start = Number(range[1]);
    if (range[2]) end = Math.min(Number(range[2]), size - 1);
    if (!range[1] && range[2]) start = Math.max(0, size - Number(range[2]));
    if (start > end || start >= size) {
      headers.set("Content-Range", `bytes */${size}`);
      return new Response(null, { status: 416, headers });
    }
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  }
  headers.set("Content-Length", String(end - start + 1));

  const body = Readable.toWeb(createReadStream(full, { start, end })) as ReadableStream;
  return new Response(body, { status: range ? 206 : 200, headers });
}
