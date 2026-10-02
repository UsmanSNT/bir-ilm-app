import assert from "node:assert/strict";
import { sqlite } from "../scripts/local-d1.mjs";

// This test creates disposable readers only in the local D1 preview.
const origin = process.env.TEST_ORIGIN ?? "http://127.0.0.1:8787";
const ids = [];
async function reader(name) {
  const response = await fetch(`${origin}/api/social`);
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie").split(";")[0];
  assert.match(response.headers.get("set-cookie"), /HttpOnly/);
  const initial = await response.json();
  ids.push(initial.userId);
  // Community'da faqat ro'yxatdan o'tganlar yozadi — Google hisobini bog'laymiz.
  sqlite.prepare("INSERT OR IGNORE INTO auth_accounts (provider, subject, user_id, display_name) VALUES ('google', ?, ?, 'Test')").run(`test-${initial.userId}`, initial.userId);
  return {
    id: initial.userId,
    get: async (query = "") => {
      const response = await fetch(`${origin}/api/social${query}`, { headers: { Cookie: cookie } });
      assert.equal(response.status, 200);
      return response.json();
    },
    write: async (payload, expected = 200) => {
      const response = await fetch(`${origin}/api/social`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json", Origin: origin }, body: JSON.stringify({ name, ...payload }) });
      assert.equal(response.status, expected, await response.text());
    },
  };
}

try {
  const a = await reader("API test A");
  const b = await reader("API test B");
  assert.notEqual(a.id, b.id);
  await a.write({ type: "profile", bio: "Tarixiy romanlar va mutolaa." });
  assert.equal((await a.get()).profile.bio, "Tarixiy romanlar va mutolaa.");
  assert.equal((await b.get(`?author=${a.id}`)).authorProfile.bio, "Tarixiy romanlar va mutolaa.");
  await a.write({ type: "profile" });
  assert.equal((await a.get()).profile.bio, "Tarixiy romanlar va mutolaa.");
  await b.write({ type: "profile", bio: "Boshqa kitobxon" });
  assert.equal((await a.get()).profile.bio, "Tarixiy romanlar va mutolaa.");
  await a.write({ type: "profile", bio: "x".repeat(301) }, 400);
  await a.write({ type: "post", book: "O'tkan kunlar", body: "Sinov uchun kitob taassuroti." });
  const post = (await a.get("?scope=mine")).posts[0];
  assert.equal(post.book, "O'tkan kunlar");
  assert.equal(post.userId, a.id);
  await b.write({ type: "reply", postId: post.id, body: "Sinov izohi." });
  assert.equal((await a.get("?scope=mine")).posts[0].replies[0].body, "Sinov izohi.");
  await b.write({ type: "follow", target: a.id, follow: true });
  await b.write({ type: "follow", target: a.id, follow: true });
  assert.equal((await a.get()).followers, 1);
  assert.equal((await b.get("?scope=following")).posts[0].id, post.id);
  await b.write({ type: "delete", postId: post.id });
  assert.equal((await a.get("?scope=mine")).posts.length, 1, "A different reader must not delete a post");
  await b.write({ type: "follow", target: b.id, follow: true }, 400);
  await a.write({ type: "post", book: "", body: " " }, 400);
  const session = { type: "focus", sessionId: crypto.randomUUID(), minutes: 25 };
  await a.write(session);
  await a.write(session);
  assert.equal((await a.get()).focusMinutes, 25);
  assert.equal((await a.get()).sessions, 1);
  await b.write({ type: "follow", target: a.id, follow: false });
  assert.equal((await a.get()).followers, 0);
  assert.equal((await b.get("?scope=following")).posts.length, 0);
  await a.write({ type: "delete", postId: post.id });
  assert.equal((await a.get("?scope=mine")).posts.length, 0);
  const invalid = await fetch(`${origin}/api/social`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "null" });
  assert.equal(invalid.status, 400);
  const impersonation = await fetch(`${origin}/api/app-state`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "profile", userId: a.id, name: "Wrong reader" }) });
  assert.equal(impersonation.status, 403);
  console.log("PASS: distinct readers, posts, replies, filters, follow/unfollow, ownership, validation, idempotent focus sessions.");
} finally {
  if (ids.length) {
    assert.ok(ids.every(id => /^reader_[a-f0-9]{64}$/.test(id)));
    sqlite.prepare(`DELETE FROM users WHERE id IN (${ids.map(() => "?").join(",")})`).run(...ids);
    console.log("Test readers and their data removed from local D1.");
  }
}
