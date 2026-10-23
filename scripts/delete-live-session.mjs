// Jonli suhbatni butunlay o'chiradi (izohlar, qatnashchilar, yozuvlar va fayllari bilan).
//
//   node scripts/delete-live-session.mjs --list      — suhbatlar ro'yxati
//   node scripts/delete-live-session.mjs <live_id>   — o'chiradi
//
// Serverda: set BIR_ILM_DB_PATH=... va BIR_ILM_MEDIA_DIR=... O'chirishdan oldin zaxira oling.
// Odatda bu ishni ilovadagi admin «Suhbatni o'chirish» tugmasi bajaradi.
import { DatabaseSync } from "node:sqlite";
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dbPath = process.env.BIR_ILM_DB_PATH?.trim()
  || fileURLToPath(new URL("../.sites-runtime/node-preview.sqlite", import.meta.url));
const mediaDir = path.resolve(process.env.BIR_ILM_MEDIA_DIR?.trim() || ".sites-runtime/media");
const db = new DatabaseSync(dbPath);
db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");

const target = process.argv[2];
if (!target || target === "--list") {
  console.table(db.prepare("SELECT id, status, book_title, title, scheduled_at FROM live_sessions ORDER BY scheduled_at DESC").all());
  process.exit(0);
}
if (!/^live_[a-z0-9]{6,32}$/.test(target)) {
  console.error(`Noto'g'ri ID: ${target}`);
  process.exit(1);
}
const row = db.prepare("SELECT id, status, book_title, title FROM live_sessions WHERE id = ?").get(target);
if (!row) {
  console.error(`Suhbat topilmadi: ${target}`);
  process.exit(1);
}
if (row.status === "live") {
  console.error("Jonli suhbatni avval tugating.");
  process.exit(1);
}
db.prepare("DELETE FROM live_sessions WHERE id = ?").run(target);
rmSync(path.join(mediaDir, "live", target), { recursive: true, force: true });
console.log(`O'chirildi: ${row.book_title} — ${row.title} (${row.id})`);
db.close();
