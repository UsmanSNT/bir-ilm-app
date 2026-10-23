/**
 * Loyiha jamoasi va «Biz haqimizda» testlari.
 * Route funksiyalari to'g'ridan-to'g'ri chaqiriladi (server shart emas).
 * Ishga tushirish: `node tests/team-about-v1.mjs`
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
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

// Rasmlar test uchun vaqtinchalik papkaga yoziladi.
const mediaDir = mkdtempSync(path.join(tmpdir(), "bir-team-"));
process.env.BIR_ILM_MEDIA_DIR = mediaDir;

const { sqlite } = await import(d1Module);
const load = (p) => import(new URL(p, projectRoot).href);
const session = await load("app/api/v1/auth/session/route.ts");
const team = await load("app/api/v1/site/team/route.ts");
const member = await load("app/api/v1/site/team/[id]/route.ts");
const move = await load("app/api/v1/site/team/[id]/move/route.ts");
const photo = await load("app/api/v1/site/team/[id]/photo/route.ts");
const media = await load("app/media/team/[file]/route.ts");
const about = await load("app/api/v1/site/about/route.ts");
const { normalizeHandle, normalizeWebsite, resolveAboutVideo, readStoredAbout, DEFAULT_ABOUT, TEAM_LIMITS } = await load("shared/contract/index.ts");

const ORIGIN = "http://127.0.0.1:8787";
const createdUsers = [];
const createdMembers = [];
const aboutBefore = sqlite.prepare("SELECT value FROM site_settings WHERE key = 'about'").get();

async function client() {
  const response = await session.POST(new Request(`${ORIGIN}/api/v1/auth/session`, { method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN }, body: JSON.stringify({ platform: "web", wantToken: false }) }));
  const payload = await response.json();
  const cookie = response.headers.get("set-cookie").split(";")[0];
  createdUsers.push(payload.data.userId);
  const send = async (handler, path, { params, expect = 200, method = "GET", body, raw, type } = {}) => {
    const headers = { Cookie: cookie, Origin: ORIGIN };
    if (raw) headers["Content-Type"] = type;
    else if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await handler(new Request(`${ORIGIN}${path}`, { method, headers, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) }), params ? { params: Promise.resolve(params) } : undefined);
    const payload = await res.json();
    assert.equal(res.status, expect, `${method} ${path} → ${res.status}: ${JSON.stringify(payload)}`);
    return payload;
  };
  return { userId: payload.data.userId, call: send };
}

const names = (items) => items.filter((m) => createdMembers.includes(m.id)).map((m) => m.name);

try {
  // --- Ijtimoiy tarmoq nomini normallash --------------------------------------
  assert.equal(normalizeHandle("telegram", "@bir_ilm"), "bir_ilm");
  assert.equal(normalizeHandle("telegram", "https://t.me/bir_ilm"), "bir_ilm");
  assert.equal(normalizeHandle("telegram", "t.me/bir_ilm?x=1"), "bir_ilm");
  assert.equal(normalizeHandle("instagram", "instagram.com/bir.ilm/"), "bir.ilm");
  assert.equal(normalizeHandle("instagram", "  "), "");
  for (const [kind, bad] of [["telegram", "abc"], ["telegram", "https://evil.example/bir_ilm"], ["telegram", "javascript:alert(1)"], ["instagram", "bir ilm"], ["instagram", "https://t.me/birilm"]]) {
    assert.equal(normalizeHandle(kind, bad), null, `${kind}: ${bad}`);
  }
  assert.equal(normalizeWebsite("birilm.uz/jamoa"), "https://birilm.uz/jamoa");
  assert.equal(normalizeWebsite("http://example.com"), "https://example.com/");
  assert.equal(normalizeWebsite(""), "");
  for (const bad of ["javascript:alert(1)", "https://user:pw@example.com", "localhost", "ftp://example.com", "https://example."]) assert.equal(normalizeWebsite(bad), null, bad);
  console.log("PASS: Telegram/Instagram: @nom, nom va havola bitta nomga keltiriladi; veb-sayt faqat https, begona va xavfli havolalar rad etiladi.");

  // --- «Biz haqimizda» videosi ------------------------------------------------
  assert.equal(resolveAboutVideo("").kind, "file", "Bo'sh — ilova bilan kelgan video");
  assert.equal(resolveAboutVideo("https://youtu.be/dQw4w9WgXcQ").kind, "embed");
  assert.equal(resolveAboutVideo("https://cdn.example.com/a/intro.mp4").src, "https://cdn.example.com/a/intro.mp4");
  for (const bad of ["http://cdn.example.com/intro.mp4", "javascript:alert(1)", "https://evil.example/page", "/etc/passwd"]) assert.equal(resolveAboutVideo(bad), null, bad);
  assert.deepEqual(readStoredAbout("{buzilgan"), DEFAULT_ABOUT);
  assert.deepEqual(readStoredAbout(JSON.stringify({ intro: "A", anchor: { number: 3, date: "2026-10-25" } })).anchor, DEFAULT_ABOUT.anchor, "Shanba bo'lmagan sana standartga qaytadi");
  console.log("PASS: Video havolasi: bo'sh — ilova videosi, faqat https va ma'lum platformalar qabul qilinadi.");

  // --- Jamoa: ruxsatlar ---------------------------------------------------------
  const admin = await client();
  const user = await client();
  sqlite.prepare("INSERT INTO users (id, role) VALUES (?, 'admin') ON CONFLICT(id) DO UPDATE SET role = 'admin'").run(admin.userId);

  const publicBefore = (await user.call(team.GET, "/api/v1/site/team")).data.items;
  assert.ok(publicBefore.every((m) => m.visible), "Ommaviy ro'yxatda faqat ko'rinadiganlar");
  await user.call(team.GET, "/api/v1/site/team?all=1", { expect: 403 });
  await user.call(team.POST, "/api/v1/site/team", { method: "POST", body: { name: "Begona" }, expect: 403 });
  await admin.call(team.POST, "/api/v1/site/team", { method: "POST", body: { name: "" }, expect: 422 });
  await admin.call(team.POST, "/api/v1/site/team", { method: "POST", body: { name: "X", telegram: "https://evil.example/x" }, expect: 422 });
  await admin.call(team.POST, "/api/v1/site/team", { method: "POST", body: { name: "X", youtube: "https://evil.example/@x" }, expect: 422 });
  await admin.call(team.POST, "/api/v1/site/team", { method: "POST", body: { name: "X", website: "javascript:alert(1)" }, expect: 422 });

  // --- Qo'shish: oxiriga tushadi ---------------------------------------------
  for (const [name, extra] of [["Test Birinchi", { telegram: "@test_birinchi", instagram: "instagram.com/test.birinchi", youtube: "youtube.com/@birilm", facebook: "facebook.com/birilm", website: "birilm.uz" }], ["Test Ikkinchi", {}], ["Test Uchinchi", { visible: false }]]) {
    const items = (await admin.call(team.POST, "/api/v1/site/team", { method: "POST", body: { name, role: "Sinov", ...extra }, expect: 201 })).data.items;
    createdMembers.push(items.at(-1).id);
    assert.equal(items.at(-1).name, name, "Yangi a'zo ro'yxat oxirida");
  }
  const [first, second, third] = createdMembers;
  let all = (await admin.call(team.GET, "/api/v1/site/team?all=1")).data.items;
  assert.deepEqual(names(all), ["Test Birinchi", "Test Ikkinchi", "Test Uchinchi"]);
  assert.equal(all.find((m) => m.id === first).telegram, "test_birinchi");
  assert.equal(all.find((m) => m.id === first).instagram, "test.birinchi");
  assert.equal(all.find((m) => m.id === first).youtube, "https://youtube.com/@birilm");
  assert.equal(all.find((m) => m.id === first).facebook, "https://facebook.com/birilm");
  assert.equal(all.find((m) => m.id === first).website, "https://birilm.uz/");
  assert.equal(all.find((m) => m.id === second).website, "", "Yuborilmagan havola bo'sh qoladi");
  assert.ok(!(await user.call(team.GET, "/api/v1/site/team")).data.items.some((m) => m.id === third), "Yashirin a'zo ommaga ko'rinmaydi");

  // --- Tartiblash ---------------------------------------------------------------
  await user.call(move.POST, `/api/v1/site/team/${second}/move`, { method: "POST", params: { id: second }, body: { direction: "up" }, expect: 403 });
  all = (await admin.call(move.POST, `/api/v1/site/team/${second}/move`, { method: "POST", params: { id: second }, body: { direction: "up" } })).data.items;
  assert.deepEqual(names(all), ["Test Ikkinchi", "Test Birinchi", "Test Uchinchi"]);
  const orders = all.map((m) => m.sortOrder);
  assert.deepEqual(orders, orders.map((_, i) => i + 1), "Tartib 1..n, takrorsiz");
  const edge = all[0].id;
  assert.deepEqual((await admin.call(move.POST, `/api/v1/site/team/${edge}/move`, { method: "POST", params: { id: edge }, body: { direction: "up" } })).data.items.map((m) => m.id), all.map((m) => m.id), "Eng yuqoridagini yuqoriga surish o'zgartirmaydi");
  await admin.call(move.POST, `/api/v1/site/team/${second}/move`, { method: "POST", params: { id: second }, body: { direction: "sideways" }, expect: 422 });

  // --- Tahrirlash ---------------------------------------------------------------
  await user.call(member.PUT, `/api/v1/site/team/${third}`, { method: "PUT", params: { id: third }, body: { name: "Buzg'unchi" }, expect: 403 });
  all = (await admin.call(member.PUT, `/api/v1/site/team/${third}`, { method: "PUT", params: { id: third }, body: { name: "Test Uchinchi", bio: "Endi ko'rinadi", visible: true } })).data.items;
  assert.equal(all.find((m) => m.id === third).bio, "Endi ko'rinadi");
  assert.ok((await user.call(team.GET, "/api/v1/site/team")).data.items.some((m) => m.id === third));
  await admin.call(member.PUT, "/api/v1/site/team/team_yoq", { method: "PUT", params: { id: "team_yoq" }, body: { name: "Yo'q" }, expect: 404 });
  console.log("PASS: Jamoa: faqat admin boshqaradi, yangi a'zo oxiriga qo'shiladi, tartib va yashirish ishlaydi.");

  // --- Sobiq a'zolar, davr va avatar --------------------------------------------
  await admin.call(team.POST, "/api/v1/site/team", { method: "POST", body: { name: "X", avatar: "robot" }, expect: 422 });
  await admin.call(team.POST, "/api/v1/site/team", { method: "POST", body: { name: "X", period: "2".repeat(TEAM_LIMITS.period + 1) }, expect: 422 });
  await admin.call(team.POST, "/api/v1/site/team", { method: "POST", body: { name: "X", former: "ha" }, expect: 422 });
  const addMember = async (body) => {
    const items = (await admin.call(team.POST, "/api/v1/site/team", { method: "POST", body, expect: 201 })).data.items;
    const created = items.find((m) => m.name === body.name);
    createdMembers.push(created.id);
    return created;
  };
  const alumnus = await addMember({ name: "Test Sobiq", role: "Loyiha asoschisi", period: "2022–2024", avatar: "man", former: true });
  const alumna = await addMember({ name: "Test Sobiq Ikki", avatar: "woman", former: true });
  assert.deepEqual([alumnus.former, alumnus.avatar, alumnus.period], [true, "man", "2022–2024"]);
  const plain = all.find((m) => m.id === first);
  assert.deepEqual([plain.former, plain.avatar, plain.period], [false, null, ""], "Yuborilmagan maydonlar standart: hozirgi jamoa, avatarsiz, davrsiz");
  all = (await admin.call(team.GET, "/api/v1/site/team?all=1")).data.items;
  assert.deepEqual(names(all), ["Test Ikkinchi", "Test Birinchi", "Test Uchinchi", "Test Sobiq", "Test Sobiq Ikki"], "Hozirgi jamoa avval, sobiq a'zolar keyin");
  const publicNames = names((await user.call(team.GET, "/api/v1/site/team")).data.items);
  assert.ok(publicNames.includes("Test Sobiq") && publicNames.includes("Test Sobiq Ikki"), "Sobiq a'zolar ommaga ham ko'rinadi");

  // Tartiblash faqat o'z guruhi ichida.
  const orderAfter = async (id, direction) => names((await admin.call(move.POST, `/api/v1/site/team/${id}/move`, { method: "POST", params: { id }, body: { direction } })).data.items);
  assert.deepEqual(await orderAfter(alumna.id, "up"), ["Test Ikkinchi", "Test Birinchi", "Test Uchinchi", "Test Sobiq Ikki", "Test Sobiq"]);
  assert.deepEqual(await orderAfter(alumna.id, "up"), ["Test Ikkinchi", "Test Birinchi", "Test Uchinchi", "Test Sobiq Ikki", "Test Sobiq"], "Sobiqlar ro'yxati boshidagi hozirgi jamoaga o'tmaydi");
  assert.deepEqual(await orderAfter(third, "down"), ["Test Ikkinchi", "Test Birinchi", "Test Uchinchi", "Test Sobiq Ikki", "Test Sobiq"], "Hozirgi jamoa oxiridagi sobiqlarga o'tmaydi");

  // Guruhni almashtirish — yangi guruhning oxiriga.
  const base = { name: "Test Uchinchi", bio: "", visible: true };
  all = (await admin.call(member.PUT, `/api/v1/site/team/${third}`, { method: "PUT", params: { id: third }, body: { ...base, former: true, period: "2023" } })).data.items;
  assert.deepEqual(names(all), ["Test Ikkinchi", "Test Birinchi", "Test Sobiq Ikki", "Test Sobiq", "Test Uchinchi"]);
  assert.equal(all.find((m) => m.id === third).period, "2023");
  all = (await admin.call(member.PUT, `/api/v1/site/team/${third}`, { method: "PUT", params: { id: third }, body: { ...base, former: false } })).data.items;
  assert.deepEqual(names(all), ["Test Ikkinchi", "Test Birinchi", "Test Uchinchi", "Test Sobiq Ikki", "Test Sobiq"], "Qaytsa hozirgi jamoa oxiriga tushadi");
  const orders2 = all.map((m) => m.sortOrder);
  assert.equal(new Set(orders2).size, orders2.length, "Tartib raqamlari takrorlanmaydi");
  all = (await admin.call(member.PUT, `/api/v1/site/team/${alumnus.id}`, { method: "PUT", params: { id: alumnus.id }, body: { name: "Test Sobiq", avatar: null, former: true } })).data.items;
  assert.equal(all.find((m) => m.id === alumnus.id).avatar, null, "Avatarni olib tashlash mumkin");
  console.log("PASS: Sobiq a'zolar alohida guruhda, avatar va davr saqlanadi, tartiblash guruh ichida ishlaydi.");

  // --- Rasm ---------------------------------------------------------------------
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]);
  const fake = new TextEncoder().encode("<svg onload=alert(1)>");
  await user.call(photo.POST, `/api/v1/site/team/${first}/photo`, { method: "POST", params: { id: first }, raw: png, type: "image/png", expect: 403 });
  await admin.call(photo.POST, `/api/v1/site/team/${first}/photo`, { method: "POST", params: { id: first }, raw: fake, type: "image/png", expect: 400 });
  await admin.call(photo.POST, `/api/v1/site/team/${first}/photo`, { method: "POST", params: { id: first }, raw: png, type: "image/svg+xml", expect: 400 });
  all = (await admin.call(photo.POST, `/api/v1/site/team/${first}/photo`, { method: "POST", params: { id: first }, raw: png, type: "image/png" })).data.items;
  const url = all.find((m) => m.id === first).photoUrl;
  assert.match(url, /^\/media\/team\/[a-z0-9]{16,32}\.png$/);
  const file = url.split("/").pop();
  const served = await media.GET(new Request(`${ORIGIN}${url}`), { params: Promise.resolve({ file }) });
  assert.equal(served.status, 200);
  assert.equal(served.headers.get("content-type"), "image/png");
  assert.deepEqual(new Uint8Array(await served.arrayBuffer()), png);
  assert.equal((await media.GET(new Request(`${ORIGIN}/media/team/..%2Fx`), { params: Promise.resolve({ file: "../../etc/passwd" }) })).status, 404, "Yo'l bilan chiqib bo'lmaydi");

  // Almashtirilganda eski fayl o'chadi.
  all = (await admin.call(photo.POST, `/api/v1/site/team/${first}/photo`, { method: "POST", params: { id: first }, raw: png, type: "image/png" })).data.items;
  assert.notEqual(all.find((m) => m.id === first).photoUrl, url);
  assert.equal(existsSync(path.join(mediaDir, "team", file)), false, "Eski rasm diskdan o'chdi");
  const second_url = all.find((m) => m.id === first).photoUrl;
  all = (await admin.call(photo.DELETE, `/api/v1/site/team/${first}/photo`, { method: "DELETE", params: { id: first } })).data.items;
  assert.equal(all.find((m) => m.id === first).photoUrl, null);
  assert.equal(existsSync(path.join(mediaDir, "team", second_url.split("/").pop())), false);
  console.log("PASS: Jamoa rasmi: faqat haqiqiy JPG/PNG/WebP, almashtirilganda va o'chirilganda eski fayl o'chadi.");

  // --- O'chirish ----------------------------------------------------------------
  await user.call(member.DELETE, `/api/v1/site/team/${second}`, { method: "DELETE", params: { id: second }, expect: 403 });
  all = (await admin.call(member.DELETE, `/api/v1/site/team/${second}`, { method: "DELETE", params: { id: second } })).data.items;
  assert.ok(!all.some((m) => m.id === second));
  await admin.call(member.DELETE, `/api/v1/site/team/${second}`, { method: "DELETE", params: { id: second }, expect: 404 });
  console.log("PASS: Jamoa a'zosini faqat admin o'chiradi.");

  // --- «Biz haqimizda» ------------------------------------------------------------
  sqlite.prepare("DELETE FROM site_settings WHERE key = 'about'").run();
  assert.deepEqual((await user.call(about.GET, "/api/v1/site/about")).data, DEFAULT_ABOUT);
  const body = { intro: "Salom.\n\nIkkinchi xatboshi.", videoUrl: "https://youtu.be/dQw4w9WgXcQ", anchor: { number: 248, date: "2026-10-24" } };
  await user.call(about.PUT, "/api/v1/site/about", { method: "PUT", body, expect: 403 });
  await admin.call(about.PUT, "/api/v1/site/about", { method: "PUT", body: { ...body, anchor: { number: 248, date: "2026-10-25" } }, expect: 422 });
  await admin.call(about.PUT, "/api/v1/site/about", { method: "PUT", body: { ...body, anchor: { number: 0, date: "2026-10-24" } }, expect: 422 });
  await admin.call(about.PUT, "/api/v1/site/about", { method: "PUT", body: { ...body, videoUrl: "https://evil.example/x" }, expect: 422 });
  await admin.call(about.PUT, "/api/v1/site/about", { method: "PUT", body: { ...body, intro: "  " }, expect: 422 });
  assert.deepEqual((await admin.call(about.PUT, "/api/v1/site/about", { method: "PUT", body })).data, body);
  assert.deepEqual((await user.call(about.GET, "/api/v1/site/about")).data, body, "Hamma o'qiydi");
  console.log("PASS: «Biz haqimizda»: hamma o'qiydi, faqat admin o'zgartiradi, shanba bo'lmagan sana va begona video rad etiladi.");

  console.log("\nHAMMASI O'TDI: jamoa va «Biz haqimizda».");
} finally {
  if (createdMembers.length) sqlite.prepare(`DELETE FROM team_members WHERE id IN (${createdMembers.map(() => "?").join(",")})`).run(...createdMembers);
  if (aboutBefore) sqlite.prepare("INSERT INTO site_settings (key, value) VALUES ('about', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(aboutBefore.value);
  else sqlite.prepare("DELETE FROM site_settings WHERE key = 'about'").run();
  const unique = [...new Set(createdUsers)];
  if (unique.length) sqlite.prepare(`DELETE FROM users WHERE id IN (${unique.map(() => "?").join(",")})`).run(...unique);
  rmSync(mediaDir, { recursive: true, force: true });
}
