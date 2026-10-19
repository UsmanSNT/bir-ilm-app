/**
 * Jonli suhbat izohlari: efirda suzib o'tadi, tarixi faqat admin/moderatorga.
 * Haqiqiy WebSocket serveri va route funksiyalari bazaga qarshi chaqiriladi.
 * Ishga tushirish: `node tests/live-comments-v1.mjs`
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
const session = await load("app/api/v1/auth/session/route.ts");
const register = await load("app/api/v1/auth/register/route.ts");
const live = await load("app/api/v1/live/route.ts");
const liveItem = await load("app/api/v1/live/[id]/route.ts");
const liveStart = await load("app/api/v1/live/[id]/start/route.ts");
const liveMessages = await load("app/api/v1/live/[id]/messages/route.ts");

const ORIGIN = "http://127.0.0.1:8787";
const created = new Set();
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
const tokenOf = (cookie) => cookie.split("=")[1];
async function makeUser(label, role) {
  const guest = await call(session.POST, "/api/v1/auth/session", { method: "POST", body: { platform: "web" }, expect: 201 });
  created.add(guest.payload.data.userId);
  const reg = await call(register.POST, "/api/v1/auth/register", { method: "POST", cookie: guest.cookie, expect: 201, body: { name: `Izoh ${label}`, email: `izoh-${label}-${suffix}@example.com`, password: "kitob-sevaman-1" } });
  created.add(reg.payload.data.userId);
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
  return {
    opened: new Promise((resolve, reject) => { ws.once("open", resolve); ws.once("error", reject); }),
    send: (msg) => ws.send(JSON.stringify(msg)),
    next: (match, label, ms = 4000) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Kutilgan xabar kelmadi: ${label}`)), ms);
      waiters.push({ match, resolve, timer });
      flush();
    }),
    close: () => ws.close(),
  };
}

const db = drizzle(env.DB, { schema });
const port = 20000 + Math.floor(Math.random() * 20000);
const wss = startWsServer(db, port);
const sockets = [];
let sessionId = null;

/** Suhbatga kiradi va `joined` xabarini qaytaradi. */
async function join(user) {
  const c = connect(port);
  sockets.push(c);
  await c.opened;
  c.send({ type: "join", sessionId, token: user.token });
  const joined = await c.next((m) => m.type === "joined", "joined");
  return { c, joined };
}

