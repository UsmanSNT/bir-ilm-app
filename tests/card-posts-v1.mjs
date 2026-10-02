/** Gurung karta postlari: yaratish, validatsiya, lentada dizayn, tahrir. `node tests/card-posts-v1.mjs` */
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
const posts = await load("app/api/v1/community/posts/route.ts");
const post = await load("app/api/v1/community/posts/[id]/route.ts");
const social = await load("app/api/social/route.ts");

const ORIGIN = "http://127.0.0.1:8787";
const created = [];

async function call(handler, path, { expect = 200, method = "GET", body, cookie, params } = {}) {
  const response = await handler(new Request(`${ORIGIN}${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), Origin: ORIGIN, ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), params ? { params: Promise.resolve(params) } : undefined);
  const payload = await response.json();
  assert.equal(response.status, expect, `${method} ${path} → ${response.status}: ${JSON.stringify(payload)}`);
  return { payload, response };
}

async function writer() {
  const { payload, response } = await call(session.POST, "/api/v1/auth/session", { method: "POST", body: { platform: "web" }, expect: 201 });
  const userId = payload.data.userId;
  created.push(userId);
  sqlite.prepare("INSERT OR IGNORE INTO users (id, name) VALUES (?, 'Karta')").run(userId);
  sqlite.prepare("INSERT OR IGNORE INTO auth_accounts (provider, subject, user_id, display_name) VALUES ('google', ?, ?, 'Karta')").run(`card-${userId}`, userId);
  return { userId, cookie: response.headers.get("set-cookie").split(";")[0] };
}

const design = { bg: "firuza", font: "serif", text: "  Kitob — qalb chirog‘i  ", stickers: [{ e: "📚", x: 140, y: -5, s: 9 }, { e: "✨", x: 50.123, y: 40, s: 1.234 }] };

try {
  const w = await writer();
  const other = await writer();
  const base = { format: "card", content: [], attachments: [] };

  await call(posts.POST, "/api/v1/community/posts", { method: "POST", cookie: w.cookie, body: { ...base }, expect: 422 });
  await call(posts.POST, "/api/v1/community/posts", { method: "POST", cookie: w.cookie, body: { ...base, design: { ...design, bg: "qora" } }, expect: 422 });
  await call(posts.POST, "/api/v1/community/posts", { method: "POST", cookie: w.cookie, body: { ...base, design: { ...design, stickers: [{ e: "<script>", x: 1, y: 1, s: 1 }] } }, expect: 422 });
  await call(posts.POST, "/api/v1/community/posts", { method: "POST", cookie: w.cookie, body: { ...base, design: { ...design, text: "", stickers: [] } }, expect: 422 });
  await call(posts.POST, "/api/v1/community/posts", { method: "POST", cookie: w.cookie, body: { ...base, design: { ...design, text: "x".repeat(281) } }, expect: 422 });
  await call(posts.POST, "/api/v1/community/posts", { method: "POST", cookie: w.cookie, body: { ...base, design, attachments: [crypto.randomUUID()] }, expect: 422 });

  const { payload } = await call(posts.POST, "/api/v1/community/posts", { method: "POST", cookie: w.cookie, body: { ...base, book: "Alkimyogar", design }, expect: 201 });
  const id = payload.data.id;
  const row = sqlite.prepare("SELECT format, body, design FROM reading_posts WHERE id = ?").get(id);
  assert.equal(row.format, "card");
  assert.equal(row.body, "Kitob — qalb chirog‘i", "Matnli nusxa (qidiruv, eski ilovalar)");
  const saved = JSON.parse(row.design);
  assert.deepEqual(saved.stickers[0], { e: "📚", x: 100, y: 0, s: 2.5 }, "Koordinata va o'lcham chegaralanadi");
  assert.equal(saved.stickers[1].x, 50.1);
  console.log("PASS: Karta: validatsiya (fon, stiker ro'yxati, bo'sh, uzunlik, albom), normallashtirish, matnli nusxa.");

  const feed = await (await social.GET(new Request(`${ORIGIN}/api/social`, { headers: { Cookie: other.cookie } }))).json();
  const inFeed = feed.posts.find((p) => p.id === id);
  assert.equal(inFeed.format, "card");
  assert.equal(inFeed.design.bg, "firuza");
  assert.equal(inFeed.design.text, "Kitob — qalb chirog‘i");
  sqlite.prepare("UPDATE reading_posts SET design = '{buzilgan' WHERE id = ?").run(id);
  const broken = (await (await social.GET(new Request(`${ORIGIN}/api/social`, { headers: { Cookie: other.cookie } }))).json()).posts.find((p) => p.id === id);
  assert.equal(broken.design, null, "Buzilgan JSON — oddiy matn sifatida");
  console.log("PASS: Lenta dizaynni qaytaradi; buzilgan dizayn xavfsiz o'qiladi.");

  await call(post.PUT, `/api/v1/community/posts/${id}`, { method: "PUT", params: { id }, cookie: other.cookie, body: { ...base, design }, expect: 403 });
  await call(post.PUT, `/api/v1/community/posts/${id}`, { method: "PUT", params: { id }, cookie: w.cookie, body: { ...base, design: { ...design, bg: "tilla", text: "Yangilandi" } } });
  assert.equal(JSON.parse(sqlite.prepare("SELECT design FROM reading_posts WHERE id = ?").get(id).design).bg, "tilla");
  // Oddiy postga aylantirilsa — dizayn olib tashlanadi.
  await call(post.PUT, `/api/v1/community/posts/${id}`, { method: "PUT", params: { id }, cookie: w.cookie, body: { format: "post", content: [{ type: "p", c: [{ t: "Endi oddiy post" }] }], design } });
  assert.equal(sqlite.prepare("SELECT design FROM reading_posts WHERE id = ?").get(id).design, null);
  console.log("PASS: Tahrir: faqat muallif; oddiy postga o'tganda dizayn o'chadi.");

  console.log("\nHAMMASI O'TDI: karta postlar.");
} finally {
  if (created.length) {
    const ph = created.map(() => "?").join(",");
    sqlite.prepare(`DELETE FROM reading_posts WHERE user_id IN (${ph})`).run(...created);
    sqlite.prepare(`DELETE FROM auth_accounts WHERE user_id IN (${ph})`).run(...created);
    sqlite.prepare(`DELETE FROM users WHERE id IN (${ph})`).run(...created);
  }
}
