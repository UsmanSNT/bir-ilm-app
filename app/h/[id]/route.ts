/**
 * Ulashilgan kun hikmati: birilm.uz/h/<kod>.
 *
 * Telegram va boshqa ilovalar havola uchun oldindan ko'rinish chizishi uchun Open Graph teglari (hikmat matni
 * sarlavhada, Bir Ilm brendi va rasm). Havolani ochgan odam hikmatning o'zini ko'radi — yo'naltirish yo'q,
 * qayerga kelgani va kim yuborgani tushunarli bo'lsin; ilovaga o'tish — tugma bilan.
 */
import { tryGetDb } from "@/server/db/client";
import { getWisdom } from "@/server/services/wisdom";
import { WISDOM_ID_PATTERN } from "@/shared/contract";

type Segment = { params: Promise<Record<string, string | string[]>> };

const escape = (text: string) =>
  text.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

const clip = (text: string, max: number) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
};

export async function GET(request: Request, segment: Segment) {
  const id = String((await segment.params).id).toLowerCase();
  const base = (process.env.PUBLIC_URL?.trim() || new URL(request.url).origin).replace(/\/+$/, "");
  const db = WISDOM_ID_PATTERN.test(id) ? await tryGetDb() : null;
  const wisdom = db ? await getWisdom(db, id) : null;
  if (!wisdom) return Response.redirect(`${base}/`, 302);

  const title = `«${clip(wisdom.text, 110)}»`;
  const description = `Kun hikmati · ${wisdom.author}. Bir Ilm — har hafta bitta kitob, har kuni bitta hikmat.`;
  const url = `${base}/h/${wisdom.id}`;
  const image = `${base}/assets/hikmat-og.jpg`;
  const meta: Array<[string, string]> = [
    ["og:site_name", "Bir Ilm"],
    ["og:type", "article"],
    ["og:locale", "uz_UZ"],
    ["og:title", title],
    ["og:description", description],
    ["og:url", url],
    ["og:image", image],
    ["og:image:width", "1200"],
    ["og:image:height", "630"],
    ["og:image:alt", "Bir Ilm — kun hikmati"],
  ];

  const html = `<!doctype html>
<html lang="uz">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)} — Bir Ilm</title>
<meta name="description" content="${escape(description)}">
${meta.map(([key, value]) => `<meta property="${key}" content="${escape(value)}">`).join("\n")}
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#1e2f6e">
<link rel="canonical" href="${escape(url)}">
<link rel="icon" href="/assets/icon-192.png">
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100dvh; display: grid; place-items: center; padding: 24px 16px;
    font: 500 16px/1.5 "Segoe UI", system-ui, -apple-system, sans-serif; color: #1b1a2e;
    background:
      linear-gradient(180deg, #131f4cf0, #1e2f6ee0 50%, #131f4cf5),
      url("/assets/girih-koshin.webp") center / 146px 147px repeat, #1e2f6e;
  }
  main { width: min(440px, 100%); text-align: center; }
  .card {
    position: relative; padding: 40px 28px 30px; border-radius: 22px;
    background: radial-gradient(circle at 12% 10%, #fff 0, transparent 45%), linear-gradient(160deg, #fffbf2, #fbf2df);
    box-shadow: 0 0 0 1px #e8d6ae, 0 30px 60px -30px #000c;
  }
  .card::before { content: ""; position: absolute; inset: 8px; border: 1px solid #e3cc98; border-radius: 16px; pointer-events: none; }
  .band { position: absolute; top: 0; left: 50%; width: 120px; height: 12px; border-radius: 0 0 9px 9px; transform: translateX(-50%); background: url("/assets/adras.png") center / auto 260% repeat-x; }
  .eyebrow { margin: 0; color: #a5782a; font-size: 12px; font-weight: 800; letter-spacing: .2em; text-transform: uppercase; }
  blockquote { margin: 16px 0 12px; color: #161b3b; font: italic 600 clamp(22px, 6vw, 27px)/1.4 Georgia, "Times New Roman", serif; }
  .author { margin: 0; color: #8a7a55; font-size: 14px; font-weight: 650; }
  .brand { display: flex; align-items: center; justify-content: center; gap: 12px; margin: 26px 0 0; color: #f3eedf; }
  .brand img { width: 46px; height: 46px; border-radius: 50%; object-fit: cover; box-shadow: 0 0 0 2px #e2b65c; background: #fffbf3; }
  .brand b { display: block; font: 700 21px/1.1 Georgia, serif; text-align: left; }
  .brand small { display: block; color: #e2b65c; font-size: 12px; font-weight: 700; text-align: left; }
  .cta {
    display: inline-flex; align-items: center; justify-content: center; width: 100%; min-height: 52px; margin-top: 20px;
    border-radius: 999px; background: linear-gradient(180deg, #f0cf83, #e2b65c 40%, #c08a2e); color: #131f4c;
    font-weight: 800; text-decoration: none; box-shadow: 0 1px 0 #fff8 inset, 0 12px 24px -12px #000;
  }
  .cta:focus-visible { outline: 3px solid #17a2a0; outline-offset: 3px; }
  .note { margin: 12px 0 0; color: #cfcde3; font-size: 13px; }
</style>
</head>
<body>
<main>
  <article class="card">
    <span class="band" aria-hidden="true"></span>
    <p class="eyebrow">Kun hikmati</p>
    <blockquote>«${escape(wisdom.text)}»</blockquote>
    <p class="author">— ${escape(wisdom.author)}</p>
  </article>
  <div class="brand">
    <img src="/assets/bir-ilm-logo.jpg" alt="" width="46" height="46">
    <div><b>Bir Ilm</b><small>Har hafta bitta kitob · kitobxonlar jamoasi</small></div>
  </div>
  <a class="cta" href="/">Bir Ilm’ni ochish</a>
  <p class="note">Hikmatni sizga Bir Ilm kitobxonlaridan biri yubordi.</p>
</main>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });
}
