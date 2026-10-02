import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { sqlite } from "../scripts/local-d1.mjs";
import { cookiesFrom, origin } from "./helpers.mjs";

// Server TELEGRAM_BOT_TOKEN bilan ishga tushirilgan bo'lishi kerak (xabar yuborilmasa ham token yaratiladi).
const ids = [];
const keys = [];
const post = (payload, cookie = "") => fetch(`${origin}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(payload) });
const me = async cookie => (await (await fetch(`${origin}/api/auth`, { headers: { Cookie: cookie } })).json()).user;
const uid = () => crypto.randomUUID().replace(/-/g, "").slice(0, 10);
const sha = s => createHash("sha256").update(s).digest("hex");
const resetRows = userId => sqlite.prepare("SELECT count(*) AS n FROM password_resets WHERE user_id=? AND used_at IS NULL").get(userId).n;

try {
  const login = `r_${uid()}`, email = `${login}@misol.uz`;
  keys.push(`forgot:${login}`, `forgot:${email}`, `forgot:yoq_${login}`, login);
  const reg = await post({ type: "register", name: "Tiklash", login, password: "eskiparol1", email: email.toUpperCase() });
  const regBody = await reg.json();
  assert.equal(reg.status, 200, JSON.stringify(regBody));
  ids.push(regBody.user.id);
  const userId = regBody.user.id;
  const cookie1 = cookiesFrom(reg);
  assert.equal((await me(cookie1)).email, email, "Email kichik harfda saqlanadi");
  assert.equal((await post({ type: "register", name: "Boshqa", login: `r_${uid()}`, password: "parol12345", email })).status, 409);
  assert.equal((await post({ type: "register", name: "Boshqa", login: `r_${uid()}`, password: "parol12345", email: "notogri" })).status, 400);

  // Unutdim: javob har doim bir xil; kanal bo'lmasa token yaratilmaydi.
  const unknown = await post({ type: "forgot", identifier: `yoq_${login}` });
  const generic = (await unknown.json()).message;
  assert.equal(unknown.status, 200);
  const noChannel = await post({ type: "forgot", identifier: email });
  assert.equal((await noChannel.json()).message, generic, "Hisob borligi oshkor bo'lmasligi kerak");
  assert.equal(resetRows(userId), 0, "Email yuborish sozlanmagan — token yaratilmaydi");

  // Telegram bog'langan bo'lsa token yaratiladi.
  sqlite.prepare("INSERT INTO oauth_identities (provider, subject, user_id) VALUES ('telegram', ?, ?)").run(String(800000000 + Math.floor(Math.random() * 99999)), userId);
  assert.equal((await post({ type: "forgot", identifier: login })).status, 200);
  assert.equal(resetRows(userId), 1);
  const stored = sqlite.prepare("SELECT token_hash AS h, expires_at AS e FROM password_resets WHERE user_id=?").get(userId);
  assert.match(stored.h, /^[a-f0-9]{64}$/, "Token ochiq emas, xesh saqlanadi");
  assert.ok(new Date(stored.e.replace(" ", "T") + "Z") - Date.now() <= 31 * 60 * 1000);
  assert.equal((await post({ type: "forgot", identifier: login })).status, 200);
  assert.equal(resetRows(userId), 1, "Yangi so'rov eskisini bekor qiladi");
  for (let i = 0; i < 2; i++) await post({ type: "forgot", identifier: login });
  assert.equal((await post({ type: "forgot", identifier: login })).status, 429);

  // Havola bilan yangi parol: bizga ma'lum token bazaga yoziladi (email/Telegram'ni o'qib bo'lmaydi).
  const token = "ab".repeat(32);
  sqlite.prepare("DELETE FROM password_resets WHERE user_id=?").run(userId);
  sqlite.prepare("INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now','+30 minutes'))").run(sha(token), userId);
  assert.equal((await post({ type: "reset", token, password: "qisqa" })).status, 400);
  assert.equal((await post({ type: "reset", token: "cd".repeat(32), password: "yangiparol1" })).status, 410);
  const reset = await post({ type: "reset", token, password: "yangiparol1" });
  assert.equal(reset.status, 200);
  const cookie2 = cookiesFrom(reset);
  assert.equal((await me(cookie2)).id, userId);
  assert.equal(await me(cookie1), null, "Eski sessiyalar yopiladi");
  assert.equal((await post({ type: "reset", token, password: "boshqaparol1" })).status, 410, "Token bir martalik");
  assert.equal((await post({ type: "login", login, password: "eskiparol1" })).status, 401);
  assert.equal((await post({ type: "login", login, password: "yangiparol1" })).status, 200);
  const old = "ef".repeat(32);
  sqlite.prepare("INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now','-1 minutes'))").run(sha(old), userId);
  assert.equal((await post({ type: "reset", token: old, password: "yangiparol2" })).status, 410, "Muddati o'tgan token");

  // Sozlamalarda parol/email o'zgartirish: joriy parol shart, boshqa qurilmalar chiqariladi.
  const other = cookiesFrom(await post({ type: "login", login, password: "yangiparol1" }));
  assert.equal((await post({ type: "change_password", current: "notogri123", password: "uchinchi123" }, cookie2)).status, 403);
  assert.equal((await post({ type: "change_password", current: "yangiparol1", password: "uchinchi123" })).status, 401);
  assert.equal((await post({ type: "change_password", current: "yangiparol1", password: "uchinchi123" }, cookie2)).status, 200);
  assert.notEqual(await me(cookie2), null, "Joriy qurilma qoladi");
  assert.equal(await me(other), null, "Boshqa qurilma chiqariladi");
  const newEmail = `${login}.yangi@misol.uz`;
  assert.equal((await post({ type: "set_email", email: newEmail, current: "notogri123" }, cookie2)).status, 403);
  assert.equal((await post({ type: "set_email", email: newEmail, current: "uchinchi123" }, cookie2)).status, 200);
  assert.equal((await me(cookie2)).email, newEmail);
  console.log("PASS: email bilan ro'yxat, unutdim (umumiy javob, limit), bir martalik token, muddat, sessiyalar, parol/email o'zgartirish.");
} finally {
  sqlite.prepare(`DELETE FROM auth_attempts WHERE login IN (${keys.map(() => "?").join(",")})`).run(...keys);
  if (ids.length) sqlite.prepare(`DELETE FROM users WHERE id IN (${ids.map(() => "?").join(",")})`).run(...ids);
  console.log("Test ma'lumotlari o'chirildi.");
}
