/**
 * Ijtimoiy tarmoq havolalari va qisqa videolar testlari.
 * Route funksiyalari to'g'ridan-to'g'ri chaqiriladi (server shart emas).
 * Ishga tushirish: `node tests/site-v1.mjs`
 */
import assert from "node:assert/strict";
import { statSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

const projectRoot = new URL("../", import.meta.url);
const d1Module = new URL("scripts/local-d1.mjs", projectRoot).href;

/** Bundler kengaytmasiz import qiladi; Node uchun uni o'zimiz topamiz. */
function isFile(url) {
  try {
    return statSync(fileURLToPath(url)).isFile();
  } catch {
    return false;
  }
}

function withExtension(url) {
  if (isFile(url)) return url;

  for (const candidate of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const attempt = `${url}${candidate}`;
    if (isFile(attempt)) return attempt;
  }

  return url;
}

// Loyihada `@/*` aliasi va Worker moduli ishlatiladi; Node uchun ularni
// preview serveri qiladigan tarzda xaritalaymiz.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "cloudflare:workers") return { url: d1Module, shortCircuit: true };

    if (specifier.startsWith("@/")) {
      return next(withExtension(new URL(specifier.slice(2), projectRoot).href), context);
    }

    if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      return next(withExtension(new URL(specifier, context.parentURL).href), context);
    }

    return next(specifier, context);
  },
});

const { sqlite } = await import(d1Module);
const load = (path) => import(new URL(path, projectRoot).href);
const session = await load("app/api/v1/auth/session/route.ts");
const links = await load("app/api/v1/site/links/route.ts");
const videos = await load("app/api/v1/site/videos/route.ts");
const video = await load("app/api/v1/site/videos/[id]/route.ts");
const { parseVideoUrl, videoEmbedUrl, normalizeSocialUrl } = await load("shared/contract/site.ts");

const ORIGIN = "http://127.0.0.1:8787";
const createdUsers = [];

async function client() {
  const response = await session.POST(new Request(`${ORIGIN}/api/v1/auth/session`, { method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN }, body: JSON.stringify({ platform: "web", wantToken: false }) }));
  const payload = await response.json();
  const cookie = response.headers.get("set-cookie").split(";")[0];
  createdUsers.push(payload.data.userId);
  return {
    userId: payload.data.userId,
    call: async (handler, path, { params, expect = 200, method = "GET", body } = {}) => {
      const res = await handler(new Request(`${ORIGIN}${path}`, { method, headers: { Cookie: cookie, Origin: ORIGIN, ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) }), params ? { params: Promise.resolve(params) } : undefined);
      const payload = await res.json();
      assert.equal(res.status, expect, `${method} ${path} → ${res.status}: ${JSON.stringify(payload)}`);
      return payload;
    },
  };
}

