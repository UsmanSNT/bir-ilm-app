/**
 * Kun hikmati: bugungi hikmat, admin tahriri va ulashish havolasi (birilm.uz/h/<kod>).
 * Ishga tushirish: `node tests/wisdom-v1.mjs`
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
const register = await load("app/api/v1/auth/register/route.ts");
const wisdomRoute = await load("app/api/v1/site/wisdom/route.ts");
const wisdomItem = await load("app/api/v1/site/wisdom/[id]/route.ts");
const shortLink = await load("app/h/[id]/route.ts");
const { wisdomIndex, wisdomDay } = await load("shared/contract/site.ts");

const ORIGIN = "http://127.0.0.1:8787";
const created = new Set();
const wisdomIds = new Set();
let ipCounter = 0;

async function call(handler, path, { expect = 200, method = "GET", body, cookie, params } = {}) {
  const response = await handler(new Request(`${ORIGIN}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      Origin: ORIGIN,
      "X-Forwarded-For": `10.2.0.${++ipCounter % 250}`,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), { params: Promise.resolve(params ?? {}) });
  const payload = await response.json();
  assert.equal(response.status, expect, `${method} ${path} → ${response.status}: ${JSON.stringify(payload)}`);
  const setCookie = response.headers.get("set-cookie");
  return { payload, cookie: setCookie ? setCookie.split(";")[0] : null };
}

const suffix = Math.random().toString(36).slice(2, 8);
async function guest() {
  const { payload, cookie } = await call(session.POST, "/api/v1/auth/session", { method: "POST", body: { platform: "web" }, expect: 201 });
  created.add(payload.data.userId);
  return { cookie };
}
async function makeUser(label, role) {
  const g = await guest();
  const reg = await call(register.POST, "/api/v1/auth/register", { method: "POST", cookie: g.cookie, expect: 201, body: { name: `Hikmat ${label}`, email: `wisdom-${label}-${suffix}@example.com`, password: "kitob-sevaman-1" } });
  if (role) sqlite.prepare("UPDATE users SET role=? WHERE id=?").run(role, reg.payload.data.userId);
  return { cookie: reg.cookie };
}
const page = async (id) => {
  const response = await shortLink.GET(new Request(`${ORIGIN}/h/${id}`), { params: Promise.resolve({ id }) });
  return { status: response.status, location: response.headers.get("location"), html: response.status === 200 ? await response.text() : "" };
};

try {
  const admin = await makeUser("admin", "admin");
  const moderator = await makeUser("mod", "moderator");
  const user = await makeUser("user");
  const g0 = await guest();

  // Bugungi hikmat: hamma ko'radi, ro'yxat faqat adminga.
  const pub = (await call(wisdomRoute.GET, "/api/v1/site/wisdom", { cookie: g0.cookie })).payload.data;
  assert.ok(pub.today, "Boshlang'ich hikmatlar migratsiyada qo'shilgan");
  assert.equal(pub.items, null, "Mehmonga to'liq ro'yxat berilmaydi");
  assert.equal((await call(wisdomRoute.GET, "/api/v1/site/wisdom", { cookie: moderator.cookie })).payload.data.items, null, "Moderatorga ham");
  const all = (await call(wisdomRoute.GET, "/api/v1/site/wisdom", { cookie: admin.cookie })).payload.data.items;
  assert.ok(all.length >= 4);
  assert.ok(all.every((w) => /^[a-z0-9]{6}$/.test(w.id)), "Har bir hikmatning qisqa kodi bor");
  const featuredToday = all.find((w) => w.featuredOn === wisdomDay());
  assert.equal(pub.today.id, (featuredToday ?? all[wisdomIndex(all.length)]).id, "Belgilanmagan kuni navbatdagisi ko'rsatiladi");
  console.log("PASS: Bugungi hikmat: hamma uchun bir xil (navbat yoki belgilangan), to'liq ro'yxat faqat adminga.");

  // Qo'shish: faqat admin; tekshiruvlar.
  const good = { text: "Kitob — <sabrli> do'st & ustoz.", author: "" };
  await call(wisdomRoute.POST, "/api/v1/site/wisdom", { method: "POST", cookie: user.cookie, body: good, expect: 403 });
  await call(wisdomRoute.POST, "/api/v1/site/wisdom", { method: "POST", cookie: moderator.cookie, body: good, expect: 403 });
  await call(wisdomRoute.POST, "/api/v1/site/wisdom", { method: "POST", cookie: admin.cookie, body: { text: "ab" }, expect: 422 });
  await call(wisdomRoute.POST, "/api/v1/site/wisdom", { method: "POST", cookie: admin.cookie, body: { text: "x".repeat(281) }, expect: 422 });
  const made = (await call(wisdomRoute.POST, "/api/v1/site/wisdom", { method: "POST", cookie: admin.cookie, body: good, expect: 201 })).payload.data;
  wisdomIds.add(made.id);
  assert.match(made.id, /^[a-z0-9]{6}$/);
  assert.equal(made.author, "Bir Ilm", "Muallif bo'sh bo'lsa — Bir Ilm");
  const second = (await call(wisdomRoute.POST, "/api/v1/site/wisdom", { method: "POST", cookie: admin.cookie, body: { text: "Har kun bir sahifa.", author: "Alisher Navoiy" }, expect: 201 })).payload.data;
  wisdomIds.add(second.id);
  console.log("PASS: Qo'shish: faqat admin (moderator ham emas), qisqa/uzun matn rad etiladi, 6 belgili kod, muallif standarti.");

  // Bugunga belgilash: bir kunga bitta.
  const put = (id, body, cookie = admin.cookie, expect = 200) => call(wisdomItem.PUT, `/api/v1/site/wisdom/${id}`, { method: "PUT", cookie, params: { id }, body, expect });
  await put(made.id, { featureToday: true }, user.cookie, 403);
  await put(made.id, { featureToday: true });
  assert.equal((await call(wisdomRoute.GET, "/api/v1/site/wisdom")).payload.data.today.id, made.id, "Belgilangan hikmat bugun hammaga ko'rinadi");
  await put(second.id, { featureToday: true });
  const after = (await call(wisdomRoute.GET, "/api/v1/site/wisdom", { cookie: admin.cookie })).payload.data;
  assert.equal(after.today.id, second.id);
  assert.equal(after.items.find((w) => w.id === made.id).featuredOn, null, "Avvalgi belgi olib tashlanadi: bir kunga bitta hikmat");
  const edited = (await put(second.id, { text: "Har kuni bir sahifa — yilda bir kitob.", author: "" })).payload.data;
  assert.equal(edited.text, "Har kuni bir sahifa — yilda bir kitob.");
  assert.equal(edited.author, "Bir Ilm");
  assert.equal(edited.featuredOn, wisdomDay(), "Matn tahriri belgini o'chirmaydi");
  await put(second.id, { featureToday: false });
  const unpinned = (await call(wisdomRoute.GET, "/api/v1/site/wisdom", { cookie: admin.cookie })).payload.data;
  assert.equal(unpinned.items.find((w) => w.id === second.id).featuredOn, null, "Belgi olib tashlandi");
  assert.equal(unpinned.today.id, (unpinned.items.find((w) => w.featuredOn === wisdomDay()) ?? unpinned.items[wisdomIndex(unpinned.items.length)]).id, "Belgi olingach yana navbatdagisi");
  await put("yoqkod", { text: "Yo'q hikmat" }, admin.cookie, 404);
  console.log("PASS: Tahrirlash: bugunga belgilash (bir kunga bitta), belgini olish, matn va muallifni o'zgartirish.");

  // Ulashish havolasi: Open Graph va xavfsiz matn.
  const html = await page(made.id);
  assert.equal(html.status, 200);
  assert.ok(html.html.includes('property="og:site_name" content="Bir Ilm"'));
  assert.ok(html.html.includes('property="og:title" content="«Kitob — &lt;sabrli&gt; do&#39;st &amp; ustoz.»"'), "Matn HTML uchun ekranlanadi");
  assert.ok(html.html.includes("/assets/hikmat-og.jpg"), "Oldindan ko'rinish rasmi");
  assert.ok(html.html.includes(`<link rel="canonical" href="${ORIGIN}/h/${made.id}">`));
  assert.ok(!html.html.includes("<sabrli>"), "Xom HTML sahifaga tushmaydi");
  assert.ok(!/http-equiv="refresh"|location\.replace/.test(html.html), "Sahifa hikmatni ko'rsatadi, avtomatik yo'naltirmaydi");
  assert.equal((await page(made.id.toUpperCase())).status, 200, "Katta harf bilan yozilgan kod ham ishlaydi");
  const bad = await page("../etc");
  assert.equal(bad.status, 302);
  assert.equal(bad.location, `${ORIGIN}/`);
  console.log("PASS: Ulashish havolasi: Open Graph (Bir Ilm, hikmat matni, rasm), matn ekranlanadi, noto'g'ri kod bosh sahifaga.");

  // O'chirish
  await call(wisdomItem.DELETE, `/api/v1/site/wisdom/${made.id}`, { method: "DELETE", cookie: user.cookie, params: { id: made.id }, expect: 403 });
  await call(wisdomItem.DELETE, `/api/v1/site/wisdom/${made.id}`, { method: "DELETE", cookie: admin.cookie, params: { id: made.id } });
  wisdomIds.delete(made.id);
  assert.equal((await page(made.id)).status, 302, "O'chirilgan hikmat havolasi bosh sahifaga olib boradi");
  await call(wisdomItem.DELETE, `/api/v1/site/wisdom/${made.id}`, { method: "DELETE", cookie: admin.cookie, params: { id: made.id }, expect: 404 });
  console.log("PASS: O'chirish: faqat admin; havola bosh sahifaga o'tadi.");

  console.log("\nHAMMASI O'TDI: kun hikmati.");
} finally {
  for (const id of wisdomIds) sqlite.prepare("DELETE FROM wisdoms WHERE id=?").run(id);
  const ids = [...created];
  if (ids.length) {
    const ph = ids.map(() => "?").join(",");
    for (const table of ["user_sessions", "user_passwords", "auth_accounts"]) sqlite.prepare(`DELETE FROM ${table} WHERE user_id IN (${ph})`).run(...ids);
    sqlite.prepare(`DELETE FROM users WHERE id IN (${ph})`).run(...ids);
  }
  console.log(`Tozalandi: ${ids.length} ta foydalanuvchi.`);
}
