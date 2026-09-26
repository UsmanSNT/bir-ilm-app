/**
 * Post rasmlari va videolari. Range qo'llab-quvvatlanadi — video istalgan joydan
 * boshlanadi va butunlay yuklab olinmaydi. Fayl nomi UUID, o'zgarmaydi — uzoq keshlash xavfsiz.
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { POST_MEDIA_FILE, postMediaDir } from "@/server/services/community";

type Segment = { params: Promise<Record<string, string | string[]>> };

const TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

const notFound = () => new Response("Topilmadi", { status: 404 });

export async function GET(request: Request, segment: Segment) {
  const file = String((await segment.params).file);
  if (!POST_MEDIA_FILE.test(file)) return notFound();

  const full = path.join(postMediaDir(), file);
  const info = await stat(full).catch(() => null);
  if (!info?.isFile()) return notFound();

  const size = info.size;
  const headers = new Headers({
    "Content-Type": TYPES[file.split(".").pop() ?? ""] ?? "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    // Ilova (capacitor/https://localhost) ham rasmni chiza olsin.
    "Cross-Origin-Resource-Policy": "cross-origin",
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
