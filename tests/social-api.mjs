import assert from "node:assert/strict";
import { sqlite } from "../scripts/local-d1.mjs";

// Run against `pnpm preview:node` started with ADMIN_EMAILS=admin-test@example.com.
// Creates disposable members/visitors only in the local D1 preview and removes them afterwards.
const origin = "http://127.0.0.1:8787";
const authIds = [];
const visitorTokens = [];
const count = table => sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get().n;

function client(authId, email) {
  const auth = authId ? { "oai-authenticated-user-id": authId, "oai-authenticated-user-email": email } : {};
  if (authId) authIds.push(authId);
  const send = (path, init = {}) => fetch(`${origin}${path}`, { redirect: "manual", ...init, headers: { ...auth, ...init.headers } });
  const post = (path, payload, headers = {}) => send(path, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, ...headers }, body: JSON.stringify(payload) });
  return {
    send, post,
    get: async (query = "") => { const r = await send(`/api/social${query}`); assert.equal(r.status, 200); return r.json(); },
    write: async (payload, expected = 200) => { const r = await post("/api/social", payload); assert.equal(r.status, expected, await r.text()); },
    register: async name => { const r = await post("/api/me", { name }); assert.equal(r.status, 201, await r.text()); },
  };
}

const run = Date.now();
try {
  // Anonymous visitors: readable feed, nothing stored, no identity cookie, no writes.
  const visitor = client();
  const usersBefore = count("users");
  const anon = await visitor.send("/api/social");
  assert.equal(anon.status, 200);
  assert.equal(anon.headers.get("set-cookie"), null, "Reading must not hand out an identity cookie");
  assert.equal((await anon.json()).userId, "");
  assert.equal(count("users"), usersBefore, "Anonymous reads must not create users");
  await visitor.write({ type: "post", book: "x", body: "y" }, 401);
  assert.equal((await visitor.post("/api/app-state", { type: "comment", text: "salom" })).status, 401);
  assert.equal((await visitor.post("/api/me", { name: "Mehmon" })).status, 401);
  assert.equal((await visitor.send("/api/me").then(r => r.json())).kind, "visitor");

  // Visit tracking is a separate list, de-duplicated per cookie, bots ignored.
  const ua = { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17) Mobile Safari" };
  const visits = count("site_visitors");
  const first = await visitor.post("/api/visit", {}, ua);
  assert.equal(first.status, 204);
  const cookie = first.headers.get("set-cookie").split(";")[0];
  visitorTokens.push(cookie.split("=")[1]);
  assert.match(first.headers.get("set-cookie"), /HttpOnly/);
  assert.equal(count("site_visitors"), visits + 1);
  await visitor.post("/api/visit", {}, { ...ua, Cookie: cookie });
  assert.equal(count("site_visitors"), visits + 1, "Same visitor must not add a row");
  assert.equal(sqlite.prepare("SELECT visits, device FROM site_visitors ORDER BY first_seen DESC, rowid DESC LIMIT 1").get().visits, 1, "Reload inside 30 minutes is not a new visit");
  await visitor.post("/api/visit", {}, { "User-Agent": "Googlebot/2.1" });
  assert.equal(count("site_visitors"), visits + 1, "Bots must not be listed");
  assert.equal((await visitor.send("/api/visit", { method: "POST", headers: { Origin: "https://evil.example", ...ua } })).status, 403);
  assert.equal(count("users"), usersBefore, "Visits must not create users");

  // Signed in but unregistered is still not a member.
  const a = client(`test-a-${run}`, `a-${run}@example.com`);
  const b = client(`test-b-${run}`, `b-${run}@example.com`);
  assert.equal((await a.send("/api/me").then(r => r.json())).kind, "signed_in");
  await a.write({ type: "post", book: "x", body: "y" }, 401);
  assert.equal((await a.post("/api/me", { name: "A" })).status, 400, "Name too short");
  assert.equal((await a.send("/api/me", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "No origin" }) })).status, 403);
  await a.register("API test A");
  await b.register("API test B");
  assert.equal((await a.send("/api/me").then(r => r.json())).kind, "member");
  assert.equal((await a.post("/api/me", { name: "Again" })).status, 200, "Registering twice is idempotent");

  const aId = (await a.get()).userId, bId = (await b.get()).userId;
  assert.match(aId, /^member_[a-f0-9]{64}$/);
  assert.notEqual(aId, bId);
  assert.ok(!aId.includes(`test-a-${run}`), "Platform ID must not be exposed");

  // Members: same social behaviour as before.
  await a.write({ type: "profile", bio: "Tarixiy romanlar va mutolaa." });
  assert.equal((await a.get()).profile.bio, "Tarixiy romanlar va mutolaa.");
  assert.equal((await b.get(`?author=${aId}`)).authorProfile.bio, "Tarixiy romanlar va mutolaa.");
  await a.write({ type: "profile" });
  assert.equal((await a.get()).profile.bio, "Tarixiy romanlar va mutolaa.");
  await a.write({ type: "profile", bio: "x".repeat(301) }, 400);
  await a.write({ type: "post", book: "O'tkan kunlar", body: "Sinov uchun kitob taassuroti." });
  const post = (await a.get("?scope=mine")).posts[0];
  assert.equal(post.userId, aId);
  assert.equal((await visitor.get("?scope=mine")).posts.length, 0, "Visitors have no 'mine' feed");
  assert.ok((await visitor.get()).posts.some(p => p.id === post.id), "Visitors can read the public feed");
  assert.ok((await visitor.get()).readers.some(r => r.id === aId), "Registered members are listed as readers");
  await b.write({ type: "reply", postId: post.id, body: "Sinov izohi." });
  assert.equal((await a.get("?scope=mine")).posts[0].replies[0].body, "Sinov izohi.");
  await b.write({ type: "follow", target: aId, follow: true });
  await b.write({ type: "follow", target: aId, follow: true });
  assert.equal((await a.get()).followers, 1);
  assert.equal((await b.get("?scope=following")).posts[0].id, post.id);
  await b.write({ type: "delete", postId: post.id });
  assert.equal((await a.get("?scope=mine")).posts.length, 1, "A different member must not delete a post");
  await b.write({ type: "follow", target: bId, follow: true }, 400);
  await a.write({ type: "post", book: "", body: " " }, 400);
  const session = { type: "focus", sessionId: crypto.randomUUID(), minutes: 25 };
  await a.write(session);
  await a.write(session);
  assert.equal((await a.get()).focusMinutes, 25);
  assert.equal((await a.get()).sessions, 1);
  await a.write({ type: "profile", name: "Yangi ism" });
  assert.equal((await a.get()).profile.name, "Yangi ism");
  await b.write({ type: "follow", target: aId, follow: false });
  assert.equal((await a.get()).followers, 0);
  await a.write({ type: "delete", postId: post.id });
  assert.equal((await a.get("?scope=mine")).posts.length, 0);
  assert.equal((await a.send("/api/social", { method: "POST", headers: { "Content-Type": "application/json" }, body: "null" })).status, 403, "Missing Origin is rejected");
  assert.equal((await a.send("/api/social", { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: "null" })).status, 400);

  // Chat comments use the verified member identity, never a body-supplied user ID.
  const comment = await a.post("/api/app-state", { type: "comment", text: "Sinov izohi", userId: bId, name: "Soxta" });
  assert.equal(comment.status, 201);
  assert.equal((await comment.json()).comment.name, "Yangi ism");
  assert.equal(sqlite.prepare("SELECT user_id FROM comments WHERE body='Sinov izohi' ORDER BY id DESC").get().user_id, aId);

  // Admin panel: server-verified allow-list only.
  const gate = await visitor.send("/admin");
  assert.ok([302, 307].includes(gate.status) && gate.headers.get("location").includes("signin-with-chatgpt"), "Anonymous is sent to sign in");
  assert.equal((await a.send("/admin")).status, 404, "Non-admin members get 404");
  const admin = client(`test-admin-${run}`, "admin-test@example.com");
  const page = await admin.send("/admin");
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /Sahifaga tashrif buyurganlar/);
  assert.match(html, /Yangi ism/);
  console.log("PASS: anonymous visitors stored separately without identity, member-only writes, visit dedupe, admin gating, social behaviour.");
} finally {
  const memberIds = sqlite.prepare(`SELECT id FROM users WHERE auth_id IN (${authIds.map(() => "?").join(",") || "NULL"})`).all(...authIds).map(r => r.id);
  if (memberIds.length) sqlite.prepare(`DELETE FROM users WHERE id IN (${memberIds.map(() => "?").join(",")})`).run(...memberIds);
  for (const token of visitorTokens) {
    const id = "v_" + Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))), b => b.toString(16).padStart(2, "0")).join("");
    sqlite.prepare("DELETE FROM site_visitors WHERE id=?").run(id);
  }
  console.log("Test members and visitors removed from local D1.");
}
