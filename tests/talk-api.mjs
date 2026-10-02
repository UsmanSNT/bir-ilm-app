import assert from "node:assert/strict";
import { sqlite } from "../scripts/local-d1.mjs";
import { account, origin } from "./helpers.mjs";

// Lokal D1'da vaqtinchalik hisoblar va joriy xona holatini sinaydi, oxirida tozalaydi.
const ids = [];
const client = cookie => ({
  get: async (after = 0) => (await fetch(`${origin}/api/talk?after=${after}`, { headers: cookie ? { Cookie: cookie } : {} })).json(),
  act: async (action, extra = {}, expected = 200) => {
    const r = await fetch(`${origin}/api/talk`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify({ action, ...extra }) });
    const body = await r.json();
    assert.equal(r.status, expected, `${action}: ${JSON.stringify(body)}`);
    return body;
  },
});

let roomId = "";
let before = null;
try {
  const guest = client("");
  const first = await guest.get();
  roomId = first.room.id;
  before = sqlite.prepare("SELECT status, host_id AS hostId FROM talk_rooms WHERE id=?").get(roomId);
  assert.match(roomId, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(new Date(`${roomId}T00:00:00Z`).getUTCDay(), 0, "Xona yakshanbaga bog'langan");
  assert.equal(first.room.startsAt, `${roomId}T13:00:00.000Z`, "18:00 Toshkent = 13:00 UTC");
  assert.equal(first.me.authed, false);
  await guest.act("join", {}, 401);
  sqlite.prepare("UPDATE talk_rooms SET status='scheduled', host_id=NULL WHERE id=?").run(roomId);

  const a = await account("Moderator"), b = await account("Tinglovchi");
  ids.push(a.id, b.id);
  const A = client(a.cookie), B = client(b.cookie);

  await B.act("message", { body: "salom" }, 409);
  let s = await A.act("join");
  assert.equal(s.me.joined, true);
  assert.equal(s.me.role, "listener");
  s = await B.act("join");
  assert.equal(s.participants.length >= 2, true);
  const after = s.messages.at(-1)?.id ?? 0;
  await B.act("join");
  const sys = (await B.get(after)).messages.filter(m => m.kind === "system" && m.userId === b.id);
  assert.equal(sys.length, 0, "Qayta ulanish chatni 'qo'shildi' bilan to'ldirmaydi");

  // Chat: validatsiya va tezlik cheklovi.
  await B.act("message", { body: "   " }, 400);
  await B.act("message", { body: "x".repeat(501) }, 400);
  s = await B.act("message", { body: "Assalomu alaykum, kitob haqida savolim bor", after });
  assert.ok(s.messages.some(m => m.kind === "text" && m.userId === b.id && m.name === "Tinglovchi"));
  for (let i = 0; i < 7; i++) await B.act("message", { body: `xabar ${i}` });
  await B.act("message", { body: "ortiqcha" }, 429);
  await A.act("react", { emoji: "👏" });
  await A.act("react", { emoji: "<script>" }, 400);

  // Moderatorlik: faqat boshlagan foydalanuvchi; so'z berish va yakunlash.
  await B.act("end", {}, 403);
  s = await A.act("start");
  assert.equal(s.room.status, "live");
  assert.equal(s.room.hostId, a.id);
  assert.equal(s.me.role, "host");
  await B.act("start", {}, 409);
  s = await B.act("hand", { raised: true });
  assert.equal(s.me.hand, true);
  await B.act("role", { target: a.id, role: "listener" }, 403);
  s = await A.act("role", { target: b.id, role: "speaker" });
  const bNow = s.participants.find(p => p.userId === b.id);
  assert.equal(bNow.role, "speaker");
  assert.equal(bNow.hand, false, "So'z berilganda qo'l tushiriladi");
  assert.equal(s.participants[0].userId, a.id, "Moderator birinchi");
  s = await B.act("leave");
  assert.equal(s.me.joined, false);
  s = await A.act("end");
  assert.equal(s.room.status, "ended");
  assert.equal(s.participants.length, 0);
  console.log("PASS: xona (yakshanba 18:00), mehmon cheklovi, chat validatsiya/limit, reaksiya, moderator, so'z berish, yakunlash.");
} finally {
  if (ids.length) {
    sqlite.prepare(`DELETE FROM talk_messages WHERE user_id IN (${ids.map(() => "?").join(",")})`).run(...ids);
    sqlite.prepare(`DELETE FROM users WHERE id IN (${ids.map(() => "?").join(",")})`).run(...ids);
  }
  if (roomId && before) sqlite.prepare("UPDATE talk_rooms SET status=?, host_id=? WHERE id=?").run(before.status, before.hostId, roomId);
  console.log("Test ma'lumotlari o'chirildi.");
}
