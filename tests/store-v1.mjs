/**
 * Book Store (/api/v1/store, sharhlar, admin buyurtmalar) integratsion testlari.
 * Route funksiyalari to'g'ridan-to'g'ri chaqiriladi (server shart emas).
 * Ishga tushirish: `node tests/store-v1.mjs`
 */
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
const booksRoute = await load("app/api/v1/books/route.ts");
const bookRoute = await load("app/api/v1/books/[id]/route.ts");
const storeBooks = await load("app/api/v1/store/books/route.ts");
const cart = await load("app/api/v1/store/cart/route.ts");
const orders = await load("app/api/v1/store/orders/route.ts");
const ai = await load("app/api/v1/store/ai/route.ts");
const reviews = await load("app/api/v1/books/[id]/reviews/route.ts");
const adminOrders = await load("app/api/v1/admin/orders/route.ts");
const adminOrder = await load("app/api/v1/admin/orders/[id]/route.ts");
const chat = await load("app/api/v1/store/chat/route.ts");
const chatImage = await load("app/api/v1/store/chat/image/route.ts");
const adminChats = await load("app/api/v1/admin/store-chat/route.ts");
const adminChat = await load("app/api/v1/admin/store-chat/[userId]/route.ts");
const adminChatImage = await load("app/api/v1/admin/store-chat/[userId]/image/route.ts");
const chatFile = await load("app/media/store-chat/[uid]/[file]/route.ts");

const ORIGIN = "http://127.0.0.1:8787";
const { mkdtemp, rm: removeDir } = await import("node:fs/promises");
const { tmpdir } = await import("node:os");
const pathMod = await import("node:path");
const mediaDir = await mkdtemp(pathMod.join(tmpdir(), "bir-ilm-chat-"));
process.env.BIR_ILM_MEDIA_DIR = mediaDir;
const createdUsers = [];
const createdBooks = [];

async function call(handler, path, { params, expect = 200, method = "GET", body, headers = {} } = {}) {
  const response = await handler(
    new Request(`${ORIGIN}${path}`, {
      method,
      headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    params ? { params: Promise.resolve(params) } : undefined,
  );
  const payload = await response.json();
  assert.equal(response.status, expect, `${method} ${path} → ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}

async function client() {
  const response = await session.POST(
    new Request(`${ORIGIN}/api/v1/auth/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN },
      body: JSON.stringify({ platform: "web", wantToken: false }),
    }),
  );
  const payload = await response.json();
  const cookie = response.headers.get("set-cookie").split(";")[0];
  createdUsers.push(payload.data.userId);
  return {
    userId: payload.data.userId,
    cookie,
    call: (handler, path, options = {}) => call(handler, path, { ...options, headers: { Cookie: cookie, Origin: ORIGIN, ...options.headers } }),
  };
}

