/**
 * Viktorinalar testlari.
 * Ishga tushirish: `node tests/quiz-v1.mjs`
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
const quizzes = await load("app/api/v1/quizzes/route.ts");
const quiz = await load("app/api/v1/quizzes/[id]/route.ts");

const ORIGIN = "http://127.0.0.1:8787";
const created = new Set();
let ipCounter = 0;

async function call(handler, path, { expect = 200, method = "GET", body, cookie, ip, params } = {}) {
  const response = await handler(new Request(`${ORIGIN}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      Origin: ORIGIN,
      "X-Forwarded-For": ip ?? `10.0.0.${++ipCounter % 250}`,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), { params: Promise.resolve(params ?? {}) });
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
const viewerOf = async (cookie) => (await call(session.GET, "/api/v1/auth/session", { cookie })).payload.data;
const suffix = Math.random().toString(36).slice(2, 8);
const makeUser = async (label, role) => {
  const g = await guest();
  const reg = await call(register.POST, "/api/v1/auth/register", { method: "POST", cookie: g.cookie, expect: 201, body: { name: `Viktorina ${label}`, email: `quiz-${label}-${suffix}@example.com`, password: "kitob-sevaman-1" } });
  if (role) sqlite.prepare("UPDATE users SET role=? WHERE id=?").run(role, reg.payload.data.userId);
  return { cookie: reg.cookie, userId: reg.payload.data.userId };
};
const q = (prompt, choices, answer) => ({ prompt, choices, answer });
const valid = { title: "Atom odatlar", bookId: null, questions: [q("Muallif kim?", ["James Clear", "Cal Newport"], 0), q("Odat halqasi necha bosqich?", ["2", "3", "4"], 2)] };

try {
  const admin = await makeUser("admin", "admin");
  const user = await makeUser("user");
  const g0 = await guest();

  // Ruxsatlar: yaratish faqat admin/moderator; ko'rish hamma uchun.
  await call(quizzes.POST, "/api/v1/quizzes", { method: "POST", cookie: user.cookie, body: valid, expect: 403 });
  await call(quizzes.POST, "/api/v1/quizzes", { method: "POST", cookie: g0.cookie, body: valid, expect: 403 });

  // Tekshiruvlar
  const bad = (body) => call(quizzes.POST, "/api/v1/quizzes", { method: "POST", cookie: admin.cookie, body, expect: 422 });
  await bad({ ...valid, title: " " });
  await bad({ ...valid, questions: [] });
  await bad({ ...valid, questions: [q("S?", ["faqat bitta"], 0)] });
  await bad({ ...valid, questions: [q("S?", ["A", "B"], 2)] });
  await bad({ ...valid, questions: [q("S?", ["A", "a"], 0)] });
  await bad({ ...valid, questions: [q("", ["A", "B"], 0)] });
  await call(quizzes.POST, "/api/v1/quizzes", { method: "POST", cookie: admin.cookie, body: { ...valid, bookId: "yoq-kitob" }, expect: 400 });
  console.log("PASS: Ruxsatlar va tekshiruvlar: faqat admin/moderator yaratadi; bo'sh nom, savolsiz, bitta variant, noto'g'ri javob, takror variant, yo'q kitob rad etiladi.");

  // Yaratish → hamma ko'radi
  const made = (await call(quizzes.POST, "/api/v1/quizzes", { method: "POST", cookie: admin.cookie, body: valid, expect: 201 })).payload.data;
  assert.equal(made.questions.length, 2);
  assert.equal(made.minutes, 1);
  const seen = (await call(quizzes.GET, "/api/v1/quizzes", { cookie: g0.cookie })).payload.data.items;
  const mine = seen.find((x) => x.id === made.id);
  assert.ok(mine);
  assert.deepEqual(mine.questions[1], { prompt: "Odat halqasi necha bosqich?", choices: ["2", "3", "4"], answer: 2 });

  // Kitobga bog'lash
  const bookId = `quiz-book-${suffix}`;
  sqlite.prepare("INSERT INTO books (id, title, author, summary, color, created_by) VALUES (?, 'Sinov kitobi', 'Muallif', '', '#123456', ?)").run(bookId, admin.userId);
  const linked = (await call(quiz.PUT, `/api/v1/quizzes/${made.id}`, { method: "PUT", cookie: admin.cookie, params: { id: made.id }, body: { ...valid, title: "Yangilangan", bookId, questions: [...valid.questions, q("Uchinchi?", ["a", "b", "c", "d"], 3)] } })).payload.data;
  assert.equal(linked.bookId, bookId);
  assert.equal(linked.title, "Yangilangan");
  assert.equal(linked.questions.length, 3);
  assert.equal(linked.questions[2].answer, 3);
  await call(quiz.PUT, `/api/v1/quizzes/${made.id}`, { method: "PUT", cookie: user.cookie, params: { id: made.id }, body: valid, expect: 403 });
  await call(quiz.PUT, "/api/v1/quizzes/qz_yoq", { method: "PUT", cookie: admin.cookie, params: { id: "qz_yoq" }, body: valid, expect: 404 });
  console.log("PASS: Yaratish, hamma ko'rishi, tahrirlash (savollar almashtiriladi), kitobga bog'lash.");

  // Moderator ham boshqaradi; kitob o'chirilsa viktorina qoladi
  const moderator = await makeUser("mod", "moderator");
  await call(quiz.PUT, `/api/v1/quizzes/${made.id}`, { method: "PUT", cookie: moderator.cookie, params: { id: made.id }, body: { ...valid, bookId } });
  sqlite.prepare("DELETE FROM books WHERE id=?").run(bookId);
  const afterBook = (await call(quizzes.GET, "/api/v1/quizzes")).payload.data.items.find((x) => x.id === made.id);
  assert.ok(afterBook && afterBook.bookId === null, "Kitob o'chirilsa, viktorina qoladi (kitobsiz)");

  // O'chirish
  await call(quiz.DELETE, `/api/v1/quizzes/${made.id}`, { method: "DELETE", cookie: user.cookie, params: { id: made.id }, expect: 403 });
  await call(quiz.DELETE, `/api/v1/quizzes/${made.id}`, { method: "DELETE", cookie: admin.cookie, params: { id: made.id } });
  assert.ok(!(await call(quizzes.GET, "/api/v1/quizzes")).payload.data.items.some((x) => x.id === made.id));
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM quiz_questions WHERE quiz_id=?").get(made.id).n, 0, "Savollar ham o'chdi");
  console.log("PASS: Moderator ham tahrirlaydi; kitob o'chsa viktorina qoladi; o'chirish savollar bilan birga.");

  console.log("\nHAMMASI O'TDI: viktorinalar.");
} finally {
  const ids = [...created];
  if (ids.length) {
    const ph = ids.map(() => "?").join(",");
    sqlite.prepare(`DELETE FROM quizzes WHERE created_by IN (${ph})`).run(...ids);
    for (const table of ["user_sessions", "user_passwords", "auth_accounts"]) sqlite.prepare(`DELETE FROM ${table} WHERE user_id IN (${ph})`).run(...ids);
    sqlite.prepare(`DELETE FROM users WHERE id IN (${ph})`).run(...ids);
  }
  console.log(`Tozalandi: ${ids.length} ta foydalanuvchi.`);
}
