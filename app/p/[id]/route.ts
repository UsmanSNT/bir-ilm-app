/**
 * Ulashiladigan post havolasi: /p/<id>.
 *
 * Telegram, WhatsApp va boshqalar havola uchun oldindan ko'rinish (sarlavha, matn,
 * rasm) chizishi uchun Open Graph teglari bilan kichik HTML qaytaradi, brauzer
 * esa darhol ilovaning o'zidagi postga (`/?post=<id>`) o'tadi.
 */
import { eq } from "drizzle-orm";
import { schema, tryGetDb } from "@/server/db/client";
import { loadPostExtras } from "@/server/services/community";

type Segment = { params: Promise<Record<string, string | string[]>> };

const escape = (text: string) =>
  text.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

const clip = (text: string, max: number) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
};

export async function GET(request: Request, segment: Segment) {
  const id = String((await segment.params).id);
  const base = (process.env.PUBLIC_URL?.trim() || new URL(request.url).origin).replace(/\/+$/, "");
  const target = `/?post=${encodeURIComponent(id)}`;

  const db = /^[0-9a-f-]{36}$/.test(id) ? await tryGetDb() : null;
  const post = db
    ? await db
        .select({
          id: schema.readingPosts.id,
          title: schema.readingPosts.title,
          book: schema.readingPosts.book,
          body: schema.readingPosts.body,
          format: schema.readingPosts.format,
          createdAt: schema.readingPosts.createdAt,
          name: schema.users.name,
        })
        .from(schema.readingPosts)
        .innerJoin(schema.users, eq(schema.users.id, schema.readingPosts.userId))
        .where(eq(schema.readingPosts.id, id))
        .limit(1)
        .then((rows) => rows[0])
    : undefined;
  if (!post || !db) return Response.redirect(`${base}/`, 302);

  const extras = await loadPostExtras(db, [post.id], "");
  const image = extras.media.get(post.id)?.find((item) => item.kind === "image");
  const title = clip(post.title || (post.book ? `${post.name} · ${post.book}` : `${post.name} — Bir Ilm`), 120);
  const description = clip(post.body, 200);
  const url = `${base}/p/${post.id}`;

  const meta = [
    ["og:site_name", "Bir Ilm"],
    ["og:type", post.format === "article" ? "article" : "website"],
    ["og:title", title],
    ["og:description", description],
    ["og:url", url],
    ...(image ? [["og:image", `${base}${image.url}`], ["og:image:width", String(image.width)], ["og:image:height", String(image.height)]] : []),
    ...(post.format === "article" ? [["article:published_time", `${post.createdAt.replace(" ", "T")}Z`], ["article:author", post.name]] : []),
  ].filter(([, value]) => value && value !== "0");

  const html = `<!doctype html>
<html lang="uz">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<meta name="description" content="${escape(description)}">
${meta.map(([key, value]) => `<meta property="${key}" content="${escape(value)}">`).join("\n")}
<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">
<link rel="canonical" href="${escape(url)}">
<meta http-equiv="refresh" content="0; url=${escape(target)}">
</head>
<body>
<p><a href="${escape(target)}">${escape(title)}</a></p>
<script>location.replace(${JSON.stringify(target)})</script>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });
}