const signIn = (userId, name = "Test") => {
  sqlite.prepare("INSERT INTO users (id, name) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name").run(userId, name);
  sqlite.prepare("INSERT OR IGNORE INTO auth_accounts (provider, subject, user_id, display_name) VALUES ('google', ?, ?, 'Test')").run(`store-test-${userId}`, userId);
};
const promote = (userId) => sqlite.prepare("INSERT INTO users (id, role) VALUES (?, 'admin') ON CONFLICT(id) DO UPDATE SET role = 'admin'").run(userId);
const orderId = () => `BI-${crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;

try {
  const admin = await client();
  const buyer = await client();
  const other = await client();
  const guest = await client();
  promote(admin.userId);
  signIn(buyer.userId, "Xaridor");
  signIn(other.userId, "Boshqa");

  // --- Narx: admin qo'yadi; narxsiz kitob do'konda yo'q -----------------
  const forSale = (await admin.call(booksRoute.POST, "/api/v1/books", { method: "POST", body: { kind: "store", title: "Do'kon kitobi", author: "Muallif", price: 59000, category: "Badiiy adabiyot" }, expect: 201 })).data;
  const notForSale = (await admin.call(booksRoute.POST, "/api/v1/books", { method: "POST", body: { kind: "store", title: "Narxsiz mahsulot", author: "Muallif" }, expect: 201 })).data;
  createdBooks.push(forSale.id, notForSale.id);
  assert.equal(forSale.price, 59000);
  assert.equal(notForSale.price, 0);
  await buyer.call(bookRoute.PATCH, `/api/v1/books/${forSale.id}`, { method: "PATCH", params: { id: forSale.id }, body: { price: 1 }, expect: 403 });
  // Narxsiz PATCH narxni o'chirmasin (partial).
  const renamed = (await admin.call(bookRoute.PATCH, `/api/v1/books/${forSale.id}`, { method: "PATCH", params: { id: forSale.id }, body: { summary: "Yangi tavsif" } })).data;
  assert.equal(renamed.price, 59000, "Qisman tahrir narxni saqlashi kerak");

  let vitrina = (await guest.call(storeBooks.GET, "/api/v1/store/books")).data.items;
  assert.ok(vitrina.some((b) => b.id === forSale.id));
  assert.ok(!vitrina.some((b) => b.id === notForSale.id), "Narxsiz kitob vitrinada bo'lmasin");
  // Ikki ro'yxat aralashmaydi: kutubxona (suhbat) kitobi do'konda yo'q, do'kon mahsuloti kutubxonada yo'q.
  const libraryBook = (await admin.call(booksRoute.POST, "/api/v1/books", { method: "POST", body: { title: "Suhbat kitobi", author: "Muallif", price: 99000, category: "Tarix" }, expect: 201 })).data;
  createdBooks.push(libraryBook.id);
  assert.equal(libraryBook.kind, "library");
  assert.equal(libraryBook.price, 0, "Kutubxona kitobida narx bo'lmaydi");
  const patched = (await admin.call(bookRoute.PATCH, `/api/v1/books/${libraryBook.id}`, { method: "PATCH", params: { id: libraryBook.id }, body: { price: 5000, category: "Tarix" } })).data;
  assert.equal(patched.price, 0, "Kutubxona kitobiga narx qo'yib bo'lmaydi");
  const lib = (await guest.call(booksRoute.GET, "/api/v1/books")).data.items;
  assert.ok(lib.some((b) => b.id === libraryBook.id));
  assert.ok(!lib.some((b) => b.id === forSale.id || b.id === notForSale.id), "Do'kon mahsuloti kutubxona ro'yxatida bo'lmasin");
  assert.ok(!(await guest.call(storeBooks.GET, "/api/v1/store/books")).data.items.some((b) => b.id === libraryBook.id), "Kutubxona kitobi do'konda bo'lmasin");
  await guest.call(booksRoute.GET, "/api/v1/books?kind=store", { expect: 403 });
  await buyer.call(booksRoute.GET, "/api/v1/books?kind=store", { expect: 403 });
  const products = (await admin.call(booksRoute.GET, "/api/v1/books?kind=store")).data.items;
  assert.deepEqual(products.map((b) => b.id).sort(), [forSale.id, notForSale.id].sort(), "Admin do'kon ro'yxatida narxsizlarni ham ko'radi");
  const activated = (await admin.call(bookRoute.PATCH, `/api/v1/books/${forSale.id}`, { method: "PATCH", params: { id: forSale.id }, body: { active: true } })).data;
  assert.equal(activated.active, false, "Do'kon mahsuloti haftaning kitobi bo'lmaydi");
  await admin.call(cart.PUT, "/api/v1/store/cart", { method: "PUT", body: { items: [{ bookId: libraryBook.id, qty: 1 }] }, expect: 422 });
  console.log("PASS: Vitrina faqat narxi qo'yilgan kitoblar; narxni faqat admin o'zgartiradi.");

  // --- Savat: mehmon ham to'ldiradi; faqat sotuvdagi kitob; validatsiya --
  const guestCart = (await guest.call(cart.PUT, "/api/v1/store/cart", { method: "PUT", body: { items: [{ bookId: forSale.id, qty: 2 }] } })).data.items;
  assert.deepEqual(guestCart, [{ bookId: forSale.id, qty: 2 }]);
  await guest.call(cart.PUT, "/api/v1/store/cart", { method: "PUT", body: { items: [{ bookId: notForSale.id, qty: 1 }] }, expect: 422 });
  await guest.call(cart.PUT, "/api/v1/store/cart", { method: "PUT", body: { items: [{ bookId: forSale.id, qty: 11 }] }, expect: 422 });
  await guest.call(cart.PUT, "/api/v1/store/cart", { method: "PUT", body: { items: [{ bookId: forSale.id, qty: 1 }, { bookId: forSale.id, qty: 1 }] }, expect: 422 });
  await call(cart.PUT, "/api/v1/store/cart", { method: "PUT", body: { items: [] }, headers: { Origin: "https://evil.example" }, expect: 403 });
  assert.deepEqual((await other.call(cart.GET, "/api/v1/store/cart")).data.items, [], "Savat foydalanuvchilar orasida aralashmasin");
  console.log("PASS: Savat serverda; boshqa foydalanuvchidan ajratilgan; validatsiya va CSRF.");

  // --- Buyurtma: mehmon bera olmaydi; narx serverdan; idempotent ---------
  const order = { id: orderId(), name: "Xaridor", phone: "+998 90 123 45 67", address: "Toshkent, Chilonzor 1-uy", payment: "cash" };
  await guest.call(orders.POST, "/api/v1/store/orders", { method: "POST", body: order, expect: 401 });
  await buyer.call(orders.POST, "/api/v1/store/orders", { method: "POST", body: order, expect: 400 }); // savat bo'sh
  await buyer.call(cart.PUT, "/api/v1/store/cart", { method: "PUT", body: { items: [{ bookId: forSale.id, qty: 3 }] } });
  await buyer.call(orders.POST, "/api/v1/store/orders", { method: "POST", body: { ...order, phone: "12345" }, expect: 422 });
  const placed = (await buyer.call(orders.POST, "/api/v1/store/orders", { method: "POST", body: order, expect: 201 })).data;
  assert.equal(placed.total, 3 * 59000, "Summa bazadagi narxdan");
  assert.equal(placed.phone, "+998901234567");
  assert.equal(placed.status, "new");
  assert.deepEqual((await buyer.call(cart.GET, "/api/v1/store/cart")).data.items, [], "Buyurtmadan keyin savat bo'sh");
  // Narx keyin o'zgarsa ham buyurtma o'zgarmaydi; takroriy yuborish o'sha buyurtmani qaytaradi.
  await admin.call(bookRoute.PATCH, `/api/v1/books/${forSale.id}`, { method: "PATCH", params: { id: forSale.id }, body: { price: 99000 } });
  const again = (await buyer.call(orders.POST, "/api/v1/store/orders", { method: "POST", body: order, expect: 201 })).data;
  assert.equal(again.total, placed.total);
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM store_orders WHERE id = ?").get(order.id).n, 1);
  await other.call(orders.POST, "/api/v1/store/orders", { method: "POST", body: order, expect: 409 });
  const mine = (await buyer.call(orders.GET, "/api/v1/store/orders")).data.items;
  assert.equal(mine.length, 1);
  assert.deepEqual(mine[0].lines, [{ bookId: forSale.id, title: "Do'kon kitobi", qty: 3, price: 59000 }]);
  assert.equal((await other.call(orders.GET, "/api/v1/store/orders")).data.items.length, 0);
  console.log("PASS: Buyurtma: faqat kirganlar, summa serverda, narx muzlatiladi, idempotent, boshqaga ko'rinmaydi.");

  // --- Admin: barcha buyurtmalar va holat --------------------------------
  await buyer.call(adminOrders.GET, "/api/v1/admin/orders", { expect: 403 });
  await buyer.call(adminOrder.PATCH, `/api/v1/admin/orders/${order.id}`, { method: "PATCH", params: { id: order.id }, body: { status: "delivered" }, expect: 403 });
  const all = (await admin.call(adminOrders.GET, "/api/v1/admin/orders?status=new")).data.items;
  assert.ok(all.some((o) => o.id === order.id));
  const confirmed = (await admin.call(adminOrder.PATCH, `/api/v1/admin/orders/${order.id}`, { method: "PATCH", params: { id: order.id }, body: { status: "confirmed" } })).data;
  assert.equal(confirmed.status, "confirmed");
  await admin.call(adminOrder.PATCH, `/api/v1/admin/orders/${order.id}`, { method: "PATCH", params: { id: order.id }, body: { status: "lost" }, expect: 422 });
  assert.equal((await buyer.call(orders.GET, "/api/v1/store/orders")).data.items[0].status, "confirmed");
  console.log("PASS: Admin buyurtmalarni ko'radi va holatini o'zgartiradi; boshqalar — yo'q.");

  // --- Sharhlar ----------------------------------------------------------
  const path = `/api/v1/books/${forSale.id}/reviews`;
  const params = { id: forSale.id };
  await guest.call(reviews.PUT, path, { method: "PUT", params, body: { rating: 5 }, expect: 401 });
  await buyer.call(reviews.PUT, path, { method: "PUT", params, body: { rating: 6 }, expect: 422 });
  await buyer.call(reviews.PUT, path, { method: "PUT", params, body: { rating: 4, body: "Yaxshi" } });
  let summary = (await buyer.call(reviews.PUT, path, { method: "PUT", params, body: { rating: 5, body: "Zo'r kitob" } })).data;
  assert.equal(summary.count, 1, "Bitta kitobxon — bitta sharh");
  await other.call(reviews.PUT, path, { method: "PUT", params, body: { rating: 3 } });
  summary = (await guest.call(reviews.GET, path, { params })).data;
  assert.equal(summary.count, 2);
  assert.equal(summary.average, 4);
  assert.ok(summary.items.every((r) => !r.mine));
  assert.equal(summary.items.find((r) => r.rating === 5).name, "Xaridor");
  vitrina = (await guest.call(storeBooks.GET, "/api/v1/store/books")).data.items;
  assert.equal(vitrina.find((b) => b.id === forSale.id).rating, 4);
  summary = (await other.call(reviews.DELETE, path, { method: "DELETE", params })).data;
  assert.equal(summary.count, 1, "Faqat o'z sharhini o'chiradi");
  await buyer.call(reviews.PUT, `/api/v1/books/book_yoq/reviews`, { method: "PUT", params: { id: "book_yoq" }, body: { rating: 5 }, expect: 404 });
  console.log("PASS: Sharhlar: kirganlar yozadi, bittadan, o'rtacha baho, faqat o'zini o'chiradi.");

  // --- Do'kon chati: xaridor ↔ admin, buyurtma chatga tushadi --------------
  // Buyurtma xaridorning chatida «order» xabari sifatida turadi, admin ro'yxatida o'qilmagan bo'ladi.
  const bchat = (await buyer.call(chat.GET, "/api/v1/store/chat")).data;
  assert.equal(bchat.messages.length, 1);
  assert.equal(bchat.messages[0].kind, "order");
  assert.equal(bchat.messages[0].orderId, order.id);
  assert.match(bchat.messages[0].body, /Jami: ₩177,000/);
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM store_messages WHERE user_id = ?").get(buyer.userId).n, 1, "Takroriy buyurtma xabarni ko'paytirmaydi");
  await guest.call(chat.POST, "/api/v1/store/chat", { method: "POST", body: { body: "Salom" }, expect: 401 });
  await buyer.call(chat.POST, "/api/v1/store/chat", { method: "POST", body: { body: "   " }, expect: 422 });
  await buyer.call(chat.POST, "/api/v1/store/chat", { method: "POST", body: { body: "x".repeat(1001) }, expect: 422 });
  await buyer.call(chat.POST, "/api/v1/store/chat", { method: "POST", body: { body: "Bu kitob bormi?", bookId: "book_yoq" }, expect: 404 });
  const asked = (await buyer.call(chat.POST, "/api/v1/store/chat", { method: "POST", body: { body: "Muqovasi qattiqmi?", bookId: forSale.id }, expect: 201 })).data;
  assert.equal(asked.sender, "user");
  assert.equal(asked.bookTitle, "Do'kon kitobi");

  await buyer.call(adminChats.GET, "/api/v1/admin/store-chat", { expect: 403 });
  await buyer.call(adminChat.GET, `/api/v1/admin/store-chat/${buyer.userId}`, { params: { userId: buyer.userId }, expect: 403 });
  await buyer.call(adminChat.POST, `/api/v1/admin/store-chat/${buyer.userId}`, { method: "POST", params: { userId: buyer.userId }, body: { body: "o'zimga" }, expect: 403 });
  const inbox = (await admin.call(adminChats.GET, "/api/v1/admin/store-chat")).data;
  const row = inbox.items.find((t) => t.userId === buyer.userId);
  assert.equal(row.unread, 2, "Buyurtma + savol = 2 ta o'qilmagan");
  assert.equal(row.name, "Xaridor");
  assert.ok(inbox.unread >= 2);
  const opened = (await admin.call(adminChat.GET, `/api/v1/admin/store-chat/${buyer.userId}`, { params: { userId: buyer.userId } })).data;
  assert.equal(opened.messages.length, 2);
  assert.equal((await admin.call(adminChats.GET, "/api/v1/admin/store-chat")).data.items.find((t) => t.userId === buyer.userId).unread, 0, "Ochilgach o'qilgan");
  await admin.call(adminChat.GET, "/api/v1/admin/store-chat/reader_yoq", { params: { userId: "reader_yoq" }, expect: 404 });

  const reply = (await admin.call(adminChat.POST, `/api/v1/admin/store-chat/${buyer.userId}`, { method: "POST", params: { userId: buyer.userId }, body: { body: "Hisob raqam: 8600 **** **** 1234" }, expect: 201 })).data;
  assert.equal(reply.sender, "admin");
  const fresh = (await buyer.call(chat.GET, `/api/v1/store/chat?after=${asked.id}`)).data;
  assert.deepEqual(fresh.messages.map((m) => m.id), [reply.id], "after faqat yangilarini qaytaradi");
  assert.equal(fresh.unread, 1);
  assert.equal((await buyer.call(chat.GET, "/api/v1/store/chat")).data.unread, 0, "Admin javobi o'qilgach nol");
  assert.equal((await other.call(chat.GET, "/api/v1/store/chat")).data.messages.length, 0, "Yozishmalar aralashmaydi");

  // Chek rasmi: faqat haqiqiy rasm, hajm chegarasi; egasi va admin ko'radi, boshqasi — yo'q.
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]);
  const upload = async (client, route, path, mime, bytes, params) => {
    const res = await route.POST(new Request(`${ORIGIN}${path}`, { method: "POST", headers: { "Content-Type": mime, Cookie: client.cookie, Origin: ORIGIN }, body: bytes }), params ? { params: Promise.resolve(params) } : undefined);
    return { status: res.status, payload: await res.json() };
  };
  assert.equal((await upload(buyer, chatImage, "/api/v1/store/chat/image", "image/png", new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]))).status, 400, "Rasm bo'lmagan fayl rad etiladi");
  assert.equal((await upload(buyer, chatImage, "/api/v1/store/chat/image", "application/pdf", png)).status, 400);
  assert.equal((await upload(guest, chatImage, "/api/v1/store/chat/image", "image/png", png)).status, 401);
  const receipt = await upload(buyer, chatImage, "/api/v1/store/chat/image", "image/png", png);
  assert.equal(receipt.status, 201);
  assert.equal(receipt.payload.data.kind, "image");
  const imageUrl = receipt.payload.data.imageUrl;
  const [, , , uid, fileName] = imageUrl.split("/");
  const fetchImage = (who) => chatFile.GET(new Request(`${ORIGIN}${imageUrl}`, { headers: { Cookie: who.cookie } }), { params: Promise.resolve({ uid, file: fileName }) });
  assert.equal((await fetchImage(buyer)).status, 200);
  assert.equal((await fetchImage(admin)).status, 200);
  assert.equal((await fetchImage(other)).status, 404, "Chek rasmini boshqa xaridor ko'rmaydi");
  assert.equal((await fetchImage(guest)).status, 404);
  assert.equal((await upload(buyer, adminChatImage, `/api/v1/admin/store-chat/${buyer.userId}/image`, "image/png", png, { userId: buyer.userId })).status, 403);
  assert.equal((await upload(admin, adminChatImage, `/api/v1/admin/store-chat/${buyer.userId}/image`, "image/png", png, { userId: buyer.userId })).status, 201);
  assert.equal(sqlite.prepare("SELECT admin_unread FROM store_threads WHERE user_id = ?").get(buyer.userId).admin_unread, 1, "Chek rasmi adminda o'qilmagan");
  console.log("PASS: Do'kon chati: buyurtma chatga tushadi, o'qilmaganlar, javob, chek rasmi (egasi va admin).");

  // --- AI: kalitsiz 503, mehmon 401 bo'lmasdan oldin sozlama tekshiriladi --
  delete process.env.GEMINI_API_KEY;
  await buyer.call(ai.POST, "/api/v1/store/ai", { method: "POST", body: { mode: "chat", messages: [{ role: "user", text: "Salom" }] }, expect: 503 });
  process.env.GEMINI_API_KEY = "test-key";
  await guest.call(ai.POST, "/api/v1/store/ai", { method: "POST", body: { mode: "chat", messages: [{ role: "user", text: "Salom" }] }, expect: 401 });
  await buyer.call(ai.POST, "/api/v1/store/ai", { method: "POST", body: { mode: "chat", messages: [{ role: "model", text: "Salom" }] }, expect: 422 });
  delete process.env.GEMINI_API_KEY;
  console.log("PASS: AI: kalit faqat serverda, mehmonga yopiq, suhbat tekshiriladi.");

  console.log("\nHAMMASI O'TDI: Book Store.");
} finally {
  const unique = [...new Set(createdUsers)];
  if (unique.length) {
    const ph = unique.map(() => "?").join(",");
    sqlite.prepare(`DELETE FROM store_messages WHERE user_id IN (${ph})`).run(...unique);
    sqlite.prepare(`DELETE FROM store_threads WHERE user_id IN (${ph})`).run(...unique);
    sqlite.prepare(`DELETE FROM store_orders WHERE user_id IN (${ph})`).run(...unique);
    sqlite.prepare(`DELETE FROM store_cart_items WHERE user_id IN (${ph})`).run(...unique);
    sqlite.prepare(`DELETE FROM book_reviews WHERE user_id IN (${ph})`).run(...unique);
    sqlite.prepare(`DELETE FROM auth_accounts WHERE user_id IN (${ph})`).run(...unique);
  }
  for (const id of createdBooks) sqlite.prepare("DELETE FROM books WHERE id = ?").run(id);
  if (unique.length) sqlite.prepare(`DELETE FROM users WHERE id IN (${unique.map(() => "?").join(",")})`).run(...unique);
  await removeDir(mediaDir, { recursive: true, force: true });
  console.log(`Tozalandi: ${unique.length} ta foydalanuvchi, ${createdBooks.length} ta kitob.`);
}
