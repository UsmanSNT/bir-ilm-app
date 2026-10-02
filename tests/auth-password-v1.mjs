/**
 * Email + parol (ro'yxatdan o'tish, kirish, tiklash, o'zgartirish) integratsion testlari.
 * Ishga tushirish: `node tests/auth-password-v1.mjs`
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
const login = await load("app/api/v1/auth/login/route.ts");
const forgot = await load("app/api/v1/auth/password/forgot/route.ts");
const reset = await load("app/api/v1/auth/password/reset/route.ts");
const change = await load("app/api/v1/auth/password/route.ts");
const cart = await load("app/api/v1/store/cart/route.ts");

const ORIGIN = "http://127.0.0.1:8787";
const created = new Set();
let ipCounter = 0;

async function call(handler, path, { expect = 200, method = "GET", body, cookie, ip } = {}) {
  const response = await handler(new Request(`${ORIGIN}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      Origin: ORIGIN,
      "X-Forwarded-For": ip ?? `10.0.0.${++ipCounter % 250}`,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  }));
  const payload = await response.json();
  assert.equal(response.status, expect, `${method} ${path} → ${response.status}: ${JSON.stringify(payload)}`);
  const setCookie = response.headers.get("set-cookie");
  return { payload, cookie: setCookie ? setCookie.split(";")[0] : null };
}

async function guest() {
  const { payload, cookie } = await call(session.POST, "/api/v1/auth/session", { method: "POST", body: { platform: "web" }, expect: 201 });
  created.add(payload.data.userId);
  return { userId: payload.data.userId, cookie };
}
const viewer = async (cookie) => (await call(session.GET, "/api/v1/auth/session", { cookie })).payload.data;

// Tashqi email xizmatini ushlaymiz: tiklash havolasi xatdan olinadi.
const outbox = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith("https://api.resend.com/")) {
    outbox.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ id: "test" }), { status: 200 });
  }
  return realFetch(url, init);
};
process.env.RESEND_API_KEY = "test";
process.env.MAIL_FROM = "Bir Ilm <noreply@birilm.uz>";
process.env.PUBLIC_URL = "https://birilm.uz";

const email = `test-${crypto.randomUUID().slice(0, 8)}@example.com`;
try {
  // --- Ro'yxatdan o'tish mehmon akkauntini saqlaydi -----------------------
  const g = await guest();
  const books = sqlite.prepare("SELECT id FROM books WHERE price > 0 LIMIT 1").get();
  if (books) await call(cart.PUT, "/api/v1/store/cart", { method: "PUT", cookie: g.cookie, body: { items: [{ bookId: books.id, qty: 1 }] } });
  await call(register.POST, "/api/v1/auth/register", { method: "POST", cookie: g.cookie, body: { name: "Aziza", email: "yaroqsiz", password: "12345678" }, expect: 422 });
  await call(register.POST, "/api/v1/auth/register", { method: "POST", cookie: g.cookie, body: { name: "Aziza", email, password: "qisqa" }, expect: 422 });
  const reg = await call(register.POST, "/api/v1/auth/register", { method: "POST", cookie: g.cookie, body: { name: "Aziza", email: email.toUpperCase(), password: "kitob-sevaman-1" }, expect: 201 });
  assert.equal(reg.payload.data.userId, g.userId, "Mehmon akkaunti saqlanishi kerak");
  assert.equal(reg.payload.data.token, null, "Web tokenni tanada olmaydi");
  assert.ok(reg.cookie && reg.cookie !== g.cookie, "Yangi sessiya cookie'si");
  const me = await viewer(reg.cookie);
  assert.equal(me.userId, g.userId);
  assert.equal(me.signedIn, true);
  assert.equal(me.hasPassword, true);
  assert.equal(me.name, "Aziza");
  assert.deepEqual(me.accounts, [{ provider: "email", label: email }]);
  if (books) assert.equal((await call(cart.GET, "/api/v1/store/cart", { cookie: reg.cookie })).payload.data.items.length, 1, "Savat saqlanadi");
  const stored = sqlite.prepare("SELECT hash FROM user_passwords WHERE user_id = ?").get(g.userId).hash;
  assert.match(stored, /^pbkdf2-sha256\$600000\$/);
  assert.ok(!stored.includes("kitob-sevaman-1"));
  const g2 = await guest();
  await call(register.POST, "/api/v1/auth/register", { method: "POST", cookie: g2.cookie, body: { name: "Boshqa", email, password: "boshqa-parol-1" }, expect: 409 });
  console.log("PASS: Ro'yxatdan o'tish: validatsiya, mehmon ma'lumoti saqlanadi, parol xeshlanadi, email takrorlanmaydi.");

  // --- Kirish ------------------------------------------------------------------
  const wrong = await call(login.POST, "/api/v1/auth/login", { method: "POST", body: { email, password: "noto'g'ri-parol" }, expect: 401 });
  const unknown = await call(login.POST, "/api/v1/auth/login", { method: "POST", body: { email: "yoq@example.com", password: "noto'g'ri-parol" }, expect: 401 });
  assert.equal(wrong.payload.error.message, unknown.payload.error.message, "Email bor-yo'qligi oshkor bo'lmasin");
  const ok = await call(login.POST, "/api/v1/auth/login", { method: "POST", cookie: g2.cookie, body: { email, password: "kitob-sevaman-1" } });
  assert.equal(ok.payload.data.userId, g.userId);
  assert.equal((await viewer(ok.cookie)).userId, g.userId, "Boshqa qurilmadan shu akkauntga kiradi");
  for (let i = 0; i < 10; i++) await call(login.POST, "/api/v1/auth/login", { method: "POST", ip: "10.9.9.9", body: { email: `brute${i}@example.com`, password: "x" }, expect: 401 });
  await call(login.POST, "/api/v1/auth/login", { method: "POST", ip: "10.9.9.9", body: { email, password: "kitob-sevaman-1" }, expect: 429 });
  console.log("PASS: Kirish: umumiy xato xabari, boshqa qurilmadan kirish, IP bo'yicha cheklov.");

  // --- Tiklash -------------------------------------------------------------
  const before = sqlite.prepare("SELECT count(*) AS n FROM user_sessions WHERE user_id = ?").get(g.userId).n;
  assert.ok(before >= 2);
  const none = await call(forgot.POST, "/api/v1/auth/password/forgot", { method: "POST", body: { email: "yoq@example.com" } });
  assert.deepEqual(none.payload.data, { sent: true });
  assert.equal(outbox.length, 0, "Yo'q emailga xat ketmaydi");
  await call(forgot.POST, "/api/v1/auth/password/forgot", { method: "POST", body: { email } });
  await call(forgot.POST, "/api/v1/auth/password/forgot", { method: "POST", body: { email } });
  assert.equal(outbox.length, 2);
  assert.deepEqual(outbox[1].to, [email]);
  const tokens = outbox.map((m) => /https:\/\/birilm\.uz\/\?reset=([a-f0-9]{64})/.exec(m.text)?.[1]);
  assert.ok(tokens.every(Boolean), "Havola PUBLIC_URL bilan");
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM password_resets WHERE token_hash = ?").get(tokens[1]).n, 0, "Bazada xom token yo'q");
  await call(reset.POST, "/api/v1/auth/password/reset", { method: "POST", body: { token: tokens[0], password: "yangi-parol-2026" }, expect: 400 }); // eski havola bekor
  const done = await call(reset.POST, "/api/v1/auth/password/reset", { method: "POST", body: { token: tokens[1], password: "yangi-parol-2026" } });
  assert.equal(done.payload.data.userId, g.userId);
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM user_sessions WHERE user_id = ?").get(g.userId).n, 1, "Eski sessiyalar yopiladi");
  assert.notEqual((await viewer(ok.cookie)).userId, g.userId, "Eski qurilma chiqarildi");
  await call(reset.POST, "/api/v1/auth/password/reset", { method: "POST", body: { token: tokens[1], password: "yana-boshqa-1" }, expect: 400 }); // bir martalik
  await call(login.POST, "/api/v1/auth/login", { method: "POST", body: { email, password: "kitob-sevaman-1" }, expect: 401 });
  const fresh = await call(login.POST, "/api/v1/auth/login", { method: "POST", body: { email, password: "yangi-parol-2026" } });
  await call(forgot.POST, "/api/v1/auth/password/forgot", { method: "POST", body: { email } }); // 3-urinish (chegara 3)
  await call(forgot.POST, "/api/v1/auth/password/forgot", { method: "POST", body: { email }, expect: 429 });
  console.log("PASS: Tiklash: javob bir xil, faqat oxirgi havola ishlaydi, bir martalik, sessiyalar yopiladi, email bo'yicha cheklov.");

  // --- O'zgartirish --------------------------------------------------------
  await call(change.PUT, "/api/v1/auth/password", { method: "PUT", cookie: g2.cookie, body: { current: "", password: "mehmon-parol-1" }, expect: 401 });
  await call(change.PUT, "/api/v1/auth/password", { method: "PUT", cookie: fresh.cookie, body: { current: "xato-parol", password: "uchinchi-parol-3" }, expect: 400 });
  await call(change.PUT, "/api/v1/auth/password", { method: "PUT", cookie: fresh.cookie, body: { current: "yangi-parol-2026", password: "uchinchi-parol-3" } });
  await call(login.POST, "/api/v1/auth/login", { method: "POST", body: { email, password: "uchinchi-parol-3" } });
  console.log("PASS: Parolni o'zgartirish: faqat kirgan, joriy parol bilan.");

  console.log("\nHAMMASI O'TDI: email + parol.");
} finally {
  globalThis.fetch = realFetch;
  const ids = [...created];
  if (ids.length) {
    const ph = ids.map(() => "?").join(",");
    for (const table of ["store_cart_items", "user_sessions", "password_resets", "user_passwords", "auth_accounts"]) {
      sqlite.prepare(`DELETE FROM ${table} WHERE user_id IN (${ph})`).run(...ids);
    }
    sqlite.prepare(`DELETE FROM users WHERE id IN (${ph})`).run(...ids);
  }
  console.log(`Tozalandi: ${ids.length} ta foydalanuvchi.`);
}
