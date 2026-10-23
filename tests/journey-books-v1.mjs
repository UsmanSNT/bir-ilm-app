/**
 * «Bir Ilm yo'li» kitoblar ro'yxati va hafta kitobining muddati.
 * Route funksiyalari to'g'ridan-to'g'ri chaqiriladi (server shart emas). Sanalar bugungi kunga nisbatan olinadi.
 * Ishga tushirish: `node --experimental-strip-types tests/journey-books-v1.mjs`
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
const book = await load("app/api/v1/books/[id]/route.ts");
const live = await load("app/api/v1/live/route.ts");
const talk = await load("app/api/v1/live/[id]/route.ts");
const start = await load("app/api/v1/live/[id]/start/route.ts");
const journey = await load("app/api/v1/site/journey/route.ts");
const { DEFAULT_ABOUT } = await load("shared/contract/index.ts");
const { saturdayOnOrAfter, saturdaySessionAt, sessionNumberOf } = await load("shared/journey.ts");

const ORIGIN = "http://127.0.0.1:8787";
const DAY = 86_400_000;
const createdUsers = [];
const createdTalks = [];
const createdBooks = [];
const aboutBefore = sqlite.prepare("SELECT value FROM site_settings WHERE key = 'about'").get();
const journeyBefore = sqlite.prepare("SELECT * FROM journey_books").all();
const activeBefore = sqlite.prepare("SELECT id, active_since FROM books WHERE kind = 'library' AND active = 1").all();

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

const at = (saturday) => new Date(saturdaySessionAt(saturday)).toISOString();
const plusWeek = (saturday) => new Date(Date.parse(`${saturday}T00:00:00Z`) + 7 * DAY).toISOString().slice(0, 10);

try {
  // Tayanch nuqta standart: 248-kitob — 2026-10-24.
  sqlite.prepare("DELETE FROM site_settings WHERE key = 'about'").run();
  const anchor = DEFAULT_ABOUT.anchor;
  const admin = await client();
  const user = await client();
  sqlite.prepare("INSERT INTO users (id, role) VALUES (?, 'admin') ON CONFLICT(id) DO UPDATE SET role = 'admin'").run(admin.userId);

  const title = `Sinov yo‘li ${crypto.randomUUID().slice(0, 8)}`;
  const created = (await admin.call(books.POST, "/api/v1/books", { method: "POST", body: { title, author: "Sinov Muallif" }, expect: 201 })).data;
  createdBooks.push(created.id);
  const id = created.id;
  await admin.call(book.PATCH, `/api/v1/books/${id}`, { method: "PATCH", params: { id }, body: { active: true } });
  const ours = () => sqlite.prepare("SELECT number, discussed_on AS discussedOn FROM journey_books WHERE book_id = ? ORDER BY number").all(id).map((r) => ({ ...r }));
  const weekBook = async (who = user) => (await who.call(books.GET, "/api/v1/books")).data;

  // --- Suhbat vaqti belgilanmagan kitob muddatsiz turadi --------------------------
  assert.equal((await weekBook()).activeBookId, id);
  assert.deepEqual(ours(), []);
  console.log("PASS: Suhbat vaqti belgilanmagan hafta kitobi e'londa turadi, ro'yxatga yozilmaydi.");

  // --- Suhbat belgilanganda kitob nomi va shanbasi ro'yxatga yoziladi --------------
  const next = saturdayOnOrAfter(Date.now() + 7 * DAY);
  await user.call(live.POST, "/api/v1/live", { method: "POST", body: { bookTitle: title, title: "Sinov", scheduledAt: at(next) }, expect: 403 });
  const created_talk = (await admin.call(live.POST, "/api/v1/live", { method: "POST", body: { bookTitle: `  ${title.toUpperCase()} `, title: "Sinov suhbati", scheduledAt: at(next) }, expect: 201 })).data;
  createdTalks.push(created_talk.id);
  const talkId = created_talk.id;
  assert.deepEqual(ours(), [{ number: sessionNumberOf(anchor, next), discussedOn: next }], "Nom katta-kichik harf va bo'shliqdan qat'i nazar kitobga bog'lanadi");
  const listed = (await user.call(journey.GET, "/api/v1/site/journey")).data.items;
  const entry = listed.find((item) => item.bookId === id);
  assert.deepEqual(entry, { number: sessionNumberOf(anchor, next), discussedOn: next, title, author: "Sinov Muallif", bookId: id }, "Ro'yxatda kutubxonadagi nom");
  assert.deepEqual(listed.map((item) => item.number), [...listed.map((item) => item.number)].sort((a, b) => a - b), "Tartib raqami bo'yicha");
  assert.equal((await weekBook()).activeBookId, id);
  console.log("PASS: Suhbat belgilanganda kitob nomi va shanbasi «Bir Ilm yo'li» ro'yxatiga yoziladi (tartib raqami bilan).");

  // --- Boshqa haftaga ko'chirilsa, eski (hali o'tmagan) yozuv o'chadi -----------
  const later = plusWeek(next);
  await admin.call(talk.PATCH, `/api/v1/live/${talkId}`, { method: "PATCH", params: { id: talkId }, body: { scheduledAt: at(later) } });
  assert.deepEqual(ours(), [{ number: sessionNumberOf(anchor, later), discussedOn: later }]);
  // Shanba kuni kechroq (Toshkentda o'sha kun) — o'sha shanba; yarim tundan keyin — keyingi shanba.
  await admin.call(talk.PATCH, `/api/v1/live/${talkId}`, { method: "PATCH", params: { id: talkId }, body: { scheduledAt: new Date(saturdaySessionAt(later) + 5 * 3_600_000).toISOString() } });
  assert.deepEqual(ours(), [{ number: sessionNumberOf(anchor, later), discussedOn: later }]);
  await admin.call(talk.PATCH, `/api/v1/live/${talkId}`, { method: "PATCH", params: { id: talkId }, body: { scheduledAt: new Date(saturdaySessionAt(later) + 7 * 3_600_000).toISOString() } });
  assert.deepEqual(ours(), [{ number: sessionNumberOf(anchor, plusWeek(later)), discussedOn: plusWeek(later) }]);
  console.log("PASS: Suhbat boshqa haftaga ko'chirilsa, ro'yxatda faqat yangi shanba qoladi.");

  // --- Shanba 22:00 (Seul) o'tgach e'lon tushadi ----------------------------------
  const past = saturdayOnOrAfter(Date.now() - 14 * DAY);
  await admin.call(talk.PATCH, `/api/v1/live/${talkId}`, { method: "PATCH", params: { id: talkId }, body: { scheduledAt: at(past) } });
  assert.deepEqual(ours(), [{ number: sessionNumberOf(anchor, past), discussedOn: past }], "O'tgan suhbat ham ro'yxatda qoladi, kelajakdagisi o'chadi");
  // Kitob o'sha haftadan oldin tanlangan.
  sqlite.prepare("UPDATE books SET active_since = ? WHERE id = ?").run(new Date(saturdaySessionAt(past) - 3 * DAY).toISOString(), id);
  for (const who of [user, admin]) {
    const expired = await weekBook(who);
    assert.equal(expired.activeBookId, null, "Hafta tugadi — e'lon yo'q (hamma uchun)");
    assert.equal(expired.items.find((b) => b.id === id).active, false);
  }
  console.log("PASS: Muhokama shanbasi soat 22:00 (Seul) o'tgach hafta kitobi e'londan tushadi.");

  // --- Suhbat jonli bo'lsa, tugaguncha qoladi -----------------------------------
  await admin.call(start.POST, `/api/v1/live/${talkId}/start`, { method: "POST", params: { id: talkId } });
  assert.equal((await weekBook()).activeBookId, id, "Jonli suhbat paytida kitob turadi");
  sqlite.prepare("UPDATE live_sessions SET status = 'ended', ended_at = ? WHERE id = ?").run(new Date().toISOString(), talkId);
  assert.equal((await weekBook()).activeBookId, null, "Suhbat tugagach tushadi");
  // O'sha kuni kechroqqa surilgan (hali boshlanmagan) suhbat ham kitobni ushlab turadi.
  const soon = (await admin.call(live.POST, "/api/v1/live", { method: "POST", body: { bookTitle: title, title: "Kechroq", scheduledAt: new Date(Date.now() + 3_600_000).toISOString() }, expect: 201 })).data;
  createdTalks.push(soon.id);
  // Ro'yxatda faqat o'tgan shanba qolsin: kitobni endi faqat kelayotgan suhbat ushlab turadi.
  sqlite.prepare("DELETE FROM journey_books WHERE book_id = ? AND discussed_on <> ?").run(id, past);
  assert.equal((await weekBook()).activeBookId, id, "Kelayotgan suhbat bor — kitob turadi");
  sqlite.prepare("UPDATE live_sessions SET scheduled_at = ? WHERE id = ?").run(new Date(Date.now() - 60_000).toISOString(), soon.id);
  assert.equal((await weekBook()).activeBookId, null, "Vaqti o'tgan, boshlanmagan suhbat ushlab turmaydi");
  sqlite.prepare("DELETE FROM live_sessions WHERE id = ?").run(soon.id);
  console.log("PASS: Suhbat jonli yoki hali oldinda bo'lsa, kitob e'londa qoladi; tugagach tushadi.");

  // --- Hafta tugagach qayta tanlansa, yangi suhbat vaqtigacha turadi ------------
  await user.call(book.PATCH, `/api/v1/books/${id}`, { method: "PATCH", params: { id }, body: { active: true }, expect: 403 });
  await admin.call(book.PATCH, `/api/v1/books/${id}`, { method: "PATCH", params: { id }, body: { active: true } });
  assert.equal((await weekBook()).activeBookId, id);
  assert.deepEqual(ours(), [{ number: sessionNumberOf(anchor, past), discussedOn: past }], "Tarix o'zgarmaydi");
  const since = sqlite.prepare("SELECT active_since FROM books WHERE id = ?").get(id).active_since;
  await admin.call(book.PATCH, `/api/v1/books/${id}`, { method: "PATCH", params: { id }, body: { active: true, summary: "Tahrir" } });
  assert.equal(sqlite.prepare("SELECT active_since FROM books WHERE id = ?").get(id).active_since, since, "E'londagi kitobni tahrirlash muddatni yangilamaydi");
  console.log("PASS: Hafta tugagan kitob qayta tanlansa, yangi suhbat vaqti belgilanguncha e'londa turadi.");

  // --- Kutubxonada yo'q mavzu ro'yxatga tushmaydi -------------------------------
  const before = sqlite.prepare("SELECT count(*) AS n FROM journey_books").get().n;
  const other = (await admin.call(live.POST, "/api/v1/live", { method: "POST", body: { bookTitle: `Mavzu ${crypto.randomUUID()}`, title: "Mavzu", scheduledAt: at(plusWeek(plusWeek(next))) }, expect: 201 })).data;
  createdTalks.push(other.id);
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM journey_books").get().n, before);
  console.log("PASS: Kutubxonada yo'q mavzudagi suhbat ro'yxatga yozilmaydi.");

  console.log("\nHAMMASI O'TDI: «Bir Ilm yo'li» ro'yxati va hafta kitobi muddati.");
} finally {
  if (createdTalks.length) sqlite.prepare(`DELETE FROM live_sessions WHERE id IN (${createdTalks.map(() => "?").join(",")})`).run(...createdTalks);
  sqlite.prepare("DELETE FROM journey_books").run();
  const restore = sqlite.prepare("INSERT INTO journey_books (number, discussed_on, title, author, book_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
  for (const row of journeyBefore) restore.run(row.number, row.discussed_on, row.title, row.author, row.book_id, row.created_at, row.updated_at);
  if (createdBooks.length) sqlite.prepare(`DELETE FROM books WHERE id IN (${createdBooks.map(() => "?").join(",")})`).run(...createdBooks);
  for (const row of activeBefore) sqlite.prepare("UPDATE books SET active = 1, active_since = ? WHERE id = ?").run(row.active_since, row.id);
  if (aboutBefore) sqlite.prepare("INSERT INTO site_settings (key, value) VALUES ('about', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(aboutBefore.value);
  else sqlite.prepare("DELETE FROM site_settings WHERE key = 'about'").run();
  const unique = [...new Set(createdUsers)];
  if (unique.length) sqlite.prepare(`DELETE FROM users WHERE id IN (${unique.map(() => "?").join(",")})`).run(...unique);
}
