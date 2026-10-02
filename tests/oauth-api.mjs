import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { sqlite } from "../scripts/local-d1.mjs";
import { account, cookiesFrom, origin } from "./helpers.mjs";

// Server quyidagi muhit bilan ishga tushirilgan bo'lishi kerak:
// TELEGRAM_BOT_TOKEN=123:test TELEGRAM_BOT_USERNAME=bir_ilm_test_bot GOOGLE_CLIENT_ID=test-client GOOGLE_CLIENT_SECRET=test-secret
const BOT_TOKEN = "123:test";
const ids = new Set();
const tgIds = [];

function telegramQuery(fields, token = BOT_TOKEN) {
  const check = Object.keys(fields).sort().map(k => `${k}=${fields[k]}`).join("\n");
  const hash = createHmac("sha256", createHash("sha256").update(token).digest()).update(check).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}
const tgFields = (id, extra = {}) => ({ id: String(id), first_name: "Javohir", last_name: "Test", username: "javohir_t", auth_date: String(Math.floor(Date.now() / 1000)), ...extra });
const get = (path, cookie = "") => fetch(`${origin}${path}`, { redirect: "manual", headers: cookie ? { Cookie: cookie } : {} });
const me = async cookie => (await (await get("/api/auth", cookie)).json());

try {
  const providers = (await me()).providers;
  assert.deepEqual(providers, { google: true, telegram: "bir_ilm_test_bot" }, "Server test muhiti bilan ishga tushirilmagan");

  // Telegram: to'g'ri imzo — hisob ochiladi va sessiya beriladi.
  const tgId = 900000000 + Math.floor(Math.random() * 99999);
  tgIds.push(String(tgId));
  const ok = await get(`/api/auth/telegram?${telegramQuery(tgFields(tgId))}`);
  assert.equal(ok.status, 302);
  assert.equal(new URL(ok.headers.get("location")).search, "?auth=telegram");
  const tgCookie = cookiesFrom(ok);
  assert.match(tgCookie, /bir_session=/);
  const tgUser = (await me(tgCookie)).user;
  assert.equal(tgUser.name, "Javohir Test");
  assert.equal(tgUser.login, null);
  assert.deepEqual(tgUser.providers, ["telegram"]);
  ids.add(tgUser.id);
  const posted = await fetch(`${origin}/api/social`, { method: "POST", headers: { Cookie: tgCookie, Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ type: "post", book: "Alkimyogar", body: "Telegram orqali post" }) });
  assert.equal(posted.status, 200, "Telegram foydalanuvchisi post yoza oladi");

  // Xuddi shu Telegram ID boshqa qurilmadan — o'sha hisob.
  const again = await get(`/api/auth/telegram?${telegramQuery(tgFields(tgId, { first_name: "Boshqa" }))}`);
  assert.equal((await me(cookiesFrom(again))).user.id, tgUser.id);

  // Soxta yoki eskirgan ma'lumot rad etiladi.
  const forged = new URLSearchParams(telegramQuery(tgFields(tgId)));
  forged.set("first_name", "Hacker");
  for (const q of [forged.toString(), telegramQuery(tgFields(tgId), "999:boshqa-bot"), telegramQuery(tgFields(tgId, { auth_date: String(Math.floor(Date.now() / 1000) - 90000) })), telegramQuery({ ...tgFields(tgId), id: "abc" })]) {
    const bad = await get(`/api/auth/telegram?${q}`);
    assert.equal(new URL(bad.headers.get("location")).search, "?auth=error");
    assert.doesNotMatch(cookiesFrom(bad), /bir_session=/);
  }

  // Login-parol hisobiga kirgan holda Telegram — o'sha hisobga bog'lanadi.
  const acc = await account("Aziza");
  ids.add(acc.id);
  const linkId = tgId + 1;
  tgIds.push(String(linkId));
  const link = await get(`/api/auth/telegram?${telegramQuery(tgFields(linkId))}`, acc.cookie);
  const linked = (await me(cookiesFrom(link))).user;
  assert.equal(linked.id, acc.id);
  assert.equal(linked.name, "Aziza", "Bog'lashda mavjud ism o'zgarmaydi");
  assert.deepEqual(linked.providers, ["telegram"]);

  // Google: boshlash — state + PKCE bilan Google'ga yo'naltirish.
  const start = await get("/api/auth/google");
  assert.equal(start.status, 302);
  const g = new URL(start.headers.get("location"));
  assert.equal(g.origin + g.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(g.searchParams.get("client_id"), "test-client");
  assert.equal(g.searchParams.get("code_challenge_method"), "S256");
  assert.equal(g.searchParams.get("redirect_uri"), `${origin}/api/auth/google/callback`);
  const oauthCookie = start.headers.getSetCookie().find(c => c.startsWith("bir_oauth="));
  assert.match(oauthCookie, /HttpOnly; SameSite=Lax; Path=\/api\/auth\/google; Max-Age=600/);
  const [state, verifier] = oauthCookie.split(";")[0].slice("bir_oauth=".length).split(".");
  assert.equal(state, g.searchParams.get("state"));
  assert.equal(g.searchParams.get("code_challenge"), createHash("sha256").update(verifier).digest("base64url"));

  // Callback: state mos kelmasa yoki cookie bo'lmasa rad etiladi; bekor qilish alohida xabar.
  const wrongState = await get(`/api/auth/google/callback?code=abc&state=${"0".repeat(64)}`, oauthCookie.split(";")[0]);
  assert.equal(new URL(wrongState.headers.get("location")).search, "?auth=error");
  const noCookie = await get(`/api/auth/google/callback?code=abc&state=${state}`);
  assert.equal(new URL(noCookie.headers.get("location")).search, "?auth=error");
  const cancelled = await get("/api/auth/google/callback?error=access_denied");
  assert.equal(new URL(cancelled.headers.get("location")).search, "?auth=cancelled");
  console.log("PASS: Telegram imzo tekshiruvi, hisob/bog'lash, Google state+PKCE, CSRF himoyasi.");
} finally {
  if (tgIds.length) sqlite.prepare(`DELETE FROM oauth_identities WHERE provider='telegram' AND subject IN (${tgIds.map(() => "?").join(",")})`).run(...tgIds);
  if (ids.size) sqlite.prepare(`DELETE FROM users WHERE id IN (${[...ids].map(() => "?").join(",")})`).run(...ids);
  console.log("Test ma'lumotlari o'chirildi.");
}
