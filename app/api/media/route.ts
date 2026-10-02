import { env } from "cloudflare:workers";
import { MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, MEDIA_KEY, UPLOADS_PER_HOUR, mimeForKey, sniff } from "@/app/media-rules";
import { authRequired, readerIdentity } from "@/lib/reader-identity";

export const runtime = "edge";

const json = (body: unknown, status: number, headers?: Headers) => Response.json(body, { status, headers });

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "So'rov rad etildi." }, 403);
  const { id, headers, authed } = await readerIdentity(request);
  if (!authed) return authRequired(headers);
  const db = env.DB, bucket = env.BUCKET;
  if (!db || !bucket) return json({ error: "Media saqlash hali sozlanmagan." }, 503, headers);

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (!declared || declared > MAX_VIDEO_BYTES) return json({ error: "Fayl hajmi 40 MB dan oshmasin." }, 413, headers);

  try {
    await db.prepare("INSERT OR IGNORE INTO users (id, name) VALUES (?, 'Kitobxon')").bind(id).run();
    const recent = await db.prepare("SELECT count(*) AS n FROM media_uploads WHERE user_id=? AND created_at > datetime('now','-1 hour')").bind(id).first<{ n: number }>();
    if ((recent?.n ?? 0) >= UPLOADS_PER_HOUR) return json({ error: "Juda ko'p yuklash. Birozdan keyin urinib ko'ring." }, 429, headers);

    const bytes = new Uint8Array(await request.arrayBuffer());
    const kind = sniff(bytes);
    if (!kind) return json({ error: "Faqat JPG, PNG, GIF, WEBP rasm yoki MP4, MOV, WEBM video." }, 415, headers);
    if (bytes.byteLength > (kind.type === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES)) return json({ error: kind.type === "image" ? "Rasm 8 MB dan oshmasin." : "Video 40 MB dan oshmasin." }, 413, headers);

    const key = `${crypto.randomUUID().replace(/-/g, "")}.${kind.ext}`;
    await bucket.put(key, bytes, { httpMetadata: { contentType: kind.mime } });
    await db.prepare("INSERT INTO media_uploads (key, user_id, type, size) VALUES (?,?,?,?)").bind(key, id, kind.type, bytes.byteLength).run();
    return json({ key, type: kind.type }, 200, headers);
  } catch {
    return json({ error: "Fayl saqlanmadi. Qayta urinib ko'ring." }, 503, headers);
  }
}

export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("k") ?? "";
  if (!MEDIA_KEY.test(key)) return new Response("Not found", { status: 404 });
  const bucket = env.BUCKET;
  if (!bucket) return new Response("Unavailable", { status: 503 });

  const head = await bucket.head(key);
  if (!head) return new Response("Not found", { status: 404 });
  const size = head.size;
  const headers = new Headers({
    "Content-Type": head.httpMetadata?.contentType ?? mimeForKey(key),
    "Cache-Control": "public, max-age=31536000, immutable",
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Content-Disposition": "inline",
  });

  // Safari/iOS video uchun Range so'rovlari majburiy.
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    end = Math.min(end, size - 1);
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    start = Math.max(0, start);
    const part = await bucket.get(key, { range: { offset: start, length: end - start + 1 } });
    if (!part) return new Response("Not found", { status: 404 });
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    headers.set("Content-Length", String(end - start + 1));
    return new Response(part.body, { status: 206, headers });
  }

  const object = await bucket.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  headers.set("Content-Length", String(size));
  return new Response(object.body, { status: 200, headers });
}
