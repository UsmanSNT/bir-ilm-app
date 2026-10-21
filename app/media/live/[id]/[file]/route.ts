/**
 * Suhbat audiosi. `archive.*` — hammaga ochiq (O'tgan suhbatlar), `rec-*` — xom yozuv,
 * faqat admin/moderator. `?download=1` bo'lsa fayl yuklab olinadi. Range qo'llab-quvvatlanadi.
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { resolveIdentity } from "@/server/auth/identity";
import { tryGetDb } from "@/server/db/client";
import { LIVE_FILE_PATTERN, LIVE_ID_PATTERN, liveDir } from "@/server/services/live";
import { getUserRole } from "@/server/services/roles";
import { canModerate } from "@/shared/contract/roles";

type Segment = { params: Promise<Record<string, string | string[]>> };

const TYPES: Record<string, string> = {
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
  if (!LIVE_ID_PATTERN.test(id) || !LIVE_FILE_PATTERN.test(file)) return notFound();

  const raw = file.startsWith("rec-");
  if (raw) {
    const db = await tryGetDb();
    if (!db) return notFound();
    const { userId } = await resolveIdentity(request);
    if (!canModerate(await getUserRole(db, userId))) return notFound();
  }

  const full = path.join(liveDir(id), file);
  const info = await stat(full).catch(() => null);
  if (!info?.isFile()) return notFound();

  const size = info.size;
  const ext = file.split(".").pop() ?? "";
  const headers = new Headers({
    "Content-Type": TYPES[ext] ?? "application/octet-stream",
    "Accept-Ranges": "bytes",
    // Xom yozuv yozilayotganda o'sib boradi — keshlanmasin. Arxiv URL'ida ?v= bor.
    "Cache-Control": raw ? "private, no-store" : "public, max-age=31536000, immutable",
  });
  if (new URL(request.url).searchParams.has("download")) {
    headers.set("Content-Disposition", `attachment; filename="${id}-${file}"`);
  }

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
