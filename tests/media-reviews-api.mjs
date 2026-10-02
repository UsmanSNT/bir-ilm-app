import assert from "node:assert/strict";
import { sqlite } from "../scripts/local-d1.mjs";

// Lokal D1/R2 previewda vaqtinchalik kitobxonlar yaratadi va oxirida o'chiradi.
const origin = "http://127.0.0.1:8787";
const ids = [];
const keys = [];
async function reader() {
  const res = await fetch(`${origin}/api/social`);
  assert.equal(res.status, 200);
  const cookie = res.headers.get("set-cookie").split(";")[0];
  ids.push((await res.json()).userId);
  const call = async (path, init = {}, expected = 200) => {
    const r = await fetch(`${origin}${path}`, { ...init, headers: { Cookie: cookie, Origin: origin, ...(init.headers ?? {}) } });
    const text = await r.text();
    assert.equal(r.status, expected, `${path}: ${text}`);
    return text ? JSON.parse(text) : null;
  };
  return {
    call,
    post: (payload, expected) => call("/api/social", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Test", ...payload }) }, expected),
    feed: q => call(`/api/social${q ?? "?scope=mine"}`),
    upload: (bytes, expected) => call("/api/media", { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: bytes }, expected),
    review: (payload, expected) => call("/api/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Test", ...payload }) }, expected),
  };
}
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, ...new Array(200).fill(7)]);
const mp4 = new Uint8Array([0, 0, 0, 24, ...new TextEncoder().encode("ftypisom"), ...new Array(500).fill(1)]);

try {
  const a = await reader();
  const b = await reader();

  // Media: turi baytlardan aniqlanadi, soxta fayl rad etiladi.
  const img = await a.upload(png);
  keys.push(img.key);
  assert.equal(img.type, "image");
  assert.match(img.key, /^[a-f0-9]{32}\.png$/);
  await a.upload(new TextEncoder().encode("<html><script>alert(1)</script></html>"), 415);
  const vid = await a.upload(mp4);
  keys.push(vid.key);
  assert.equal(vid.type, "video");

  const got = await fetch(`${origin}/api/media?k=${img.key}`);
  assert.equal(got.status, 200);
  assert.equal(got.headers.get("content-type"), "image/png");
  assert.equal(got.headers.get("x-content-type-options"), "nosniff");
  assert.equal(new Uint8Array(await got.arrayBuffer()).length, png.length);
  const part = await fetch(`${origin}/api/media?k=${vid.key}`, { headers: { Range: "bytes=0-9" } });
  assert.equal(part.status, 206);
  assert.equal(part.headers.get("content-range"), `bytes 0-9/${mp4.length}`);
  assert.equal((await part.arrayBuffer()).byteLength, 10);
  assert.equal((await fetch(`${origin}/api/media?k=../../etc/passwd`)).status, 404);

  // Boshqa kitobxon faylini o'z postiga biriktira olmaydi.
  await b.post({ type: "post", mediaKey: img.key, body: "o'g'irlik" }, 404);
  await a.post({ type: "post", mediaKey: img.key, body: "Bugungi mutolaa burchagim", book: "Atom odatlar" });
  let post = (await a.feed()).posts[0];
  assert.equal(post.mediaKey, img.key);
  assert.equal(post.mediaType, "image");

  // Karta dizayni server tomonda tekshiriladi va normallashtiriladi.
  const design = { bg: "sunset", font: "serif", text: "  Ilm — nur  ", stickers: [{ e: "📚", x: 150, y: -5, s: 9 }] };
  await a.post({ type: "post", design, body: "" });
  post = (await a.feed()).posts[0];
  assert.deepEqual(post.design, { bg: "sunset", font: "serif", text: "Ilm — nur", stickers: [{ e: "📚", x: 100, y: 0, s: 2.5 }] });
  await a.post({ type: "post", design: { ...design, bg: "url(javascript:alert(1))" } }, 400);
  await a.post({ type: "post", design: { ...design, stickers: [{ e: "<img>", x: 1, y: 1, s: 1 }] } }, 400);
  await a.post({ type: "post", design, mediaKey: vid.key }, 400);
  await a.post({ type: "post", body: "" }, 400);

  // Media posti o'chirilsa fayl ham o'chadi.
  const mediaPost = (await a.feed()).posts.find(p => p.mediaKey === img.key);
  await a.post({ type: "delete", postId: mediaPost.id });
  assert.equal((await fetch(`${origin}/api/media?k=${img.key}`)).status, 404);

  // Kitob sharhlari: bitta kitobxon — bitta sharh (yangilanadi), o'rtacha baho haqiqiy.
  // Bazada oldindan sharhlar bo'lishi mumkin, shuning uchun boshlang'ich holatga nisbatan tekshiriladi.
  const base = (await a.call("/api/reviews?book=alchemist")).reviews;
  const baseSum = base.reduce((n, x) => n + x.rating, 0);
  await a.review({ bookId: "alchemist", rating: 5, body: "Ajoyib" });
  await a.review({ bookId: "alchemist", rating: 4, body: "Yaxshi" });
  await b.review({ bookId: "alchemist", rating: 2, body: "" });
  let r = await a.call("/api/reviews?book=alchemist");
  assert.equal(r.summary.count, base.length + 2);
  assert.equal(r.summary.avg, Math.round(((baseSum + 4 + 2) / (base.length + 2)) * 10) / 10);
  assert.equal(r.reviews.find(x => x.mine).body, "Yaxshi");
  assert.equal(r.reviews.filter(x => x.mine).length, 1);
  await a.review({ bookId: "alchemist", rating: 6 }, 400);
  await a.review({ bookId: "alchemist", rating: 3.5 }, 400);
  await a.review({ bookId: "no-book", rating: 3 }, 404);
  await a.review({ bookId: "alchemist", rating: 4, body: "x".repeat(1001) }, 400);
  const all = await a.call("/api/reviews");
  assert.equal(all.summaries.alchemist.count, base.length + 2);
  await b.review({ bookId: "alchemist", type: "delete" });
  r = await a.call("/api/reviews?book=alchemist");
  assert.equal(r.summary.count, base.length + 1);
  const cross = await fetch(`${origin}/api/reviews`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://evil.example" }, body: JSON.stringify({ bookId: "alchemist", rating: 1 }) });
  assert.equal(cross.status, 403);
  console.log("PASS: media upload/sniff/range/ownership/cleanup, design validation, book reviews.");
} finally {
  if (ids.length) sqlite.prepare(`DELETE FROM users WHERE id IN (${ids.map(() => "?").join(",")})`).run(...ids);
  const { env } = await import("../scripts/local-d1.mjs");
  for (const key of keys) await env.BUCKET.delete(key);
  console.log("Test ma'lumotlari o'chirildi.");
}
