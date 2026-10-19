/**
 * Jonli viktorina o'yini: haqiqiy WebSocket serveri va bazaga qarshi (boshlovchi + bir nechta o'yinchi).
 * Ishga tushirish: `node tests/quiz-game-ws.mjs`
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
    // Faqat loyihaning .ts fayllaridagi nisbiy importlar (node_modules ichidagi CJS paketlarga tegilmaydi).
    if (specifier.startsWith(".") && /\.tsx?$/.test(context.parentURL ?? "")) return next(withExtension(new URL(specifier, context.parentURL).href), context);
    return next(specifier, context);
  },
});

const { sqlite, env } = await import(d1Module);
const { drizzle } = await import("drizzle-orm/d1");
const { default: WebSocket } = await import("ws");
const load = (path) => import(new URL(path, projectRoot).href);
const schema = await load("db/schema.ts");
const { startWsServer } = await load("server/ws/index.ts");
const { resetGames } = await load("server/services/quiz-game.ts");
const session = await load("app/api/v1/auth/session/route.ts");
const register = await load("app/api/v1/auth/register/route.ts");
const quizzes = await load("app/api/v1/quizzes/route.ts");
const sessionsRoute = await load("app/api/v1/quizzes/[id]/sessions/route.ts");

const ORIGIN = "http://127.0.0.1:8787";
const created = new Set();
let ipCounter = 0;

async function call(handler, path, { expect = 200, method = "GET", body, cookie, params } = {}) {
  const response = await handler(new Request(`${ORIGIN}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      Origin: ORIGIN,
      "X-Forwarded-For": `10.1.0.${++ipCounter % 250}`,
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
const tokenOf = (cookie) => cookie.split("=")[1];
async function guest() {
  const { payload, cookie } = await call(session.POST, "/api/v1/auth/session", { method: "POST", body: { platform: "web" }, expect: 201 });
  created.add(payload.data.userId);
  return { userId: payload.data.userId, cookie, token: tokenOf(cookie) };
}
async function makeUser(label, role) {
  const g = await guest();
  const reg = await call(register.POST, "/api/v1/auth/register", { method: "POST", cookie: g.cookie, expect: 201, body: { name: `O'yin ${label}`, email: `game-${label}-${suffix}@example.com`, password: "kitob-sevaman-1" } });
  if (role) sqlite.prepare("UPDATE users SET role=? WHERE id=?").run(role, reg.payload.data.userId);
  return { cookie: reg.cookie, userId: reg.payload.data.userId, token: tokenOf(reg.cookie) };
}

/** Xabarlarni navbatga yig'adigan ws mijozi: `next(shart)` kerakli xabarni kutadi. */
function connect(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const inbox = [];
  const waiters = [];
  const flush = () => {
    for (let i = waiters.length - 1; i >= 0; i--) {
      const w = waiters[i];
      const at = inbox.findIndex(w.match);
      if (at < 0) continue;
      const [msg] = inbox.splice(at, 1);
      waiters.splice(i, 1);
      clearTimeout(w.timer);
      w.resolve(msg);
    }
  };
  ws.on("message", (raw) => { inbox.push(JSON.parse(String(raw))); flush(); });
  const client = {
    ws,
    inbox,
    opened: new Promise((resolve, reject) => { ws.once("open", resolve); ws.once("error", reject); }),
    send: (msg) => ws.send(JSON.stringify(msg)),
    next: (match, label, ms = 4000) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Kutilgan xabar kelmadi: ${label}`)), ms);
      waiters.push({ match, resolve, timer });
      flush();
    }),
    view: (pred, label) => client.next((m) => m.type === "qz:view" && pred(m.view), label).then((m) => m.view),
    error: (label) => client.next((m) => m.type === "qz:error", label),
    close: () => ws.close(),
  };
  return client;
}

const q = (prompt, choices, answer) => ({ prompt, choices, answer });
const body = { title: "O'yin viktorinasi", bookId: null, questions: [q("Birinchi?", ["A", "B", "C"], 0), q("Ikkinchi?", ["A", "B"], 1)] };

const db = drizzle(env.DB, { schema });
const port = 20000 + Math.floor(Math.random() * 20000);
const wss = startWsServer(db, port);
const sockets = [];
const open = async (token, sessionId) => {
  const c = connect(port);
  sockets.push(c);
  await c.opened;
  c.send({ type: "qz:join", sessionId, token });
  return c;
};

try {
  const admin = await makeUser("boshlovchi", "admin");
  const ali = await makeUser("ali");
  const vali = await makeUser("vali");
  const anon = await guest();

  const made = (await call(quizzes.POST, "/api/v1/quizzes", { method: "POST", cookie: admin.cookie, body, expect: 201 })).payload.data;
  const sessionIn = async (ms) => (await call(sessionsRoute.POST, `/api/v1/quizzes/${made.id}/sessions`, { method: "POST", cookie: admin.cookie, params: { id: made.id }, body: { startsAt: new Date(Date.now() + ms).toISOString() }, expect: 201 })).payload.data.sessions.at(-1);
  const open1 = await sessionIn(60_000);
  const later = await sessionIn(3 * 3600_000);

  // ── Kirish shartlari ──────────────────────────────────────────────
  {
    const c = await open(anon.token, open1.id);
    const err = await c.error("mehmon rad etilishi");
    assert.equal(err.fatal, true);
    assert.match(err.message, /hisobingizga kiring/i);
    const early = await open(ali.token, later.id);
    const e2 = await early.error("hali ochilmagan");
    assert.equal(e2.fatal, true);
    assert.match(e2.message, /hali boshlanmadi/i);
    const missing = await open(ali.token, "qs_yoq");
    assert.match((await missing.error("yo'q vaqt")).message, /topilmadi/i);
    console.log("PASS: Kirish: mehmon, hali ochilmagan va mavjud bo'lmagan viktorina rad etiladi (qayta ulanish foydasiz: fatal).");
  }

  // ── Kutish xonasi ─────────────────────────────────────────────────
  const host = await open(admin.token, open1.id);
  const hostLobby = await host.view((v) => v.phase === "lobby", "boshlovchi xonasi");
  assert.equal(hostLobby.isHost, true);
  assert.equal(hostLobby.code, open1.code, "Kodni boshlovchi ko'radi");
  assert.equal(hostLobby.you, null);
  const a = await open(ali.token, open1.id);
  const aLobby = await a.view((v) => v.phase === "lobby", "Ali xonasi");
  assert.equal(aLobby.isHost, false);
  assert.equal(aLobby.code, null, "O'yinchi kodni ko'rmaydi (u o'zi kod bilan kirgan)");
  assert.equal(aLobby.hostOnline, true);
  const b = await open(vali.token, open1.id);
  await b.view((v) => v.phase === "lobby", "Vali xonasi");
  const roster = await host.view((v) => v.phase === "lobby" && v.playerCount === 2, "ro'yxat yangilanishi");
  assert.deepEqual(roster.players.map((p) => p.name).sort(), ["O'yin ali", "O'yin vali"]);
  a.send({ type: "qz:start" });
  assert.match((await a.error("o'yinchi boshlay olmaydi")).message, /boshlovchi/i);
  console.log("PASS: Kutish xonasi: boshlovchi kodni ko'radi, o'yinchilar ro'yxati yangilanadi, o'yinchi o'yinni boshlay olmaydi.");

  // ── 1-savol ───────────────────────────────────────────────────────
  host.send({ type: "qz:start" });
  const [hq, aq, bq] = await Promise.all([host, a, b].map((c) => c.view((v) => v.phase === "question", "1-savol")));
  for (const view of [hq, aq, bq]) {
    assert.equal(view.question.index, 0);
    assert.equal(view.question.prompt, "Birinchi?");
    assert.equal(view.reveal, null);
    assert.ok(!JSON.stringify(view).includes('"answer"'), "Savol ochiq turganda to'g'ri javob tarmoqqa chiqmaydi");
  }
  a.send({ type: "qz:answer", question: 0, choice: 0 });
  assert.deepEqual((await a.next((m) => m.type === "qz:ack", "Ali ack")).choice, 0);
  const progress = await host.next((m) => m.type === "qz:progress" && m.answered === 1, "javoblar soni");
  assert.equal(progress.playerCount, 2);
  a.send({ type: "qz:answer", question: 0, choice: 1 }); // o'zgartirib bo'lmaydi
  b.send({ type: "qz:answer", question: 5, choice: 0 }); // boshqa savol
  assert.match((await b.error("eskirgan savol")).message, /yopilgan/i);
  b.send({ type: "qz:answer", question: 0, choice: 2 });
  const [hr, ar, br] = await Promise.all([host, a, b].map((c) => c.view((v) => v.phase === "reveal", "1-natija")));
  assert.equal(ar.reveal.answer, 0);
  assert.deepEqual(ar.reveal.counts, [1, 0, 1], "Ali javobini o'zgartira olmadi");
  assert.equal(ar.you.correct, true);
  assert.ok(ar.you.points.total >= 500 && ar.you.points.total <= 1000, `Ali ${ar.you.points.total} ball oldi`);
  assert.equal(br.you.correct, false);
  assert.equal(br.you.points.total, 0);
  assert.equal(ar.you.rank, 1);
  assert.equal(br.you.rank, 2);
  assert.equal(hr.rows[0].name, "O'yin ali");
  assert.equal(hr.you, null);
  assert.equal(ar.reveal.fastest[0].name, "O'yin ali");
  console.log("PASS: 1-savol: javob ochiq turganda yashirin, hamma javob bergach natija, tezlikka qarab ball, o'rinlar.");

  // ── Qayta ulanish va bitta hisob — bitta qurilma ──────────────────
  a.close();
  await host.view((v) => v.playerCount === 1, "Ali uzildi");
  const a2 = await open(ali.token, open1.id);
  const back = await a2.view((v) => v.phase === "reveal", "Ali qaytdi");
  assert.equal(back.you.score, ar.you.score, "Qayta ulangan o'yinchi balli saqlangan");
  const a3 = await open(ali.token, open1.id);
  await a2.next((m) => m.type === "qz:kicked", "eski qurilma chiqarilishi");
  await a3.view((v) => v.phase === "reveal", "yangi qurilma");
  console.log("PASS: Qayta ulanish: ball saqlanadi; shu hisobning yangi ulanishi eskisini chiqaradi.");

  // ── 2-savol va yakun ──────────────────────────────────────────────
  host.send({ type: "qz:next" });
  await a3.view((v) => v.phase === "question" && v.question.index === 1, "2-savol");
  await b.view((v) => v.phase === "question" && v.question.index === 1, "Vali 2-savol");
  b.send({ type: "qz:answer", question: 1, choice: 1 });
  await host.next((m) => m.type === "qz:progress" && m.answered === 1, "Vali javobi");
  host.send({ type: "qz:reveal" }); // Ali javob bermadi — boshlovchi vaqtni kutmay ochadi
  const last = await a3.view((v) => v.phase === "reveal" && v.last, "2-natija");
  assert.equal(last.you.correct, null, "Javob bermagan");
  assert.equal(last.you.points.total, 0);
  const bLast = await b.view((v) => v.phase === "reveal" && v.question.index === 1, "Vali 2-natija");
  assert.equal(bLast.you.correct, true);
  assert.equal(bLast.you.points.total >= 500, true);
  // Yakuniy natija bazaga o'yin tugashi bilan yozilgan (boshlovchi «Natijalar»ni bosishini kutmasdan).
  await new Promise((resolve) => setTimeout(resolve, 150));
  const rows = sqlite.prepare("SELECT user_id, correct, total, score, session_id FROM quiz_results WHERE session_id=? ORDER BY score DESC").all(open1.id);
  assert.equal(rows.length, 2, "Ikkala o'yinchi natijasi yozildi, boshlovchi emas");
  const byUser = Object.fromEntries(rows.map((r) => [r.user_id, r]));
  assert.equal(byUser[ali.userId].correct, 1);
  assert.equal(byUser[ali.userId].total, 2);
  assert.equal(byUser[ali.userId].score, ar.you.score);
  assert.equal(byUser[vali.userId].correct, 1);
  assert.equal(byUser[vali.userId].score, bLast.you.score);
  assert.ok(!(admin.userId in byUser));
  host.send({ type: "qz:next" });
  const ended = await a3.view((v) => v.phase === "ended", "yakun");
  assert.equal(ended.rows.length, 2);
  assert.equal(ended.rows[0].rank, 1);
  const staff = (await call(quizzes.GET, "/api/v1/quizzes", { cookie: admin.cookie })).payload.data.items.find((x) => x.id === made.id);
  assert.equal(staff.sessions.find((s) => s.id === open1.id).participants, 2, "Ishtirokchilar soni jonli o'yin natijasidan");
  console.log("PASS: Yakun: natijalar bazaga yoziladi (o'yinchilar uchun, boshlovchi uchun emas), ishtirokchilar soni yangilanadi.");

  // ── Yangi o'yin ───────────────────────────────────────────────────
  a3.send({ type: "qz:reset" });
  assert.match((await a3.error("o'yinchi tiklay olmaydi")).message, /boshlovchi/i);
  host.send({ type: "qz:reset" });
  const fresh = await a3.view((v) => v.phase === "lobby" && v.you.score === 0, "yangi kutish xonasi");
  assert.equal(fresh.playerCount, 2);
  console.log("PASS: Yangi o'yin: faqat boshlovchi tiklaydi, ballar nollanadi.");
} finally {
  for (const c of sockets) c.close();
  wss.close();
  resetGames();
  const ids = [...created];
  if (ids.length) {
    const ph = ids.map(() => "?").join(",");
    sqlite.prepare(`DELETE FROM quizzes WHERE created_by IN (${ph})`).run(...ids);
    for (const table of ["user_sessions", "user_passwords", "auth_accounts"]) sqlite.prepare(`DELETE FROM ${table} WHERE user_id IN (${ph})`).run(...ids);
    sqlite.prepare(`DELETE FROM users WHERE id IN (${ph})`).run(...ids);
  }
  console.log(`Tozalandi: ${ids.length} ta foydalanuvchi.`);
}

console.log("\nHAMMASI O'TDI: jonli viktorina o'yini (WebSocket).");
process.exit(0);
