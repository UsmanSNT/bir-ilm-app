// Mehmon (hisobga kirmagan) akkauntlardagi shaxsiy ismlarni "Kitobxon" ga almashtiradi.
// Avvalgi versiyada hisobdan chiqqandan keyin ham brauzerda qolgan ism yangi mehmon sessiyalariga yuborilardi;
// endi mehmonga ism berilmaydi, bu skript esa o'sha davrda yozilib qolganlarini tozalaydi.
//
//   node scripts/anonymize-guests.mjs           — faqat ko'rsatadi (hech narsa o'zgarmaydi)
//   node scripts/anonymize-guests.mjs --apply   — almashtiradi
//
// Mehmon = roli "user" va hech qanday kirish hisobi (Google, Telegram, email) yo'q. Admin, moderator va
// ro'yxatdan o'tganlarga tegilmaydi. Serverda: set BIR_ILM_DB_PATH=C:\bir-ilm\data\bir-ilm.sqlite.
// O'zgartirishdan oldin zaxira oling (scripts/backup-db.mjs).
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const GUEST_NAME = "Kitobxon";
const dbPath = process.env.BIR_ILM_DB_PATH?.trim()
  || fileURLToPath(new URL("../.sites-runtime/node-preview.sqlite", import.meta.url));
const apply = process.argv.includes("--apply");
const db = new DatabaseSync(dbPath);
db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");

const guests = `SELECT users.id FROM users
  WHERE users.role = 'user' AND users.name <> '${GUEST_NAME}'
    AND NOT EXISTS (SELECT 1 FROM auth_accounts a WHERE a.user_id = users.id)`;

// Ism nusxasi saqlanadigan ustunlar. Bazada yo'q jadval/ustun jim o'tkazib yuboriladi.
const COPIES = [["comments", "user_name"], ["live_messages", "user_name"], ["user_activity", "display_name"]];
const hasColumn = (table, column) =>
  db.prepare("SELECT 1 FROM pragma_table_info(?) WHERE name = ?").get(table, column) !== undefined;

const names = db.prepare(`SELECT name, count(*) AS n FROM users WHERE id IN (${guests}) GROUP BY name ORDER BY n DESC`).all();
const total = names.reduce((sum, row) => sum + Number(row.n), 0);
console.log(`Baza: ${dbPath}`);
console.log(`Ismi bor mehmon akkaunt: ${total}.`);
for (const row of names) console.log(`  ${row.n} × ${row.name}`);

if (!apply) {
  console.log(`Hech narsa o'zgarmadi. "${GUEST_NAME}" ga almashtirish uchun: --apply`);
} else if (total > 0) {
  db.exec("BEGIN");
  try {
    // Avval nusxalar: users.name o'zgargach mehmonlarni ism bo'yicha topib bo'lmaydi.
    for (const [table, column] of COPIES.filter(([t, c]) => hasColumn(t, c))) {
      const { changes } = db.prepare(`UPDATE ${table} SET ${column} = ? WHERE user_id IN (${guests})`).run(GUEST_NAME);
      console.log(`  ${table}.${column}: ${changes}`);
    }
    const { changes } = db.prepare(`UPDATE users SET name = ? WHERE id IN (${guests})`).run(GUEST_NAME);
    db.exec("COMMIT");
    console.log(`Almashtirildi: ${changes} akkaunt.`);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
db.close();