try {
  // --- Havolani tanish: faqat YouTube / Instagram / Facebook ---------------
  const yt = parseVideoUrl("https://youtube.com/shorts/dQw4w9WgXcQ?si=abc");
  assert.deepEqual(yt, { platform: "youtube", externalId: "dQw4w9WgXcQ", url: "https://www.youtube.com/shorts/dQw4w9WgXcQ" });
  assert.equal(parseVideoUrl("https://youtu.be/dQw4w9WgXcQ?t=5")?.url, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.equal(parseVideoUrl("https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=x")?.externalId, "dQw4w9WgXcQ");
  assert.equal(videoEmbedUrl(yt), "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&playsinline=1&autoplay=1");
  const ig = parseVideoUrl("instagram.com/reel/C8abcDEF123/?igsh=xyz");
  assert.deepEqual(ig, { platform: "instagram", externalId: "C8abcDEF123", url: "https://www.instagram.com/reel/C8abcDEF123/" });
  assert.equal(videoEmbedUrl(ig), "https://www.instagram.com/reel/C8abcDEF123/embed/");
  assert.equal(parseVideoUrl("https://www.instagram.com/birilm/reel/C8abcDEF123/")?.url, "https://www.instagram.com/reel/C8abcDEF123/");
  assert.equal(parseVideoUrl("https://www.instagram.com/birilm/"), null, "Profil havolasi video emas");
  const fb = parseVideoUrl("https://www.facebook.com/birilm/videos/123456789?utm=1");
  assert.equal(fb?.platform, "facebook");
  assert.equal(fb?.url, "https://www.facebook.com/birilm/videos/123456789");
  assert.match(videoEmbedUrl(fb), /^https:\/\/www\.facebook\.com\/plugins\/video\.php\?href=https%3A%2F%2Fwww\.facebook\.com%2Fbirilm%2Fvideos%2F123456789/);
  for (const bad of ["https://evil.example/shorts/dQw4w9WgXcQ", "javascript:alert(1)", "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ", "https://youtube.com/watch?v=short", "https://user:pw@youtube.com/watch?v=dQw4w9WgXcQ", "not a url", "https://www.facebook.com/birilm/"]) {
    assert.equal(parseVideoUrl(bad), null, bad);
  }
  assert.equal(normalizeSocialUrl("telegram", "@birilm_uz"), "https://t.me/birilm_uz");
  assert.equal(normalizeSocialUrl("telegram", "t.me/birilm"), "https://t.me/birilm");
  assert.equal(normalizeSocialUrl("instagram", "https://evil.example/birilm"), null);
  assert.equal(normalizeSocialUrl("youtube", "javascript:alert(1)"), null);
  assert.equal(normalizeSocialUrl("facebook", "  "), "");
  console.log("PASS: Video va tarmoq havolalari: tanish, normallash, begona domen va xavfli sxemalar rad etiladi.");

  // --- API: ruxsatlar va saqlash ---------------------------------------------
  const admin = await client();
  const user = await client();
  sqlite.prepare("INSERT INTO users (id, role) VALUES (?, 'admin') ON CONFLICT(id) DO UPDATE SET role = 'admin'").run(admin.userId);
  sqlite.prepare("DELETE FROM site_links").run();
  sqlite.prepare("DELETE FROM video_links").run();

  assert.deepEqual((await user.call(links.GET, "/api/v1/site/links")).data, {});
  await user.call(links.PUT, "/api/v1/site/links", { method: "PUT", body: { telegram: "@birilm" }, expect: 403 });
  await admin.call(links.PUT, "/api/v1/site/links", { method: "PUT", body: { telegram: "https://evil.example/x" }, expect: 422 });
  const saved = (await admin.call(links.PUT, "/api/v1/site/links", { method: "PUT", body: { telegram: "@birilm_uz", youtube: "youtube.com/@birilm", instagram: "https://instagram.com/birilm", facebook: "" } })).data;
  assert.deepEqual(saved, { telegram: "https://t.me/birilm_uz", youtube: "https://youtube.com/@birilm", instagram: "https://instagram.com/birilm" });
  const kept = (await admin.call(links.PUT, "/api/v1/site/links", { method: "PUT", body: { telegram: "" } })).data;
  assert.deepEqual(Object.keys(kept).sort(), ["instagram", "youtube"], "Bo'sh qator o'chiradi, yuborilmaganiga tegmaydi");
  assert.equal((await user.call(links.GET, "/api/v1/site/links")).data.instagram, "https://instagram.com/birilm", "Mehmon ham o'qiydi");

  await user.call(videos.POST, "/api/v1/site/videos", { method: "POST", body: { url: "https://youtu.be/dQw4w9WgXcQ" }, expect: 403 });
  await admin.call(videos.POST, "/api/v1/site/videos", { method: "POST", body: { url: "https://evil.example/v" }, expect: 400 });
  const added = (await admin.call(videos.POST, "/api/v1/site/videos", { method: "POST", body: { url: "https://youtube.com/shorts/dQw4w9WgXcQ?si=1", title: "Birinchi" }, expect: 201 })).data;
  assert.equal(added.platform, "youtube");
  const again = (await admin.call(videos.POST, "/api/v1/site/videos", { method: "POST", body: { url: "https://youtu.be/dQw4w9WgXcQ" }, expect: 201 })).data;
  assert.equal(again.id !== added.id, true, "Shorts va watch — turli kanonik havola");
  const same = (await admin.call(videos.POST, "/api/v1/site/videos", { method: "POST", body: { url: "https://www.youtube.com/shorts/dQw4w9WgXcQ" }, expect: 201 })).data;
  assert.equal(same.id, added.id, "Takroriy havola ikkinchi marta qo'shilmaydi");
  await admin.call(videos.POST, "/api/v1/site/videos", { method: "POST", body: { url: "https://www.instagram.com/reel/C8abcDEF123/" }, expect: 201 });
  assert.equal((await user.call(videos.GET, "/api/v1/site/videos")).data.items.length, 3);
  await user.call(video.DELETE, `/api/v1/site/videos/${added.id}`, { method: "DELETE", params: { id: added.id }, expect: 403 });
  await admin.call(video.DELETE, `/api/v1/site/videos/${added.id}`, { method: "DELETE", params: { id: added.id } });
  await admin.call(video.DELETE, `/api/v1/site/videos/${added.id}`, { method: "DELETE", params: { id: added.id }, expect: 404 });
  assert.equal((await user.call(videos.GET, "/api/v1/site/videos")).data.items.length, 2);
  console.log("PASS: Havolalar va videolar: hamma o'qiydi, faqat admin o'zgartiradi, takror va begona havola rad etiladi.");

  console.log("\nHAMMASI O'TDI: ijtimoiy havolalar va videolar.");
} finally {
  sqlite.prepare("DELETE FROM site_links").run();
  sqlite.prepare("DELETE FROM video_links").run();
  const unique = [...new Set(createdUsers)];
  if (unique.length) sqlite.prepare(`DELETE FROM users WHERE id IN (${unique.map(() => "?").join(",")})`).run(...unique);
}
