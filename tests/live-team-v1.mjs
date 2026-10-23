/**
 * Jonli suhbatni ochish: admin va moderator, kimlar uchun (hamma / faqat jamoa), boshlash huquqi.
 * Route funksiyalari to'g'ridan-to'g'ri chaqiriladi (server shart emas).
 * Ishga tushirish: `node tests/live-team-v1.mjs`
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
const load = (p) => import(new URL(p, projectRoot).href);
const session = await load("app/api/v1/auth/session/route.ts");
const books = await load("app/api/v1/books/route.ts");
const live = await load("app/api/v1/live/route.ts");
const liveOne = await load("app/api/v1/live/[id]/route.ts");
const liveStart = await load("app/api/v1/live/[id]/start/route.ts");
const { canHostLiveSession, liveSessionVisibleTo } = await load("server/services/live.ts");
const { saturdayOnOrAfter, saturdaySessionAt } = await load("shared/journey.ts");

const ORIGIN = "http://127.0.0.1:8787";
const createdUsers = [];
const createdTalks = [];
const createdBooks = [];
const journeyBefore = sqlite.prepare("SELECT * FROM journey_books").all();

async function client() {
  const response = await session.POST(new Request(`${ORIGIN}/api/v1/auth/session`, { method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN }, body: JSON.stringify({ platform: "web", wantToken: false }) }));
  const payload = await response.json();
  const cookie = response.headers.get("set-cookie").split(";")[0];
  createdUsers.push(payload.data.userId);
  const send = async (handler, path, { params, expect = 200, method = "GET", body } = {}) => {
    const headers = { Cookie: cookie, Origin: ORIGIN };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await handler(new Request(`${ORIGIN}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), params ? { params: Promise.resolve(params) } : undefined);
    const payload = await res.json();
    assert.equal(res.status, expect, `${method} ${path} → ${res.status}: ${JSON.stringify(payload)}`);
    return payload;
  };
  return { userId: payload.data.userId, call: send };
}
const setRole = (userId, role) => sqlite.prepare("INSERT INTO users (id, role) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET role = excluded.role").run(userId, role);

try {
  const admin = await client();
  const moderator = await client();
  const otherModerator = await client();
  const user = await client();
  setRole(admin.userId, "admin");
  setRole(moderator.userId, "moderator");
  setRole(otherModerator.userId, "moderator");
  setRole(user.userId, "user");

  const soon = new Date(Date.now() + 3_600_000).toISOString();
  const tag = crypto.randomUUID().slice(0, 8);
  const body = (extra = {}) => ({ bookTitle: `Mavzu ${tag}`, title: "Erkin suhbat", scheduledAt: soon, ...extra });
  const create = async (who, payload, expect = 201) => {
    const result = await who.call(live.POST, "/api/v1/live", { method: "POST", body: payload, expect });
    if (expect === 201) createdTalks.push(result.data.id);
    return result.data;
  };
  const list = async (who) => (await who.call(live.GET, "/api/v1/live")).data;

  // --- Kim ochadi ----------------------------------------------------------------
  await create(user, body(), 403);
  const open = await create(moderator, body());
  assert.equal(open.audience, "public", "Standart — hamma uchun");
  assert.equal(open.moderatorId, moderator.userId);
  console.log("PASS: Suhbatni admin va moderator ochadi, oddiy foydalanuvchi — yo'q; standart — hamma uchun.");

  // --- Jamoa suhbati ---------------------------------------------------------------
  const announcement = { title: "Yangi suhbat", body: "Qo'shiling" };
  const announced = await create(admin, body({ title: "E'longa", announcement }));
  assert.equal(announced.audience, "public", "E'lon bilan ochilgan suhbat — hamma uchun");
  await create(moderator, body({ title: "Moderator e'loni", announcement }), 403);
  await create(admin, body({ audience: "team", announcement }), 422);
  await create(admin, body({ audience: "boshqa" }), 422);
  const team = await create(moderator, body({ title: "Jamoa yig'ilishi", audience: "team" }));
  assert.equal(team.audience, "team");

  const publicIds = (await list(user)).map((talk) => talk.id);
  assert.ok(publicIds.includes(open.id) && publicIds.includes(announced.id), "Hamma uchun suhbatlar ro'yxatda");
  assert.ok(!publicIds.includes(team.id), "Jamoa suhbati oddiy foydalanuvchiga ko'rinmaydi");
  for (const staff of [admin, moderator, otherModerator]) assert.ok((await list(staff)).some((talk) => talk.id === team.id), "Admin va moderator jamoa suhbatini ko'radi");
  await user.call(liveOne.GET, `/api/v1/live/${team.id}`, { params: { id: team.id }, expect: 404 });
  assert.equal((await moderator.call(liveOne.GET, `/api/v1/live/${team.id}`, { params: { id: team.id } })).data.session.audience, "team");
  assert.equal((await user.call(liveOne.GET, `/api/v1/live/${open.id}`, { params: { id: open.id } })).data.session.id, open.id);
  assert.deepEqual([liveSessionVisibleTo({ audience: "team" }, false), liveSessionVisibleTo({ audience: "team" }, true), liveSessionVisibleTo({ audience: "public" }, false)], [false, true, true]);
  console.log("PASS: Jamoa suhbati faqat admin va moderatorga ko'rinadi (ro'yxatda ham, alohida ham); e'lonni faqat admin joylaydi, jamoa suhbati e'lon qilinmaydi.");

  // --- Kim boshlaydi -----------------------------------------------------------------
  const startPath = (talk) => `/api/v1/live/${talk.id}/start`;
  await user.call(liveStart.POST, startPath(team), { method: "POST", params: { id: team.id }, expect: 403 });
  await otherModerator.call(liveStart.POST, startPath(team), { method: "POST", params: { id: team.id }, expect: 403 });
  assert.equal((await moderator.call(liveStart.POST, startPath(team), { method: "POST", params: { id: team.id } })).data.status, "live", "Suhbatni ochgan moderator boshlaydi");
  assert.equal((await admin.call(liveStart.POST, startPath(open), { method: "POST", params: { id: open.id } })).data.status, "live", "Admin har qanday suhbatni boshlaydi");
  assert.deepEqual([canHostLiveSession("admin", { moderatorId: "x" }, "y"), canHostLiveSession("moderator", { moderatorId: "y" }, "y"), canHostLiveSession("moderator", { moderatorId: "x" }, "y"), canHostLiveSession("user", { moderatorId: "y" }, "y")], [true, true, false, false]);
  console.log("PASS: Suhbatni admin yoki uni ochgan moderator boshlaydi; boshqa moderator va foydalanuvchi — yo'q.");

  // --- «Bir Ilm yo'li» va hafta kitobi faqat hamma uchun suhbatlarni hisobga oladi ---------
  const title = `Yo'l ${tag}`;
  const book = (await admin.call(books.POST, "/api/v1/books", { method: "POST", body: { title, author: "Muallif" }, expect: 201 })).data;
  createdBooks.push(book.id);
  const saturday = saturdayOnOrAfter(Date.now() + 7 * 86_400_000);
  const at = new Date(saturdaySessionAt(saturday)).toISOString();
  await create(admin, { bookTitle: title, title: "Jamoa", scheduledAt: at, audience: "team" });
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM journey_books WHERE book_id = ?").get(book.id).n, 0, "Jamoa suhbati yo'l ro'yxatiga yozilmaydi");
  await create(admin, { bookTitle: title, title: "Hamma", scheduledAt: at });
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM journey_books WHERE book_id = ?").get(book.id).n, 1, "Hamma uchun suhbat yoziladi");
  console.log("PASS: Jamoa suhbati «Bir Ilm yo'li» ro'yxatiga yozilmaydi.");

  console.log("\nHAMMASI O'TDI: suhbatni ochish va jamoa suhbati.");
} finally {
  if (createdTalks.length) sqlite.prepare(`DELETE FROM live_sessions WHERE id IN (${createdTalks.map(() => "?").join(",")})`).run(...createdTalks);
  sqlite.prepare("DELETE FROM journey_books").run();
  const restore = sqlite.prepare("INSERT INTO journey_books (number, discussed_on, title, author, book_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
  for (const row of journeyBefore) restore.run(row.number, row.discussed_on, row.title, row.author, row.book_id, row.created_at, row.updated_at);
  if (createdBooks.length) sqlite.prepare(`DELETE FROM books WHERE id IN (${createdBooks.map(() => "?").join(",")})`).run(...createdBooks);
  const unique = [...new Set(createdUsers)];
  if (unique.length) {
    sqlite.prepare(`DELETE FROM reading_posts WHERE user_id IN (${unique.map(() => "?").join(",")})`).run(...unique);
    sqlite.prepare(`DELETE FROM users WHERE id IN (${unique.map(() => "?").join(",")})`).run(...unique);
  }
}
