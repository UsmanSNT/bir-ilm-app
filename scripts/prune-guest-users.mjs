// Bo'sh mehmon akkauntlarini o'chiradi: sahifa ochilganda o'zi yaratilgan, lekin hech narsa
// yozmagan "Kitobxon"lar (post, izoh, progress, login, fokus, obuna... hech biri yo'q).
//
//   node scripts/prune-guest-users.mjs           — faqat sanaydi (hech narsa o'chirmaydi)
//   node scripts/prune-guest-users.mjs --apply   — o'chiradi
//
// Serverda: set BIR_ILM_DB_PATH=C:\bir-ilm\data\bir-ilm.sqlite. O'chirishdan oldin zaxira oling
// (scripts/backup-db.mjs).
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const dbPath = process.env.BIR_ILM_DB_PATH?.trim()
  || fileURLToPath(new URL("../.sites-runtime/node-preview.sqlite", import.meta.url));
const apply = process.argv.includes("--apply");
const db = new DatabaseSync(dbPath);
db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");

// Foydalanuvchiga ishora qiluvchi barcha ustunlar. Bazada yo'q jadval/ustun jim o'tkazib yuboriladi.
const REFS = [
  ["auth_accounts", "user_id"], ["user_sessions", "user_id"], ["login_codes", "user_id"],
  ["reading_posts", "user_id"], ["post_replies", "user_id"], ["post_reactions", "user_id"],
  ["post_reports", "user_id"], ["post_media", "user_id"], ["reader_follows", "follower_id"],
  ["reader_follows", "followed_id"], ["focus_sessions", "user_id"], ["reading_progress", "user_id"],
  ["comments", "user_id"], ["user_activity", "user_id"], ["live_participants", "user_id"],
  ["live_messages", "user_id"], ["live_sessions", "moderator_id"], ["books", "created_by"],
];
const hasColumn = (table, column) =>
  db.prepare(`SELECT 1 FROM pragma_table_info(?) WHERE name = ?`).get(table, column) !== undefined;
const used = REFS.filter(([t, c]) => hasColumn(t, c))
  .map(([t, c]) => `NOT EXISTS (SELECT 1 FROM ${t} WHERE ${t}.${c} = users.id)`);

const where = [
  "users.role = 'user'",
  "users.name = 'Kitobxon'",
  "users.bio = ''",
  "users.avatar_url IS NULL",
  "users.email IS NULL",
  ...used,
].join(" AND ");

const total = db.prepare("SELECT count(*) AS n FROM users").get().n;
const empty = db.prepare(`SELECT count(*) AS n FROM users WHERE ${where}`).get().n;
console.log(`Baza: ${dbPath}`);
console.log(`Jami akkaunt: ${total}. Bo'sh mehmon akkaunt: ${empty}.`);

if (!apply) {
  console.log("Hech narsa o'chirilmadi. O'chirish uchun: --apply");
} else if (empty > 0) {
  const { changes } = db.prepare(`DELETE FROM users WHERE ${where}`).run();
  console.log(`O'chirildi: ${changes}. Qoldi: ${total - Number(changes)}.`);
}
db.close();