try {
  const admin = await makeUser("admin", "admin");
  const mod = await makeUser("moderator", "moderator");
  const ali = await makeUser("ali");

  const { payload: made } = await call(live.POST, "/api/v1/live", {
    method: "POST",
    cookie: admin.cookie,
    expect: 201,
    body: { bookTitle: "Izohlar testi", title: "Suzuvchi izohlar", scheduledAt: new Date().toISOString() },
  });
  sessionId = made.data.id;
  const params = { id: sessionId };
  await call(liveStart.POST, `/api/v1/live/${sessionId}/start`, { method: "POST", cookie: admin.cookie, params });

  // ── Efir: hamma ko'radi, tezlik chegarasi ─────────────────────────
  const host = await join(admin);
  const reader = await join(ali);
  assert.deepEqual(reader.joined.recentMessages, []);
  for (let i = 1; i <= 5; i++) {
    reader.c.send({ type: "chat", body: `  Izoh ${i}  ` });
    const seen = await host.c.next((m) => m.type === "chat", `izoh ${i}`);
    assert.equal(seen.message.body, `Izoh ${i}`, "Izoh hammaga (boshlovchiga ham) boradi, chetidagi bo'shliqsiz");
  }
  reader.c.send({ type: "chat", body: "Oltinchi" });
  assert.match((await reader.c.next((m) => m.type === "error", "tezlik chegarasi")).message, /tez yozyapsiz/);
  console.log("PASS: Efir: izoh hammaga boradi; 10 soniyada 5 tadan ortig'i rad etiladi.");

  // ── Tarix: oddiy foydalanuvchiga yo'q, admin/moderatorga bor ─────
  reader.c.close();
  const again = await join(ali);
  assert.deepEqual(again.joined.recentMessages, [], "Qayta kirgan oddiy foydalanuvchi eski izohlarni ko'rmaydi");
  const moderator = await join(mod);
  assert.deepEqual(moderator.joined.recentMessages.map((m) => m.body), ["Izoh 1", "Izoh 2", "Izoh 3", "Izoh 4", "Izoh 5"]);

  await call(liveMessages.GET, `/api/v1/live/${sessionId}/messages`, { cookie: ali.cookie, params, expect: 403 });
  const { payload: detail } = await call(liveItem.GET, `/api/v1/live/${sessionId}`, { cookie: ali.cookie, params });
  assert.deepEqual(detail.data.recentMessages, []);
  assert.equal(detail.data.session.messageCount, 0);
  const { payload: readerList } = await call(live.GET, "/api/v1/live", { cookie: ali.cookie });
  assert.equal(readerList.data.find((s) => s.id === sessionId).messageCount, 0);
  const { payload: staffList } = await call(live.GET, "/api/v1/live", { cookie: mod.cookie });
  assert.equal(staffList.data.find((s) => s.id === sessionId).messageCount, 5);
  console.log("PASS: Tarix: oddiy foydalanuvchi izohlarni na qayta kirganda, na API orqali oladi; moderatorga soni va o'zi beriladi.");

  // ── Izohlar oynasi: eskidan yangiga, sahifalab ────────────────────
  const bodies = [];
  let cursor = null;
  let pages = 0;
  do {
    const query = `limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const { payload: page } = await call(liveMessages.GET, `/api/v1/live/${sessionId}/messages?${query}`, { cookie: mod.cookie, params });
    bodies.push(...page.data.items.map((m) => m.body));
    cursor = page.data.nextCursor;
    pages++;
  } while (cursor);
  assert.deepEqual(bodies, ["Izoh 1", "Izoh 2", "Izoh 3", "Izoh 4", "Izoh 5"], "Bir soniyada yozilganlar ham takrorlanmaydi va tushib qolmaydi");
  assert.equal(pages, 3);
  await call(liveMessages.GET, `/api/v1/live/${sessionId}/messages?cursor=buzuq`, { cookie: admin.cookie, params, expect: 400 });
  await call(liveMessages.GET, "/api/v1/live/live_yoq000000/messages", { cookie: admin.cookie, params: { id: "live_yoq000000" }, expect: 404 });
  console.log("PASS: Izohlar oynasi: kursor bilan sahifalanadi, noto'g'ri kursor va yo'q suhbat rad etiladi.");

  // ── Tugagan suhbatga izoh yozilmaydi, admin uchun izohlar qoladi ──
  host.c.send({ type: "mod:end" });
  await moderator.c.next((m) => m.type === "session_ended", "suhbat tugadi");
  // Ali tezlik chegarasiga yetgan — tekshiruvni hali yozmagan moderator bilan qilamiz.
  moderator.c.send({ type: "chat", body: "Kechikkan izoh" });
  assert.match((await moderator.c.next((m) => m.type === "error", "tugagan suhbat")).message, /jonli suhbat paytida/);
  const { payload: after } = await call(liveMessages.GET, `/api/v1/live/${sessionId}/messages`, { cookie: admin.cookie, params });
  assert.equal(after.data.items.length, 5);
  assert.equal(after.data.nextCursor, null);
  console.log("PASS: Tugagan suhbat: izoh yozilmaydi, admin/moderator barcha izohlarni ko'radi.");
} finally {
  for (const c of sockets) c.close();
  wss.close();
  if (sessionId) sqlite.prepare("DELETE FROM live_sessions WHERE id = ?").run(sessionId);
  const ids = [...created];
  if (ids.length) {
    const ph = ids.map(() => "?").join(",");
    for (const table of ["live_messages", "live_participants", "user_sessions", "user_passwords", "auth_accounts"]) sqlite.prepare(`DELETE FROM ${table} WHERE user_id IN (${ph})`).run(...ids);
    sqlite.prepare(`DELETE FROM users WHERE id IN (${ph})`).run(...ids);
  }
  console.log(`Tozalandi: ${ids.length} ta foydalanuvchi.`);
}

console.log("\nHAMMASI O'TDI: jonli suhbat izohlari.");
process.exit(0);
