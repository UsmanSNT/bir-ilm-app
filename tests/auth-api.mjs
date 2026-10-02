import assert from "node:assert/strict";
import { sqlite } from "../scripts/local-d1.mjs";
import { cookiesFrom, origin } from "./helpers.mjs";

// Lokal D1 previewda vaqtinchalik hisoblar yaratadi va oxirida o'chiradi.
const ids = [];
const logins = [];
const post = (path, payload, cookie = "", extra = {}) => fetch(`${origin}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...extra }, body: JSON.stringify(payload) });
const login = `t_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
logins.push(login);

try {
  // Mehmon: o'qish mumkin, yozish mumkin emas.
  const guest = await fetch(`${origin}/api/social`);
  assert.equal(guest.status, 200);
  const guestCookie = cookiesFrom(guest);
  assert.equal((await (await fetch(`${origin}/api/auth`, { headers: { Cookie: guestCookie } })).json()).user, null);
  for (const [path, payload] of [["/api/social", { type: "post", book: "X", body: "Y" }], ["/api/social", { type: "like", postId: "x", like: true }], ["/api/reviews", { bookId: "alchemist", rating: 5 }]]) {
    const r = await post(path, payload, guestCookie);
    assert.equal(r.status, 401, path);
    assert.equal((await r.json()).auth, true);
  }
  const guestOrder = await post("/api/store", { type: "order", id: "ZB-ABCDEF123456", name: "Test", phone: "+998901234567", address: "Toshkent, Chilonzor 5", payment: "click", cart: { alchemist: 1 }, promo: "" }, guestCookie);
  assert.equal(guestOrder.status, 401);
  assert.equal((await post("/api/store", { type: "cart", cart: { alchemist: 2 }, promo: "" }, guestCookie)).status, 200, "Mehmon savatni saqlay oladi");
  const guestMedia = await fetch(`${origin}/api/media`, { method: "POST", headers: { Cookie: guestCookie, Origin: origin, "Content-Type": "application/octet-stream" }, body: new Uint8Array(20) });
  assert.equal(guestMedia.status, 401);

  // Ro'yxatdan o'tish: validatsiya, mehmon savati hisobga o'tadi.
  assert.equal((await post("/api/auth", { type: "register", name: "Test", login: "AB", password: "parol12345" }, guestCookie)).status, 400);
  assert.equal((await post("/api/auth", { type: "register", name: "Test", login, password: "qisqa" }, guestCookie)).status, 400);
  assert.equal((await post("/api/auth", { type: "register", name: "", login, password: "parol12345" }, guestCookie)).status, 400);
  const reg = await post("/api/auth", { type: "register", name: "Aziza", login: login.toUpperCase(), password: "parol12345" }, guestCookie);
  const regBody = await reg.json();
  assert.equal(reg.status, 200, JSON.stringify(regBody));
  assert.equal(regBody.user.login, login, "Login kichik harfga keltiriladi");
  ids.push(regBody.user.id);
  const setCookies = reg.headers.getSetCookie().join("\n");
  assert.match(setCookies, /bir_session=[a-f0-9]{64}; HttpOnly; SameSite=Lax/);
  const session = `${guestCookie}; ${cookiesFrom(reg)}`;
  assert.equal((await (await fetch(`${origin}/api/store`, { headers: { Cookie: session } })).json()).cart.alchemist, 2, "Mehmon savati saqlanib qoladi");
  assert.equal((await post("/api/auth", { type: "register", name: "Boshqa", login, password: "parol12345" })).status, 409);
  const stored = sqlite.prepare("SELECT password_hash AS h, iterations FROM accounts WHERE login=?").get(login);
  assert.notEqual(stored.h, "parol12345");
  assert.equal(stored.iterations, 100000);

  const me = await (await fetch(`${origin}/api/auth`, { headers: { Cookie: session } })).json();
  assert.deepEqual(me.user, { id: regBody.user.id, login, name: "Aziza", providers: [] });
  assert.equal((await post("/api/social", { type: "post", book: "Alkimyogar", body: "Hisob bilan post" }, session)).status, 200);

  // Kirish: noto'g'ri parol, to'g'ri parol (yangi qurilma), chiqish.
  assert.equal((await post("/api/auth", { type: "login", login, password: "notogri123" })).status, 401);
  assert.equal((await post("/api/auth", { type: "login", login: "t_mavjud_emas", password: "parol12345" })).status, 401);
  const lg = await post("/api/auth", { type: "login", login, password: "parol12345" });
  assert.equal(lg.status, 200);
  const device2 = cookiesFrom(lg);
  const feed = await (await fetch(`${origin}/api/social?scope=mine`, { headers: { Cookie: device2 } })).json();
  assert.equal(feed.userId, regBody.user.id, "Boshqa qurilmada ham o'sha hisob");
  assert.equal(feed.posts[0].body, "Hisob bilan post");
  const out = await post("/api/auth", { type: "logout" }, device2);
  assert.equal(out.status, 200);
  assert.match(out.headers.getSetCookie().join("\n"), /bir_session=; .*Max-Age=0/);
  assert.equal((await (await fetch(`${origin}/api/auth`, { headers: { Cookie: device2 } })).json()).user, null, "Chiqqan sessiya bekor bo'ladi");
  assert.notEqual((await (await fetch(`${origin}/api/auth`, { headers: { Cookie: session } })).json()).user, null, "Boshqa qurilma sessiyasi qoladi");

  // Parol taxmin qilishdan himoya va boshqa saytdan so'rov.
  for (let i = 0; i < 10; i++) await post("/api/auth", { type: "login", login, password: `xato${i}xato` });
  assert.equal((await post("/api/auth", { type: "login", login, password: "parol12345" })).status, 429);
  assert.equal((await post("/api/auth", { type: "login", login, password: "parol12345" }, "", { Origin: "https://evil.example" })).status, 403);
  console.log("PASS: mehmon cheklovlari, ro'yxatdan o'tish, login, sessiyalar, chiqish, brute-force himoyasi.");
} finally {
  sqlite.prepare(`DELETE FROM auth_attempts WHERE login IN (${logins.map(() => "?").join(",")})`).run(...logins);
  if (ids.length) sqlite.prepare(`DELETE FROM users WHERE id IN (${ids.map(() => "?").join(",")})`).run(...ids);
  console.log("Test hisoblari o'chirildi.");
}
