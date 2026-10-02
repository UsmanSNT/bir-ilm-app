// Bazaning izchil zaxira nusxasi: node scripts/backup-db.mjs <nusxa-yo'li>
// Oddiy fayl nusxasi WAL rejimida oxirgi yozuvlarni yo'qotishi mumkin, shuning uchun SQLite backup API.
import { DatabaseSync, backup } from "node:sqlite";

const source = process.env.BIR_ILM_DB_PATH;
const target = process.argv[2];
if (!source || !target) {
  console.error("Foydalanish: set BIR_ILM_DB_PATH=... && node scripts/backup-db.mjs <nusxa-yo'li>");
  process.exit(1);
}

const db = new DatabaseSync(source.trim(), { readOnly: true });
const pages = await backup(db, target);
db.close();

// Nusxa bitta mustaqil fayl bo'lsin (yonida -wal/-shm qolmasin).
const check = new DatabaseSync(target);
check.exec("PRAGMA journal_mode=DELETE");
const ok = check.prepare("PRAGMA integrity_check").get();
check.close();
console.log(`Zaxira: ${target} (${pages} sahifa, tekshiruv: ${Object.values(ok)[0]})`);
