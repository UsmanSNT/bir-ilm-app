/** Bildirishnomalar: reaksiya, izoh, izohga javob; faqat o'qilmaganlar; tozalash. `node tests/notifications-v1.mjs` */
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
const posts = await load("app/api/v1/community/posts/route.ts");
const reactions = await load("app/api/v1/community/reactions/route.ts");
const received = await load("app/api/v1/community/reactions/received/route.ts");
const replies = await load("app/api/v1/posts/[id]/replies/route.ts");
const inbox = await load("app/api/v1/notifications/route.ts");
const read = await load("app/api/v1/notifications/read/route.ts");
const social = await load("app/api/social/route.ts");

const ORIGIN = "http://127.0.0.1:8787";
const created = [];

async function call(handler, path, { expect = 200, method = "GET", body, cookie, params } = {}) {
  const response = await handler(new Request(`${ORIGIN}${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), Origin: ORIGIN, ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), params ? { params: Promise.resolve(params) } : undefined);
  const payload = await response.json();
  assert.equal(response.status, expect, `${method} ${path} → ${response.status}: ${JSON.stringify(payload)}`);
  return { payload, response };
}

async function member(name) {
  const { payload, response } = await call(session.POST, "/api/v1/auth/session", { method: "POST", body: { platform: "web" }, expect: 201 });
  const userId = payload.data.userId;
  created.push(userId);
  sqlite.prepare("INSERT OR IGNORE INTO users (id, name) VALUES (?, ?)").run(userId, name);
  sqlite.prepare("INSERT OR IGNORE INTO auth_accounts (provider, subject, user_id, display_name) VALUES ('google', ?, ?, ?)").run(`notif-${userId}`, userId, name);
  return { userId, name, cookie: response.headers.get("set-cookie").split(";")[0] };
}

const notificationsOf = async (who) => (await call(inbox.GET, "/api/v1/notifications", { cookie: who.cookie })).payload.data;
const react = (who, postId, emoji) => call(reactions.POST, "/api/v1/community/reactions", { method: "POST", cookie: who.cookie, body: { postId, emoji } });
const legacy = (who, body, expect = 200) => call(social.POST, "/api/social", { method: "POST", cookie: who.cookie, body, expect });
const repliesOf = (postId) => sqlite.prepare("SELECT id, user_id AS userId, parent_id AS parentId FROM post_replies WHERE post_id = ? ORDER BY rowid").all(postId);

try {
  const ali = await member("Ali");
  const vali = await member("Vali");
  const soli = await member("Soli");
  const { payload } = await call(posts.POST, "/api/v1/community/posts", { method: "POST", cookie: ali.cookie, body: { format: "post", content: [{ type: "p", c: [{ t: "Atom odatlar haqida fikrim" }] }], attachments: [] }, expect: 201 });
  const postId = payload.data.id;

  // ── Reaksiya ──
  await react(vali, postId, "❤️");
  let box = await notificationsOf(ali);
  assert.equal(box.unread, 1);
  assert.deepEqual([box.items[0].type, box.items[0].emoji, box.items[0].actor.name, box.items[0].postId], ["reaction", "❤️", "Vali", postId]);
  assert.equal(box.items[0].postExcerpt, "Atom odatlar haqida fikrim");
  await react(vali, postId, "👍");
  box = await notificationsOf(ali);
  assert.equal(box.unread, 1, "Emoji almashsa — dublikat emas");
  assert.equal(box.items[0].emoji, "👍");
  await react(ali, postId, "🔥");
  assert.equal((await notificationsOf(ali)).unread, 1, "O'z postiga reaksiya — bildirishnoma yo'q");
  const got = (await call(received.GET, "/api/v1/community/reactions/received", { cookie: ali.cookie })).payload.data;
  assert.deepEqual(got.map((r) => [r.actor.name, r.emoji]), [["Vali", "👍"]], "Faollik → Reaksiyalar: faqat boshqalarniki");
  await react(vali, postId, null);
  assert.equal((await notificationsOf(ali)).unread, 0, "Reaksiya olib tashlansa — bildirishnoma ham");
  console.log("PASS: Reaksiya: egasiga bitta bildirishnoma, emoji yangilanadi, o'ziniki yo'q, olib tashlansa o'chadi; Faollik ro'yxati.");

  // ── Izoh va izohga javob ──
  await legacy(vali, { type: "reply", postId, body: "Juda foydali kitob" });
  const valiReply = repliesOf(postId)[0];
  box = await notificationsOf(ali);
  assert.deepEqual([box.unread, box.items[0].type, box.items[0].replyId, box.items[0].replyExcerpt], [1, "reply", valiReply.id, "Juda foydali kitob"]);

  await legacy(ali, { type: "reply", postId, body: "Rahmat, Vali!", parentId: valiReply.id });
  const aliAnswer = repliesOf(postId)[1];
  assert.equal(aliAnswer.parentId, valiReply.id);
  box = await notificationsOf(vali);
  assert.deepEqual([box.unread, box.items[0].type, box.items[0].actor.name], [1, "reply_to_reply", "Ali"]);
  assert.equal((await notificationsOf(ali)).unread, 1, "Post egasi o'z javobi uchun bildirishnoma olmaydi");

  // Soli Valining izohiga javob: Vali — «izohingizga javob», Ali — «postingizga izoh».
  await call(replies.POST, `/api/v1/posts/${postId}/replies`, { method: "POST", params: { id: postId }, cookie: soli.cookie, body: { body: "Men ham qo'shilaman", parentId: valiReply.id }, expect: 201 });
  assert.equal((await notificationsOf(vali)).unread, 2);
  assert.equal((await notificationsOf(ali)).unread, 2);
  // Soli Alining izohiga javob: Ali ham post egasi — bitta, aniqroq bildirishnoma.
  const { payload: toAli } = await call(replies.POST, `/api/v1/posts/${postId}/replies`, { method: "POST", params: { id: postId }, cookie: soli.cookie, body: { body: "Ali, qaysi bob?", parentId: aliAnswer.id }, expect: 201 });
  assert.equal(toAli.data.parentName, "Ali");
  box = await notificationsOf(ali);
  assert.equal(box.unread, 3);
  assert.deepEqual(box.items.filter((n) => n.replyId === toAli.data.id).map((n) => n.type), ["reply_to_reply"]);

  // Boshqa postning izohiga bog'lab bo'lmaydi.
  const { payload: other } = await call(posts.POST, "/api/v1/community/posts", { method: "POST", cookie: soli.cookie, body: { format: "post", content: [{ type: "p", c: [{ t: "Boshqa post" }] }], attachments: [] }, expect: 201 });
  await call(replies.POST, `/api/v1/posts/${other.data.id}/replies`, { method: "POST", params: { id: other.data.id }, cookie: vali.cookie, body: { body: "x", parentId: valiReply.id }, expect: 404 });

  const feed = await (await social.GET(new Request(`${ORIGIN}/api/social?post=${postId}`, { headers: { Cookie: vali.cookie } }))).json();
  const shown = feed.posts[0].replies.find((r) => r.id === aliAnswer.id);
  assert.deepEqual([shown.parentId, shown.parentName], [valiReply.id, "Vali"], "Lentada javob kimga ekani ko'rinadi");
  console.log("PASS: Izoh: post egasiga «izoh», izoh egasiga «javob»; o'ziniki va dublikat yo'q; boshqa post izohiga bog'lanmaydi; lentada parent.");

  // ── O'qildi: faqat o'qilmaganlar qoladi ──
  box = await notificationsOf(ali);
  const first = box.items[0].id;
  const { payload: marked } = await call(read.POST, "/api/v1/notifications/read", { method: "POST", cookie: ali.cookie, body: { ids: [first] } });
  assert.equal(marked.data.unread, box.unread - 1);
  assert.ok(!(await notificationsOf(ali)).items.some((n) => n.id === first), "Ochilgani ro'yxatdan chiqadi");
  const valiBox = await notificationsOf(vali);
  await call(read.POST, "/api/v1/notifications/read", { method: "POST", cookie: ali.cookie, body: { ids: [valiBox.items[0].id] } });
  assert.equal((await notificationsOf(vali)).unread, valiBox.unread, "Boshqaning bildirishnomasini o'chirib bo'lmaydi");
  await call(read.POST, "/api/v1/notifications/read", { method: "POST", cookie: ali.cookie, body: {}, expect: 422 });
  await call(read.POST, "/api/v1/notifications/read", { method: "POST", cookie: ali.cookie, body: { all: true } });
  assert.equal((await notificationsOf(ali)).unread, 0);
  console.log("PASS: O'qildi: ochilgani o'chadi, boshqaniki himoyalangan, hammasini tozalash.");

  // ── O'chirish ──
  await legacy(soli, { type: "deleteReply", replyId: valiReply.id });
  assert.ok(repliesOf(postId).some((r) => r.id === valiReply.id), "Begona izohni o'chirib bo'lmaydi");
  const before = (await notificationsOf(vali)).unread;
  const soliToVali = repliesOf(postId).find((r) => r.userId === soli.userId && r.parentId === valiReply.id);
  await legacy(soli, { type: "deleteReply", replyId: soliToVali.id });
  assert.equal((await notificationsOf(vali)).unread, before - 1, "Izoh o'chsa — bildirishnomasi ham");
  await react(soli, postId, "👏");
  assert.equal((await notificationsOf(ali)).unread, 1);
  await legacy(ali, { type: "delete", postId });
  assert.equal((await notificationsOf(ali)).unread, 0, "Post o'chsa — hammasi tozalanadi");
  assert.equal((await notificationsOf(vali)).unread, 0);
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM notifications WHERE post_id = ?").get(postId).n, 0);
  console.log("PASS: O'chirish: izoh va post bilan bildirishnomalar tozalanadi; begona izoh himoyalangan.");

  const guest = (await call(session.POST, "/api/v1/auth/session", { method: "POST", body: { platform: "web" }, expect: 201 })).response.headers.get("set-cookie").split(";")[0];
  assert.deepEqual((await call(inbox.GET, "/api/v1/notifications", { cookie: guest })).payload.data, { items: [], unread: 0 });
  console.log("PASS: Mehmon: bo'sh ro'yxat.");

  console.log("\nHAMMASI O'TDI: bildirishnomalar.");
} finally {
  if (created.length) {
    const ph = created.map(() => "?").join(",");
    sqlite.prepare(`DELETE FROM notifications WHERE user_id IN (${ph}) OR actor_id IN (${ph})`).run(...created, ...created);
    sqlite.prepare(`DELETE FROM post_reactions WHERE user_id IN (${ph})`).run(...created);
    sqlite.prepare(`DELETE FROM post_replies WHERE user_id IN (${ph})`).run(...created);
    sqlite.prepare(`DELETE FROM reading_posts WHERE user_id IN (${ph})`).run(...created);
    sqlite.prepare(`DELETE FROM auth_accounts WHERE user_id IN (${ph})`).run(...created);
    sqlite.prepare(`DELETE FROM users WHERE id IN (${ph})`).run(...created);
  }
}
