/**
 * Elektron kitob xatcho'p va belgilari: har bir foydalanuvchi faqat o'zinikini ko'radi, validatsiya,
 * chegara va kitob o'chsa birga o'chish. Ishga tushirish: `node tests/ebook-marks-v1.mjs`
 */
import assert from "node:assert/strict";
import { statSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

const projectRoot = new URL("../", import.meta.url);
const d1Module = new URL("scripts/local-d1.mjs", projectRoot).href;

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
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "cloudflare:workers") return { url: d1Module, shortCircuit: true };
    if (specifier.startsWith("@/")) return next(withExtension(new URL(specifier.slice(2), projectRoot).href), context);
    if (specifier.startsWith(".") && /\.tsx?$/.test(context.parentURL ?? "")) return next(withExtension(new URL(specifier, context.parentURL).href), context);
    return next(specifier, context);
  },
});

const { sqlite } = await import(d1Module);
const load = (path) => import(new URL(path, projectRoot).href);
const session = await load("app/api/v1/auth/session/route.ts");
const booksRoute = await load("app/api/v1/books/route.ts");
const bookRoute = await load("app/api/v1/books/[id]/route.ts");
const ebookRoute = await load("app/api/v1/books/[id]/ebook/route.ts");
const marksRoute = await load("app/api/v1/books/[id]/marks/route.ts");
const markRoute = await load("app/api/v1/books/[id]/marks/[mid]/route.ts");

const ORIGIN = "http://127.0.0.1:8787";
const createdUsers = [];
const createdBooks = [];

