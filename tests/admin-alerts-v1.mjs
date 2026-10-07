/**
 * Adminga buyurtma xabari (Telegram/email) testlari.
 * Ishga tushirish: `node tests/admin-alerts-v1.mjs`
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
const { tryGetDb } = await import(new URL("server/db/client.ts", projectRoot).href);
const { alertAdminsOfOrder, orderAlertText } = await import(new URL("server/services/admin-alerts.ts", projectRoot).href);
const db = await tryGetDb();
assert.ok(db, "baza ulanishi");

const order = {
  id: "BI-TEST123456", name: "Sinov Xaridor", phone: "+821012345678", telegram: "sinov_user", address: "Seoul, Gangnam 12-3, 405",
  note: "", payment: "chat", status: "new", total: 59000, createdAt: new Date().toISOString(),
  lines: [{ bookId: "b1", title: "Raqamli qala", qty: 2, price: 29500 }],
};

// Matn
const text = orderAlertText(order);
assert.ok(text.includes("BI-TEST123456") && text.includes("Raqamli qala ×2") && text.includes("₩59,000") && text.includes("@sinov_user") && text.includes("+821012345678"));

const suffix = Math.random().toString(36).slice(2, 8);
const adminId = `reader_alert_admin_${suffix}`;
const userId = `reader_alert_user_${suffix}`;
const sent = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith("https://api.telegram.org/") || String(url).startsWith("https://api.resend.com/")) {
    sent.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response("{}", { status: 200 });
  }
  return realFetch(url, init);
};
try {
  sqlite.prepare("INSERT INTO users (id, name, role) VALUES (?, 'Alert Admin', 'admin'), (?, 'Alert User', 'user')").run(adminId, userId);
  sqlite.prepare("INSERT INTO auth_accounts (provider, subject, user_id, email, display_name) VALUES ('telegram', '123456789', ?, NULL, 'tg'), ('email', ?, ?, ?, 'em'), ('telegram', '987654321', ?, NULL, 'tg2')")
    .run(adminId, `alert-${suffix}@example.com`, adminId, `alert-${suffix}@example.com`, userId);

  // Kanal sozlanmagan: hech narsa ketmaydi
  delete process.env.TELEGRAM_BOT_TOKEN; delete process.env.RESEND_API_KEY; delete process.env.MAIL_FROM;
  assert.equal(await alertAdminsOfOrder(db, order), 0);
  assert.equal(sent.length, 0);

  // Telegram sozlangan: faqat adminning chatiga (oddiy foydalanuvchiga emas)
  process.env.TELEGRAM_BOT_TOKEN = "123:TEST";
  assert.equal(await alertAdminsOfOrder(db, order), 1);
  assert.equal(sent.length, 1);
  assert.equal(String(sent[0].body.chat_id), "123456789");
  assert.ok(sent[0].body.text.includes("BI-TEST123456"));
  assert.ok(!sent.some((s) => String(s.body.chat_id) === "987654321"), "Oddiy foydalanuvchiga xabar ketmaydi");

  // Email ham sozlangan: adminning emailiga
  process.env.RESEND_API_KEY = "re_test"; process.env.MAIL_FROM = "Bir Ilm <noreply@birilm.uz>";
  sent.length = 0;
  assert.equal(await alertAdminsOfOrder(db, order), 2);
  assert.ok(sent.some((s) => s.url.includes("resend") && s.body.to[0] === `alert-${suffix}@example.com` && s.body.subject.includes("BI-TEST123456")));
  console.log("PASS: Adminga buyurtma xabari: matn, kanal sozlanmasa jim, Telegram faqat adminga, email adminning manziliga.");
  console.log("\nHAMMASI O'TDI: adminga xabar.");
} finally {
  globalThis.fetch = realFetch;
  delete process.env.TELEGRAM_BOT_TOKEN; delete process.env.RESEND_API_KEY; delete process.env.MAIL_FROM;
  sqlite.prepare("DELETE FROM auth_accounts WHERE user_id IN (?, ?)").run(adminId, userId);
  sqlite.prepare("DELETE FROM users WHERE id IN (?, ?)").run(adminId, userId);
}
