/**
 * Ulashiladigan viktorina havolasi: /q/<16 hex>.
 *
 * Telegram, WhatsApp va boshqalar oldindan ko'rinish (nom, rasm) chizishi uchun Open Graph
 * teglari bilan kichik HTML qaytaradi; brauzer darhol ilovaga (`/?viktorina=qz_<id>`) o'tadi.
 * Kirish talabi va viktorinani ochish ilovaning o'zida.
 */
import { eq } from "drizzle-orm";
import { schema, tryGetDb } from "@/server/db/client";

type Segment = { params: Promise<Record<string, string | string[]>> };

const ID_PATTERN = /^[0-9a-f]{8,32}$/;

const escape = (text: string) =>
  text.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

export async function GET(request: Request, segment: Segment) {
  const short = String((await segment.params).id).toLowerCase();
  const base = (process.env.PUBLIC_URL?.trim() || new URL(request.url).origin).replace(/\/+$/, "");
  if (!ID_PATTERN.test(short)) return Response.redirect(`${base}/`, 302);

  const quizId = `qz_${short}`;
  const db = await tryGetDb();
  const quiz = db
    ? await db
        .select({ title: schema.quizzes.title, image: schema.quizzes.image })
        .from(schema.quizzes)
        .where(eq(schema.quizzes.id, quizId))
        .limit(1)
        .then((rows) => rows[0])
    : undefined;
  if (!quiz) return Response.redirect(`${base}/`, 302);

  const target = `/?viktorina=${encodeURIComponent(quizId)}`;
  const title = `${quiz.title} — viktorina`;
  const description = "Bir Ilm viktorinasi: savollarga javob bering va bilimingizni sinang.";
  const url = `${base}/q/${short}`;
  const meta = [
    ["og:site_name", "Bir Ilm"],
    ["og:type", "website"],
    ["og:title", title],
    ["og:description", description],
    ["og:url", url],
    ...(quiz.image ? [["og:image", `${base}${quiz.image}`]] : []),
  ];
  const html = `<!doctype html>
<html lang="uz">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<meta name="description" content="${escape(description)}">
${meta.map(([key, value]) => `<meta property="${key}" content="${escape(value)}">`).join("\n")}
<meta name="twitter:card" content="${quiz.image ? "summary_large_image" : "summary"}">
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
