import assert from "node:assert/strict";
import { sqlite } from "../scripts/local-d1.mjs";
import { account, origin } from "./helpers.mjs";

// Server muhiti: CALLS_APP_ID=test-app CALLS_APP_TOKEN=test-token TALK_ADMINS=efir_admin_test
// SFU'ning o'zi bu muhitda yo'q: ruxsat tekshiruvlaridan o'tgan so'rov 502 (SFU'ga ulanib bo'lmadi) qaytaradi.
const ids = [];
const call = (path, cookie, body, method = "POST") => fetch(`${origin}${path}`, { method, headers: { "Content-Type": "application/json", Origin: origin, Cookie: cookie }, body: JSON.stringify(body) })
  .then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const talk = (c, action, extra = {}) => call("/api/talk", c, { action, ...extra });
const rtc = (c, op, extra = {}) => call("/api/talk/rtc", c, { op, ...extra });
const SDP = "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n";

let roomId = "", before = null;
try {
  sqlite.prepare("DELETE FROM users WHERE id IN (SELECT user_id FROM accounts WHERE login='efir_admin_test')").run();
  const admin = await account("Admin", "efir_admin_test");
  const user = await account("Kitobxon");
  ids.push(admin.id, user.id);
  const snap = await (await fetch(`${origin}/api/talk`, { headers: { Cookie: user.cookie } })).json();
  roomId = snap.room.id;
  before = sqlite.prepare("SELECT status, host_id AS hostId FROM talk_rooms WHERE id=?").get(roomId);
  sqlite.prepare("UPDATE talk_rooms SET status='scheduled', host_id=NULL, recording=0 WHERE id=?").run(roomId);
  assert.equal(snap.media, true, "CALLS_* sozlangan bo'lsa media:true");
  assert.equal(snap.me.canStart, false, "Oddiy foydalanuvchi efirni boshlay olmaydi");

  await talk(admin.cookie, "join");
  await talk(user.cookie, "join");
  assert.equal((await rtc(user.cookie, "session")).status, 409, "Efir boshlanmagan");
  assert.equal((await talk(user.cookie, "start")).status, 403, "TALK_ADMINS'da yo'q");
  const started = await talk(admin.cookie, "start");
  assert.equal(started.status, 200);
  assert.equal(started.body.me.canStart, true);

  // Tinglovchi ovoz yubora olmaydi, ma'ruzachi ekran ulasha olmaydi.
  sqlite.prepare("UPDATE talk_participants SET rtc_session='s_user' WHERE room_id=? AND user_id=?").run(roomId, user.id);
  sqlite.prepare("UPDATE talk_participants SET rtc_session='s_admin' WHERE room_id=? AND user_id=?").run(roomId, admin.id);
  let r = await rtc(user.cookie, "push", { sdp: SDP, tracks: [{ mid: "0", kind: "audio" }] });
  assert.equal(r.status, 403);
  assert.equal((await talk(user.cookie, "mic", { on: true })).status, 403);
  await talk(admin.cookie, "role", { target: user.id, role: "speaker" });
  assert.equal((await rtc(user.cookie, "push", { sdp: SDP, tracks: [{ mid: "0", kind: "screen" }] })).status, 403, "Ekran — faqat admin");
  assert.equal((await rtc(user.cookie, "push", { sdp: SDP, tracks: [{ mid: "0", kind: "webcam" }] })).status, 400);
  assert.equal((await rtc(user.cookie, "push", { sdp: SDP, tracks: [{ mid: "0", kind: "audio" }] })).status, 502, "Ruxsatdan o'tdi, SFU'ga yuborildi");
  assert.equal((await rtc(admin.cookie, "push", { sdp: SDP, tracks: [{ mid: "0", kind: "screen" }] })).status, 502);

  // Olish: e'lon qilinmagan trek so'ralmaydi (SFU'ga murojaat ham yo'q).
  r = await rtc(user.cookie, "pull", { tracks: [{ userId: admin.id, kind: "audio" }, { userId: admin.id, kind: "video" }] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.tracks, []);
  sqlite.prepare("UPDATE talk_participants SET pub_audio=1 WHERE room_id=? AND user_id=?").run(roomId, admin.id);
  assert.equal((await rtc(user.cookie, "pull", { tracks: [{ userId: admin.id, kind: "audio" }] })).status, 502, "E'lon qilingan trek SFU'dan so'raladi");

  // So'z olinsa — ovoz/kamera belgilari tozalanadi, boshqalar uning trekini ololmaydi.
  sqlite.prepare("UPDATE talk_participants SET pub_audio=1, mic=1 WHERE room_id=? AND user_id=?").run(roomId, user.id);
  const demoted = await talk(admin.cookie, "role", { target: user.id, role: "listener" });
  const u = demoted.body.participants.find(p => p.userId === user.id);
  assert.deepEqual([u.role, u.audio, u.mic], ["listener", false, false]);
  r = await rtc(admin.cookie, "pull", { tracks: [{ userId: user.id, kind: "audio" }] });
  assert.deepEqual(r.body.tracks, []);

  // Yozib olish belgisi: faqat admin; hamma ko'radi.
  assert.equal((await talk(user.cookie, "recording", { state: 1 })).status, 403);
  assert.equal((await talk(admin.cookie, "recording", { state: 3 })).status, 400);
  await talk(admin.cookie, "recording", { state: 1 });
  let seen = await (await fetch(`${origin}/api/talk`, { headers: { Cookie: user.cookie } })).json();
  assert.equal(seen.room.recording, 1);
  assert.ok(seen.messages.some(m => m.kind === "system" && m.body === "rec_on"));
  await talk(admin.cookie, "recording", { state: 2 });
  await talk(admin.cookie, "end");
  seen = await (await fetch(`${origin}/api/talk`, { headers: { Cookie: user.cookie } })).json();
  assert.equal(seen.room.recording, 0, "Efir tugasa yozuv belgisi o'chadi");
  assert.equal((await rtc(admin.cookie, "session")).status, 409);
  console.log("PASS: efir admini (TALK_ADMINS), ovoz/ekran ruxsatlari, trek olish cheklovi, so'zni olish, yozuv belgisi.");
} finally {
  if (ids.length) {
    sqlite.prepare(`DELETE FROM talk_messages WHERE user_id IN (${ids.map(() => "?").join(",")})`).run(...ids);
    sqlite.prepare(`DELETE FROM users WHERE id IN (${ids.map(() => "?").join(",")})`).run(...ids);
  }
  if (roomId && before) sqlite.prepare("UPDATE talk_rooms SET status=?, host_id=?, recording=0 WHERE id=?").run(before.status, before.hostId, roomId);
  console.log("Test ma'lumotlari o'chirildi.");
}
