// Eski ichki (kodga yozilgan) 3 ta viktorinani — «Atom odatlar», «O'tkan kunlar», «Alkimyogar» — bazaga ko'chiradi.
// Keyin ularni ilovada tahrirlash va kitobga bog'lash mumkin. Allaqachon shu nomli viktorina bo'lsa, o'tkazib yuboriladi.
//
//   node --experimental-strip-types scripts/import-demo-quizzes.mjs         — faqat ko'rsatadi
//   node --experimental-strip-types scripts/import-demo-quizzes.mjs --apply — qo'shadi
//
// Serverda: set BIR_ILM_DB_PATH=C:\bir-ilm\data\bir-ilm.sqlite
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { quizzes } from "../app/quiz-data.ts";

const dbPath = process.env.BIR_ILM_DB_PATH?.trim()
  || fileURLToPath(new URL("../.sites-runtime/node-preview.sqlite", import.meta.url));
const apply = process.argv.includes("--apply");
const db = new DatabaseSync(dbPath);
db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");

if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='quizzes'").get()) {
  console.error("Viktorina jadvali yo'q: avval yangilangan saytni ishga tushirib, bosh sahifani bir marta oching (migratsiya o'zi qo'llanadi).");
  process.exit(1);
}

const rid = (p) => `${p}_${Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("")}`;
const admin = db.prepare("SELECT id FROM users WHERE role='admin' ORDER BY created_at LIMIT 1").get();
if (!admin) { console.error("Admin topilmadi."); process.exit(1); }

for (const quiz of quizzes) {
  const exists = db.prepare("SELECT 1 FROM quizzes WHERE title = ?").get(quiz.title);
  if (exists) { console.log(`O'tkazildi (bor): ${quiz.title}`); continue; }
  console.log(`${apply ? "Qo'shildi" : "Qo'shiladi"}: ${quiz.title} — ${quiz.questions.length} savol`);
  if (!apply) continue;
  const id = rid("qz");
  db.prepare("INSERT INTO quizzes (id, book_id, title, created_by) VALUES (?, NULL, ?, ?)").run(id, quiz.title, admin.id);
  quiz.questions.forEach((q, position) => {
    db.prepare("INSERT INTO quiz_questions (id, quiz_id, position, prompt, choices, answer) VALUES (?, ?, ?, ?, ?, ?)")
      .run(rid("qq"), id, position, q.prompt, JSON.stringify(q.choices.map((c) => c.text)), Number(q.answer));
  });
}
db.close();
