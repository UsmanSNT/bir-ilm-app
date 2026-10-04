// Ro'yxatdan o'tmagan akkauntlarni o'chiradi: hech qanday kirish usuli (email, Google, Telegram)
// bog'lanmagan va admin/moderator bo'lmagan "mehmon" yozuvlari. Ular brauzer tokeni bo'yicha ochilgan
// va faqat shu brauzerga bog'liq edi. Ularning postlari, izohlari va boshqa ma'lumotlari ham o'chadi
// (bog'liq jadvallar CASCADE).
//
//   node scripts/prune-unregistered.mjs           — faqat sanaydi (hech narsa o'chirmaydi)
//   node scripts/prune-unregistered.mjs --apply   — o'chiradi
//
// Serverda: set BIR_ILM_DB_PATH=C:\bir-ilm\data\bir-ilm.sqlite. O'chirishdan oldin zaxira oling
// (scripts\backup-db.mjs). Saytni to'xtatib turib ishga tushirish xavfsizroq.
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const dbPath = process.env.BIR_ILM_DB_PATH?.trim()
  || fileURLToPath(new URL("../.sites-runtime/node-preview.sqlite", import.meta.url));
const apply = process.argv.includes("--apply");
const db = new DatabaseSync(dbPath);
db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");

const has = (table) => db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table) !== undefined;
const count = (sql) => Number(db.prepare(sql).get().n);

const where = [
  "users.role = 'user'",
  "NOT EXISTS (SELECT 1 FROM auth_accounts a WHERE a.user_id = users.id)",
  // Suhbat boshqaruvchisi bo'lgan yoki kitob yaratgan akkaunt hech qachon o'chirilmaydi.
  ...(has("live_sessions") ? ["NOT EXISTS (SELECT 1 FROM live_sessions s WHERE s.moderator_id = users.id)"] : []),
  ...(has("books") ? ["NOT EXISTS (SELECT 1 FROM books b WHERE b.created_by = users.id)"] : []),
].join(" AND ");

const total = count("SELECT count(*) AS n FROM users");
const doomed = count(`SELECT count(*) AS n FROM users WHERE ${where}`);
const withPosts = has("reading_posts") ? count(`SELECT count(*) AS n FROM users WHERE ${where} AND EXISTS (SELECT 1 FROM reading_posts p WHERE p.user_id = users.id)`) : 0;
const registered = count("SELECT count(DISTINCT user_id) AS n FROM auth_accounts");

console.log(`Baza: ${dbPath}`);
console.log(`Jami akkaunt: ${total}. Ro'yxatdan o'tgan (email/Google/Telegram): ${registered}. Admin/moderator: ${count("SELECT count(*) AS n FROM users WHERE role <> 'user'")}.`);
console.log(`O'chiriladigan ro'yxatdan o'tmagan akkaunt: ${doomed} (shulardan postli: ${withPosts}).`);

if (!apply) {
  console.log("Hech narsa o'chirilmadi. O'chirish uchun: --apply");
} else if (doomed > 0) {
  const { changes } = db.prepare(`DELETE FROM users WHERE ${where}`).run();
  console.log(`O'chirildi: ${changes}. Qoldi: ${total - Number(changes)}.`);
}
db.close();
