/**
 * Ikki bosqichli himoya va profil rasmlari testlari.
 * Ishga tushirish: `node tests/two-factor-v1.mjs`
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
const verify = await load("app/api/v1/auth/two-factor/verify/route.ts");
const twoFactor = await load("app/api/v1/auth/two-factor/route.ts");
const profileImage = await load("app/api/v1/profile/image/route.ts");
const profileFile = await load("app/media/profile/[file]/route.ts");

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


const realFetch = globalThis.fetch;
const suffix = Math.random().toString(36).slice(2, 8);
const email = `tf-${suffix}@example.com`;
const PASSWORD = "kitob-sevaman-1";
const CODE = "maxfiy-kod-77";
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

try {
  const g = await guest();
  const reg = await call(register.POST, "/api/v1/auth/register", { method: "POST", cookie: g.cookie, body: { name: "Sinov", email, password: PASSWORD }, expect: 201 });
  const me = reg.cookie;
  assert.equal((await viewer(me)).twoFactor, false);

  // Kod yo'q: login to'g'ridan-to'g'ri sessiya beradi.
  const plain = await call(login.POST, "/api/v1/auth/login", { method: "POST", body: { email, password: PASSWORD } });
  assert.ok(plain.payload.data.userId);

  // Mehmon kod qo'ya olmaydi; qisqa kod rad etiladi.
  const g0 = await guest();
  await call(twoFactor.PUT, "/api/v1/auth/two-factor", { method: "PUT", cookie: g0.cookie, body: { code: CODE }, expect: 401 });
  await call(twoFactor.PUT, "/api/v1/auth/two-factor", { method: "PUT", cookie: me, body: { code: "123" }, expect: 422 });
  await call(twoFactor.PUT, "/api/v1/auth/two-factor", { method: "PUT", cookie: me, body: { code: CODE } });
  assert.equal((await viewer(me)).twoFactor, true);
  const stored = sqlite.prepare("SELECT hash FROM user_security_codes WHERE user_id = ?").get(reg.payload.data.userId);
  assert.ok(stored.hash.startsWith("pbkdf2-sha256$") && !stored.hash.includes(CODE), "Kod faqat xesh ko'rinishida");
  console.log("PASS: Kod qo'yish: faqat kirgan hisob, uzunlik tekshiruvi, xesh saqlanadi.");

  // Endi parol yetarli emas.
  const pending = (await call(login.POST, "/api/v1/auth/login", { method: "POST", body: { email, password: PASSWORD } })).payload.data;
  assert.equal(pending.twoFactor, true);
  assert.ok(!("userId" in pending) && !("token" in pending), "Sessiya hali ochilmaydi");
  await call(verify.POST, "/api/v1/auth/two-factor/verify", { method: "POST", body: { code: "xato-kod-00", challenge: pending.challenge }, expect: 401 });
  await call(verify.POST, "/api/v1/auth/two-factor/verify", { method: "POST", body: { code: CODE, challenge: "0".repeat(64) }, expect: 400 });
  const ok = await call(verify.POST, "/api/v1/auth/two-factor/verify", { method: "POST", body: { code: CODE, challenge: pending.challenge } });
  assert.equal(ok.payload.data.userId, reg.payload.data.userId);
  assert.equal((await viewer(ok.cookie)).userId, reg.payload.data.userId, "Kod bilan sessiya ochildi");
  await call(verify.POST, "/api/v1/auth/two-factor/verify", { method: "POST", body: { code: CODE, challenge: pending.challenge }, expect: 400 }); // bir martalik
  console.log("PASS: Kirish: parol → kod → sessiya; challenge bir martalik, xato kod rad etiladi.");

  // Cookie orqali (Google/Telegram qaytishi).
  const p2 = (await call(login.POST, "/api/v1/auth/login", { method: "POST", body: { email, password: PASSWORD } })).payload.data;
  const viaCookie = await call(verify.POST, "/api/v1/auth/two-factor/verify", { method: "POST", body: { code: CODE }, cookie: `bir_2fa=${p2.challenge}` });
  assert.equal(viaCookie.payload.data.userId, reg.payload.data.userId);

  // 5 ta xato urinishdan keyin challenge o'ladi.
  const p3 = (await call(login.POST, "/api/v1/auth/login", { method: "POST", body: { email, password: PASSWORD } })).payload.data;
  for (let i = 0; i < 5; i++) await call(verify.POST, "/api/v1/auth/two-factor/verify", { method: "POST", body: { code: `xato-kod-${i}${i}`, challenge: p3.challenge }, expect: 401 });
  await call(verify.POST, "/api/v1/auth/two-factor/verify", { method: "POST", body: { code: CODE, challenge: p3.challenge }, expect: 429 });
  console.log("PASS: Cookie orqali tasdiqlash; 5 xato urinishdan keyin challenge yopiladi.");

  // Almashtirish / o'chirish joriy kodni talab qiladi.
  await call(twoFactor.PUT, "/api/v1/auth/two-factor", { method: "PUT", cookie: me, body: { code: "yangi-kod-88", current: "xato" }, expect: 400 });
  await call(twoFactor.PUT, "/api/v1/auth/two-factor", { method: "PUT", cookie: me, body: { code: "yangi-kod-88", current: CODE } });
  await call(twoFactor.DELETE, "/api/v1/auth/two-factor", { method: "DELETE", cookie: me, body: { current: CODE }, expect: 400 });
  await call(twoFactor.DELETE, "/api/v1/auth/two-factor", { method: "DELETE", cookie: me, body: { current: "yangi-kod-88" } });
  assert.equal((await viewer(me)).twoFactor, false);
  assert.ok((await call(login.POST, "/api/v1/auth/login", { method: "POST", body: { email, password: PASSWORD } })).payload.data.userId);
  console.log("PASS: Kodni almashtirish va o'chirish joriy kodni talab qiladi; o'chirgach login oddiy.");

  // --- Profil rasmlari -----------------------------------------------------
  const upload = async (kind, cookie, type, bytes, expect = 201) => {
    const response = await profileImage.POST(new Request(`${ORIGIN}/api/v1/profile/image?kind=${kind}`, {
      method: "POST",
      headers: { "Content-Type": type, Origin: ORIGIN, "X-Forwarded-For": "10.1.1.1", Cookie: cookie },
      body: bytes,
    }));
    const payload = await response.json();
    assert.equal(response.status, expect, JSON.stringify(payload));
    return payload.data?.url;
  };
  await upload("avatar", g0.cookie, "image/png", PNG, 401);
  await upload("avatar", me, "image/gif", PNG, 400);
  await upload("avatar", me, "image/png", Uint8Array.from([1, 2, 3, 4]), 400);
  const avatarUrl = await upload("avatar", me, "image/png", PNG);
  const coverUrl = await upload("cover", me, "image/png", PNG);
  const v = await viewer(me);
  assert.equal(v.avatarUrl, avatarUrl);
  assert.equal(v.coverUrl, coverUrl);
  const served = await profileFile.GET(new Request(`${ORIGIN}${avatarUrl}`), { params: Promise.resolve({ file: avatarUrl.split("/").pop() }) });
  assert.equal(served.status, 200);
  assert.equal(served.headers.get("content-type"), "image/png");
  const notFound = await profileFile.GET(new Request(`${ORIGIN}/media/profile/..%2F..%2Fetc`), { params: Promise.resolve({ file: "../../etc/passwd" }) });
  assert.equal(notFound.status, 404);
  const second = await upload("avatar", me, "image/png", PNG);
  assert.notEqual(second, avatarUrl);
  const gone = await profileFile.GET(new Request(`${ORIGIN}${avatarUrl}`), { params: Promise.resolve({ file: avatarUrl.split("/").pop() }) });
  assert.equal(gone.status, 404, "Eski avatar fayli o'chirildi");
  await call(profileImage.DELETE, "/api/v1/profile/image?kind=cover", { method: "DELETE", cookie: me });
  assert.equal((await viewer(me)).coverUrl, null);
  console.log("PASS: Profil rasmlari: tur/imzo tekshiruvi, yuklash, ko'rsatish, almashtirganda eskisi o'chadi, orqa fonni olib tashlash.");

  console.log("\nHAMMASI O'TDI: ikki bosqichli himoya va profil rasmlari.");
} finally {
  globalThis.fetch = realFetch;
  const ids = [...created];
  if (ids.length) {
    const ph = ids.map(() => "?").join(",");
    for (const table of ["user_security_codes", "login_challenges", "user_sessions", "password_resets", "user_passwords", "auth_accounts"]) {
      sqlite.prepare(`DELETE FROM ${table} WHERE user_id IN (${ph})`).run(...ids);
    }
    sqlite.prepare(`DELETE FROM users WHERE id IN (${ph})`).run(...ids);
  }
  console.log(`Tozalandi: ${ids.length} ta foydalanuvchi.`);
}