async function call(handler, path, { params, expect = 200, method = "GET", body, cookie } = {}) {
  const response = await handler(
    new Request(`${ORIGIN}${path}`, {
      method,
      headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), Origin: ORIGIN, ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    params ? { params: Promise.resolve(params) } : undefined,
  );
  const payload = await response.json();
  assert.equal(response.status, expect, `${method} ${path} → ${response.status}: ${JSON.stringify(payload).slice(0, 300)}`);
  return payload;
}

async function reader() {
  const response = await session.POST(
    new Request(`${ORIGIN}/api/v1/auth/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN },
      body: JSON.stringify({ platform: "web", wantToken: false }),
    }),
  );
  const payload = await response.json();
  const cookie = response.headers.get("set-cookie").split(";")[0];
  createdUsers.push(payload.data.userId);
  return { cookie, userId: payload.data.userId };
}

const body = ["# 1-BOB", "Birinchi xatboshi. Ilm nurdur, jaholat zulmat.", "Ikkinchi xatboshi haqida gap."].join("\n\n");

try {
  const admin = await reader();
  const a = await reader();
  const b = await reader();
  sqlite.prepare("INSERT INTO users (id, role) VALUES (?, 'admin') ON CONFLICT(id) DO UPDATE SET role = 'admin'").run(admin.userId);

  const book = (await call(booksRoute.POST, "/api/v1/books", { method: "POST", cookie: admin.cookie, body: { title: "Belgi testi", author: "Muallif" }, expect: 201 })).data;
  createdBooks.push(book.id);
  await call(ebookRoute.PUT, `/api/v1/books/${book.id}/ebook`, { method: "PUT", cookie: admin.cookie, params: { id: book.id }, body: { body } });
  const path = `/api/v1/books/${book.id}/marks`;
  const params = { id: book.id };

  // ── Validatsiya ─────────────────────────────────────────────
  await call(marksRoute.POST, path, { method: "POST", cookie: a.cookie, params, body: { kind: "highlight", block: 1, start: 5, end: 5, quote: "" }, expect: 422 });
  await call(marksRoute.POST, path, { method: "POST", cookie: a.cookie, params, body: { kind: "highlight", block: 1, start: 9, end: 4, quote: "x" }, expect: 422 });
  await call(marksRoute.POST, path, { method: "POST", cookie: a.cookie, params, body: { kind: "bookmark", block: 1, start: 0, end: 3, quote: "" }, expect: 422 });
  await call(marksRoute.POST, path, { method: "POST", cookie: a.cookie, params, body: { kind: "highlight", block: -1, start: 0, end: 3, quote: "abc" }, expect: 422 });
  await call(marksRoute.POST, "/api/v1/books/book_yoq0000000/marks", { method: "POST", cookie: a.cookie, params: { id: "book_yoq0000000" }, body: { kind: "bookmark", block: 0, start: 0, end: 0, quote: "" }, expect: 404 });
  console.log("PASS: Validatsiya: bo'sh belgi, teskari oraliq, xatcho'p oralig'i, manfiy blok va yo'q kitob rad etiladi.");

  // ── Yaratish: matn bo'shliqlari saqlanadi ──────────────────────
  const hl = (await call(marksRoute.POST, path, { method: "POST", cookie: a.cookie, params, body: { kind: "highlight", block: 1, start: 0, end: 11, quote: "Birinchi xat" }, expect: 201 })).data;
  const spaced = (await call(marksRoute.POST, path, { method: "POST", cookie: a.cookie, params, body: { kind: "highlight", block: 1, start: 17, end: 22, quote: " Ilm " }, expect: 201 })).data;
  assert.equal(spaced.quote, " Ilm ", "Tanlangan matn bo'shlig'i o'zgarmasin (trim qilinmaydi)");
  const bm = (await call(marksRoute.POST, path, { method: "POST", cookie: a.cookie, params, body: { kind: "bookmark", block: 2, start: 0, end: 0, quote: "Ikkinchi" }, expect: 201 })).data;
  assert.equal(hl.kind, "highlight");
  assert.equal(bm.end, bm.start);
  console.log("PASS: Yaratish: belgi va xatcho'p saqlanadi, tanlangan matn o'zgarmaydi.");

  // ── Ajratish: har kim o'zinikini ko'radi ───────────────────────
  const mine = (await call(marksRoute.GET, path, { cookie: a.cookie, params })).data.items;
  assert.deepEqual(mine.map((m) => m.id), [hl.id, spaced.id, bm.id], "Tartib: blok, so'ng o'rin");
  assert.equal((await call(marksRoute.GET, path, { cookie: b.cookie, params })).data.items.length, 0, "Boshqa foydalanuvchi belgilarni ko'rmaydi");
  await call(markRoute.DELETE, `${path}/${hl.id}`, { method: "DELETE", cookie: b.cookie, params: { id: book.id, mid: hl.id }, expect: 404 });
  assert.equal((await call(marksRoute.GET, path, { cookie: a.cookie, params })).data.items.length, 3, "Boshqasi o'chira olmaydi");
  await call(markRoute.DELETE, `${path}/${bm.id}`, { method: "DELETE", cookie: a.cookie, params: { id: book.id, mid: bm.id } });
  assert.equal((await call(marksRoute.GET, path, { cookie: a.cookie, params })).data.items.length, 2, "O'z belgisi o'chadi");
  console.log("PASS: Ajratish: har bir foydalanuvchi faqat o'z belgilarini ko'radi va o'chiradi.");

  // ── Chegara ─────────────────────────────────────────────────
  const insert = sqlite.prepare("INSERT INTO book_marks (id, user_id, book_id, kind, block, start, end, quote) VALUES (?, ?, ?, 'bookmark', 0, ?, ?, '')");
  for (let i = 0; i < 498; i++) insert.run(`mark_fill${String(i).padStart(4, "0")}`, a.userId, book.id, i, i);
  assert.equal((await call(marksRoute.GET, path, { cookie: a.cookie, params })).data.items.length, 500);
  await call(marksRoute.POST, path, { method: "POST", cookie: a.cookie, params, body: { kind: "bookmark", block: 0, start: 900, end: 900, quote: "" }, expect: 400 });
  console.log("PASS: Chegara: bitta kitobda 500 tadan ortiq belgi qo'yilmaydi.");

  // ── Kitob o'chsa — belgilar ham ─────────────────────────────
  await call(bookRoute.DELETE, `/api/v1/books/${book.id}`, { method: "DELETE", cookie: admin.cookie, params: { id: book.id } });
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM book_marks WHERE book_id = ?").get(book.id).n, 0, "Kitob o'chsa belgilar ham o'chadi");
  createdBooks.pop();
  console.log("PASS: Kitob o'chirilganda uning belgilari ham o'chadi.");

  console.log("\nHAMMASI O'TDI: elektron kitob belgilari.");
} finally {
  for (const id of createdBooks) sqlite.prepare("DELETE FROM books WHERE id = ?").run(id);
  const unique = [...new Set(createdUsers)];
  if (unique.length) {
    const ph = unique.map(() => "?").join(",");
    sqlite.prepare(`DELETE FROM book_marks WHERE user_id IN (${ph})`).run(...unique);
    sqlite.prepare(`DELETE FROM user_sessions WHERE user_id IN (${ph})`).run(...unique);
    sqlite.prepare(`DELETE FROM users WHERE id IN (${ph})`).run(...unique);
  }
  console.log(`Tozalandi: ${unique.length} ta foydalanuvchi.`);
}
