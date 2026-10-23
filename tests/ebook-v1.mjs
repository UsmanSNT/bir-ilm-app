/**
 * Elektron kitob: saqlash (admin/moderator), o'qish (Javon — to'liq, do'kon — boshlang'ich qismi),
 * katalogdagi belgi, olib tashlash va kitob bilan birga o'chish.
 * Route funksiyalari to'g'ridan-to'g'ri chaqiriladi. Ishga tushirish: `node tests/ebook-v1.mjs`
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
const storeBooks = await load("app/api/v1/store/books/route.ts");
const { EBOOK_PREVIEW, EBOOK_LIMITS, ebookSourceLabel } = await load("shared/contract/ebook.ts");
const { ebookPreview, ebookTextLength } = await load("shared/ebook-markup.ts");

const ORIGIN = "http://127.0.0.1:8787";
const createdUsers = [];
const createdBooks = [];

async function call(handler, path, { params, expect = 200, method = "GET", body, headers = {} } = {}) {
  const response = await handler(
    new Request(`${ORIGIN}${path}`, {
      method,
      headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    params ? { params: Promise.resolve(params) } : undefined,
  );
  const payload = await response.json();
  assert.equal(response.status, expect, `${method} ${path} → ${response.status}: ${JSON.stringify(payload).slice(0, 300)}`);
  assert.equal(response.headers.get("cache-control"), "no-store", "Kitob matni umumiy keshga tushmasin");
  return payload;
}

async function client() {
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
  return {
    userId: payload.data.userId,
    call: (handler, path, options = {}) => call(handler, path, { ...options, headers: { Cookie: cookie, Origin: ORIGIN, ...options.headers } }),
  };
}
const setRole = (userId, role) => sqlite.prepare("INSERT INTO users (id, role) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET role = excluded.role").run(userId, role);

// Kitob matni: bob, she'r, o'rta/o'ng qatorlar va ko'p xatboshi (tanishuv qismi kesilishi uchun).
const paragraph = (n) => `${n}-xatboshi. Kitob o'qigan kishi o'z dunyosini kengaytiradi, ilm va ma'rifat yo'lida bir qadam oldinga yuradi.`;
const chapter = (n) => [`# ${n}-BOB`, "", ...Array.from({ length: 40 }, (_, i) => paragraph(n * 100 + i)), "", "> Ilm — nurdur, jaholat — zulmat,", "> O'qigan topar izzat-u hurmat.", "", "-> *Muallif* "].join("\n");
const body = `\uFEFF-> ***Bismillah*** <-\r\n\r\n\r\n\r\n${Array.from({ length: 10 }, (_, i) => chapter(i + 1)).join("\n\n")}\n`;

try {
  const admin = await client();
  const moderator = await client();
  const reader = await client();
  setRole(admin.userId, "admin");
  setRole(moderator.userId, "moderator");

  const library = (await admin.call(booksRoute.POST, "/api/v1/books", { method: "POST", body: { title: "E-kitob testi", author: "Muallif" }, expect: 201 })).data;
  const store = (await admin.call(booksRoute.POST, "/api/v1/books", { method: "POST", body: { kind: "store", title: "Do'kon e-kitobi", author: "Muallif", price: 30000 }, expect: 201 })).data;
  createdBooks.push(library.id, store.id);
  const p = (book) => ({ params: { id: book.id } });
  assert.equal(library.ebook, null);

  // ── Kim qo'yadi ───────────────────────────────────────────────────
  await reader.call(ebookRoute.PUT, `/api/v1/books/${library.id}/ebook`, { method: "PUT", body: { body }, ...p(library), expect: 403 });
  await admin.call(ebookRoute.PUT, `/api/v1/books/${library.id}/ebook`, { method: "PUT", body: { body: " \n\n " }, ...p(library), expect: 422 });
  await admin.call(ebookRoute.PUT, `/api/v1/books/${library.id}/ebook`, { method: "PUT", body: { body: "x".repeat(2_000_001) }, ...p(library), expect: 422 });
  await admin.call(ebookRoute.PUT, "/api/v1/books/book_yoq0000000/ebook", { method: "PUT", body: { body }, params: { id: "book_yoq0000000" }, expect: 404 });
  const saved = (await moderator.call(ebookRoute.PUT, `/api/v1/books/${library.id}/ebook`, { method: "PUT", body: { body }, ...p(library) })).data;
  assert.equal(saved.ebook.access, "free");
  assert.ok(saved.ebook.chars > 15000, "Belgilarsiz uzunlik hisoblanadi");
  console.log("PASS: Saqlash: faqat admin/moderator; bo'sh, juda katta matn va yo'q kitob rad etiladi.");

  // ── Javon kitobi: hammaga to'liq ──────────────────────────────────
  const full = (await reader.call(ebookRoute.GET, `/api/v1/books/${library.id}/ebook`, p(library))).data;
  assert.equal(full.full, true);
  assert.equal(full.access, "free");
  assert.ok(full.body.startsWith("-> ***Bismillah*** <-\n\n# 1-BOB"), "BOM, \\r va ortiqcha bo'sh qatorlar tozalanadi");
  assert.ok(!full.body.includes("\r") && !/\n{3,}/.test(full.body) && !/[ \t]$/m.test(full.body));
  assert.equal(full.chars, ebookTextLength(full.body));
  const catalog = (await reader.call(booksRoute.GET, "/api/v1/books")).data.items.find((b) => b.id === library.id);
  assert.deepEqual({ access: catalog.ebook.access, chars: catalog.ebook.chars }, { access: "free", chars: full.chars });
  console.log("PASS: Javon kitobi: matn hammaga to'liq, tozalangan holda; katalogda e-kitob belgisi bor.");

  // ── Do'kon kitobi: boshlang'ich qismi hammaga, to'liq — admin/moderatorga ──
  await admin.call(ebookRoute.PUT, `/api/v1/books/${store.id}/ebook`, { method: "PUT", body: { body }, ...p(store) });
  const preview = (await reader.call(ebookRoute.GET, `/api/v1/books/${store.id}/ebook`, p(store))).data;
  assert.equal(preview.access, "preview");
  assert.equal(preview.full, false);
  assert.equal(preview.chars, full.chars, "To'liq uzunlik baribir ko'rsatiladi");
  assert.equal(preview.body, ebookPreview(full.body, EBOOK_PREVIEW));
  const shown = ebookTextLength(preview.body);
  assert.ok(shown >= EBOOK_PREVIEW.minChars && shown < full.chars * 0.2, `Tanishuv qismi ~10%: ${shown} / ${full.chars}`);
  assert.ok(full.body.startsWith(preview.body), "Tanishuv qismi — matn boshi");
  assert.ok(!/^#/.test(preview.body.split("\n").at(-1)), "Oxirida yolg'iz sarlavha qolmaydi");
  for (const staff of [admin, moderator]) assert.equal((await staff.call(ebookRoute.GET, `/api/v1/books/${store.id}/ebook`, p(store))).data.full, true);
  const listed = (await reader.call(storeBooks.GET, "/api/v1/store/books")).data.items.find((b) => b.id === store.id);
  assert.deepEqual(listed.ebook, { access: "preview", chars: full.chars, updatedAt: listed.ebook.updatedAt, source: null });
  console.log("PASS: Do'kon kitobi: oddiy o'quvchiga faqat boshlang'ich qismi, admin/moderatorga to'liq; vitrinada belgisi bor.");

  // ── Manba: matn qayerdan olingani (kitobga kirishdan oldin ko'rsatiladi) ──
  const sourceOf = async (who, book) => (await who.call(booksRoute.GET, "/api/v1/books")).data.items.find((b) => b.id === book.id).ebook.source;
  assert.equal(await sourceOf(reader, library), null, "Manba qo'yilmagan — ko'rsatilmaydi");
  assert.equal(full.source, null);
  const patchSource = (who, book, sourceBody, expect = 200) => who.call(ebookRoute.PATCH, `/api/v1/books/${book.id}/ebook`, { method: "PATCH", body: sourceBody, ...p(book), expect });
  await patchSource(reader, library, { sourceName: "X" }, 403);
  for (const bad of ["javascript:alert(1)", "https://user:pw@example.com", "localhost", "ftp://example.com/x"]) await patchSource(admin, library, { sourceUrl: bad }, 422);
  await patchSource(admin, library, { sourceUrl: `https://example.com/${"a".repeat(EBOOK_LIMITS.sourceUrl)}` }, 422);
  await patchSource(admin, library, { sourceName: "n".repeat(EBOOK_LIMITS.sourceName + 1) }, 422);
  const plain = (await admin.call(booksRoute.POST, "/api/v1/books", { method: "POST", body: { title: "Matnsiz kitob", author: "Muallif" }, expect: 201 })).data;
  createdBooks.push(plain.id);
  await patchSource(admin, plain, { sourceName: "X" }, 404);

  const both = (await patchSource(moderator, library, { sourceName: "  Vikimanba ", sourceUrl: "uz.wikisource.org/wiki/Test" })).data;
  assert.deepEqual(both.ebook.source, { name: "Vikimanba", url: "https://uz.wikisource.org/wiki/Test" }, "Havola https ga keltiriladi, nom tozalanadi");
  assert.equal(both.ebook.chars, full.chars, "Matn o'zgarmaydi");
  assert.deepEqual(await sourceOf(reader, library), both.ebook.source, "Hamma katalogda ko'radi");
  assert.deepEqual((await reader.call(ebookRoute.GET, `/api/v1/books/${library.id}/ebook`, p(library))).data.source, both.ebook.source, "O'qish oynasi muqovasi uchun ham");
  assert.equal((await reader.call(ebookRoute.GET, `/api/v1/books/${library.id}/ebook`, p(library))).data.body, full.body);

  assert.deepEqual((await patchSource(admin, library, { sourceName: "Muallifning o'zi" })).data.ebook.source, { name: "Muallifning o'zi", url: "" }, "Faqat nom ham bo'ladi");
  const urlOnly = (await patchSource(admin, library, { sourceUrl: "https://www.example.org/kitob/" })).data.ebook.source;
  assert.deepEqual(urlOnly, { name: "", url: "https://www.example.org/kitob/" });
  assert.equal(ebookSourceLabel(urlOnly), "example.org/kitob", "Nom bo'lmasa — havola domeni");

  // Matnni qayta yuklash: manba berilmasa saqlanadi, berilsa almashadi.
  await admin.call(ebookRoute.PUT, `/api/v1/books/${library.id}/ebook`, { method: "PUT", body: { body: `${body}\n\nQo'shimcha xatboshi.` }, ...p(library) });
  assert.deepEqual(await sourceOf(reader, library), urlOnly, "Matn almashganda manba qoladi");
  await admin.call(ebookRoute.PUT, `/api/v1/books/${library.id}/ebook`, { method: "PUT", body: { body, sourceName: "Yangi manba" }, ...p(library) });
  assert.deepEqual(await sourceOf(reader, library), { name: "Yangi manba", url: "" }, "Berilgan manba almashtiradi (ikkinchisi bo'sh)");
  await admin.call(ebookRoute.PUT, `/api/v1/books/${library.id}/ebook`, { method: "PUT", body: { body, sourceName: "Bad", sourceUrl: "javascript:1" }, ...p(library), expect: 422 });

  // Do'kon vitrinasida ham.
  await patchSource(admin, store, { sourceName: "Nashriyot", sourceUrl: "https://example.com/nashr" });
  assert.deepEqual((await reader.call(storeBooks.GET, "/api/v1/store/books")).data.items.find((b) => b.id === store.id).ebook.source, { name: "Nashriyot", url: "https://example.com/nashr" });

  // Bo'sh yuborilsa — olib tashlanadi.
  assert.equal((await patchSource(admin, library, {})).data.ebook.source, null);
  assert.equal(await sourceOf(reader, library), null);
  console.log("PASS: Manba: faqat admin/moderator qo'yadi, havola tekshiriladi, katalog, o'qish oynasi va vitrinada ko'rinadi, matn almashganda saqlanadi.");

  // ── Olib tashlash va kitob bilan birga o'chish ───────────────────
  await reader.call(ebookRoute.DELETE, `/api/v1/books/${library.id}/ebook`, { method: "DELETE", ...p(library), expect: 403 });
  const removed = (await admin.call(ebookRoute.DELETE, `/api/v1/books/${library.id}/ebook`, { method: "DELETE", ...p(library) })).data;
  assert.equal(removed.ebook, null);
  await reader.call(ebookRoute.GET, `/api/v1/books/${library.id}/ebook`, { ...p(library), expect: 404 });
  await admin.call(bookRoute.DELETE, `/api/v1/books/${store.id}`, { method: "DELETE", ...p(store) });
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM book_ebooks WHERE book_id = ?").get(store.id).n, 0, "Kitob o'chsa matni ham o'chadi");
  console.log("PASS: Olib tashlash: faqat admin/moderator; kitob o'chirilsa e-kitob ham o'chadi.");

  console.log("\nHAMMASI O'TDI: elektron kitob.");
} finally {
  for (const id of createdBooks) sqlite.prepare("DELETE FROM books WHERE id = ?").run(id);
  const unique = [...new Set(createdUsers)];
  if (unique.length) {
    const ph = unique.map(() => "?").join(",");
    sqlite.prepare(`DELETE FROM user_sessions WHERE user_id IN (${ph})`).run(...unique);
    sqlite.prepare(`DELETE FROM users WHERE id IN (${ph})`).run(...unique);
  }
  console.log(`Tozalandi: ${unique.length} ta foydalanuvchi, ${createdBooks.length} ta kitob.`);
}
