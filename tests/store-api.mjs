import assert from "node:assert/strict";
import { sqlite } from "../scripts/local-d1.mjs";

// Bu test faqat lokal D1 previewda vaqtinchalik kitobxonlar yaratadi va oxirida o'chiradi.
import { account, origin } from "./helpers.mjs";
const ids = [];
async function reader() {
  const acc = await account();
  const cookie = acc.cookie;
  ids.push(acc.id);
  return {
    get: async () => (await fetch(`${origin}/api/store`, { headers: { Cookie: cookie } })).json(),
    post: (payload, expected = 200) => fetch(`${origin}/api/store`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(payload) })
      .then(async r => { const text = await r.text(); assert.equal(r.status, expected, text); return text ? JSON.parse(text) : null; }),
  };
}
const info = { name: "Test", phone: "+998901234567", address: "Toshkent, Chilonzor 5", payment: "click" };

try {
  const a = await reader();
  const b = await reader();
  assert.notEqual(ids[0], ids[1]);

  await a.post({ type: "cart", cart: { "atomic-habits": 2, alchemist: 1 }, promo: "BIRILM10" });
  const saved = await a.get();
  assert.deepEqual(saved.cart, { "atomic-habits": 2, alchemist: 1 });
  assert.equal(saved.promo, "BIRILM10");
  assert.deepEqual((await b.get()).cart, {}, "Boshqa kitobxon savatini ko'rmasligi kerak");

  await a.post({ type: "cart", cart: { "no-such-book": 1 }, promo: "" }, 400);
  await a.post({ type: "cart", cart: { alchemist: 11 }, promo: "" }, 400);
  await a.post({ type: "cart", cart: { alchemist: 1 }, promo: "FAKE" }, 400);

  const id = `ZB-${crypto.randomUUID().toUpperCase()}`;
  // Narx/chegirma serverda hisoblanadi: mijoz yuborgan total e'tiborga olinmaydi.
  const placed = await a.post({ type: "order", id, ...info, total: 1, cart: { "atomic-habits": 2, alchemist: 1 }, promo: "BIRILM10" });
  const order = placed.orders.find(o => o.id === id);
  assert.equal(order.subtotal, 2 * 89000 + 59000);
  assert.equal(order.discount, Math.round(order.subtotal * 0.1));
  assert.equal(order.total, order.subtotal - order.discount);
  assert.equal(order.lines.length, 2);
  assert.deepEqual(placed.cart, {});

  await a.post({ type: "order", id, ...info, cart: { alchemist: 1 }, promo: "" });
  assert.equal((await a.get()).orders.length, 1, "Qayta yuborish takroriy buyurtma yaratmasligi kerak");
  assert.equal((await b.get()).orders.length, 0);
  await b.post({ type: "order", id, ...info, cart: { alchemist: 1 }, promo: "" }, 409);

  await a.post({ type: "order", id: `ZB-${crypto.randomUUID().toUpperCase()}`, ...info, phone: "123", cart: { alchemist: 1 }, promo: "" }, 400);
  await a.post({ type: "order", id: `ZB-${crypto.randomUUID().toUpperCase()}`, ...info, payment: "bitcoin", cart: { alchemist: 1 }, promo: "" }, 400);
  await a.post({ type: "order", id: `ZB-${crypto.randomUUID().toUpperCase()}`, ...info, cart: {}, promo: "" }, 400);
  const bad = await fetch(`${origin}/api/store`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "null" });
  assert.equal(bad.status, 400);
  console.log("PASS: savat saqlash, izolyatsiya, validatsiya, serverda narx hisobi, idempotent buyurtma.");
} finally {
  if (ids.length) {
    sqlite.prepare(`DELETE FROM users WHERE id IN (${ids.map(() => "?").join(",")})`).run(...ids);
    console.log("Test ma'lumotlari o'chirildi.");
  }
}
