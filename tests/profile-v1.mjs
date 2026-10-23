/** Shaxsiy ma'lumotlar: tahallus (yagona, band so'zlar), tug'ilgan sana, jins, kasb; maxfiy maydonlar faqat egasiga. `node tests/profile-v1.mjs` */
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
const profile = await load("app/api/v1/profile/route.ts");

const ORIGIN = "http://127.0.0.1:8787";
const created = [];

async function call(handler, path, { expect = 200, method = "GET", body, cookie } = {}) {
  const response = await handler(new Request(`${ORIGIN}${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), Origin: ORIGIN, ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }));
  const payload = await response.json();
  assert.equal(response.status, expect, `${method} ${path} → ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}

async function member(name, { signedIn = true } = {}) {
  const response = await session.POST(new Request(`${ORIGIN}/api/v1/auth/session`, { method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN }, body: JSON.stringify({ platform: "web" }) }));
  const { data } = await response.json();
  created.push(data.userId);
  sqlite.prepare("INSERT OR IGNORE INTO users (id, name) VALUES (?, ?)").run(data.userId, name);
  if (signedIn) sqlite.prepare("INSERT OR IGNORE INTO auth_accounts (provider, subject, user_id, display_name) VALUES ('google', ?, ?, ?)").run(`profile-${data.userId}`, data.userId, name);
  return { userId: data.userId, cookie: response.headers.get("set-cookie").split(";")[0] };
}

const patch = (who, body, expect = 200) => call(profile.PATCH, "/api/v1/profile", { method: "PATCH", cookie: who.cookie, body, expect });
const viewerOf = async (who) => (await call(session.GET, "/api/v1/auth/session", { cookie: who.cookie })).data;

try {
  const ali = await member("Ali");
  const vali = await member("Vali");
  const guest = await member("Mehmon", { signedIn: false });

  // ── Tahallus ──
  await patch(ali, { username: "  @Ali_99 " });
  assert.equal((await viewerOf(ali)).username, "ali_99", "@, bo'shliq va katta harf olib tashlanadi");
  let error = await patch(vali, { username: "ALI_99" }, 422);
  assert.match(error.error.fields.username[0], /band/);
  for (const bad of ["ab", ".ali", "ali.", "a..li", "ali vali", "aliй", "x".repeat(25)]) await patch(vali, { username: bad }, 422);
  error = await patch(vali, { username: "Admin" }, 422);
  assert.match(error.error.fields.username[0], /tanlab bo'lmaydi/);
  await patch(guest, { username: "mehmon_1" }, 401);
  await patch(ali, { username: "ali_99" });
  assert.equal((await viewerOf(ali)).username, "ali_99", "O'z tahallusini qayta saqlash — band emas");
  await patch(ali, { username: null });
  assert.equal((await viewerOf(ali)).username, null);
  await patch(vali, { username: "ali_99" });
  assert.equal((await viewerOf(vali)).username, "ali_99", "Bo'shatilgan tahallusni boshqasi oladi");
  console.log("PASS: Tahallus: normallashtiriladi, yagona, band so'zlar va noto'g'ri shakl rad etiladi, mehmonga yo'q, olib tashlansa bo'shaydi.");

  // ── Tug'ilgan sana, jins, kasb ──
  const future = `${new Date().getUTCFullYear() + 1}-01-01`;
  for (const bad of [future, "1999-02-30", "1899-12-31", "14.07.1999", "1999-7-14"]) await patch(ali, { birthDate: bad }, 422);
  await patch(ali, { gender: "boshqa" }, 422);
  await patch(ali, { profession: "x".repeat(61) }, 422);
  await patch(ali, { birthDate: "1999-07-14", gender: "male", profession: "  IT mutaxassisi " });
  let me = await viewerOf(ali);
  assert.deepEqual([me.birthDate, me.gender, me.profession], ["1999-07-14", "male", "IT mutaxassisi"]);
  assert.match(me.joinedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);

  // Faqat yuborilgan maydon o'zgaradi.
  await patch(ali, { bio: "Kitobxon" });
  me = await viewerOf(ali);
  assert.deepEqual([me.bio, me.birthDate, me.gender, me.profession], ["Kitobxon", "1999-07-14", "male", "IT mutaxassisi"]);
  await patch(ali, { birthDate: null, gender: null });
  me = await viewerOf(ali);
  assert.deepEqual([me.birthDate, me.gender], [null, null]);
  console.log("PASS: Tug'ilgan sana (haqiqiy kun, 1900+, kelajak emas), jins, kasb: saqlanadi, qisman yangilanadi, null bilan tozalanadi.");

  // ── Maxfiylik: boshqa kitobxon tug'ilgan sana va jinsni ko'rmaydi ──
  await patch(ali, { birthDate: "1999-07-14", gender: "male" });
  const seen = (await call(profile.GET, `/api/v1/profile?userId=${ali.userId}`, { cookie: vali.cookie })).data;
  assert.equal(seen.name, "Ali");
  assert.equal("birthDate" in seen, false);
  assert.equal("gender" in seen, false);
  console.log("PASS: Maxfiylik: tug'ilgan sana va jins boshqalarga qaytarilmaydi.");

  console.log("\nHAMMASI O'TDI: shaxsiy ma'lumotlar.");
} finally {
  if (created.length) {
    const ph = created.map(() => "?").join(",");
    sqlite.prepare(`DELETE FROM user_sessions WHERE user_id IN (${ph})`).run(...created);
    sqlite.prepare(`DELETE FROM auth_accounts WHERE user_id IN (${ph})`).run(...created);
    sqlite.prepare(`DELETE FROM users WHERE id IN (${ph})`).run(...created);
  }
}
