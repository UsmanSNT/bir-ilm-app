// Do'kon mahsulotlarini zaxiradan tiklash (0018 migratsiyasidan keyin, audiosi bor kitoblarda narx 0 ga tushgan).
//
//   set BIR_ILM_DB_PATH=C:\bir-ilm\data\bir-ilm.sqlite
//   set BIR_ILM_MEDIA_DIR=C:\bir-ilm\media
//   node scripts/restore-store-products.mjs <zaxira.sqlite>            (faqat ko'rsatadi)
//   node scripts/restore-store-products.mjs <zaxira.sqlite> --apply    (yaratadi)
//
// Zaxiradagi narxi qo'yilgan har bir kitob uchun do'konda ALOHIDA mahsulot yaratiladi (nom, muallif, tavsif,
// janr, narx, muqova nusxasi). Narx zaxiradagi son bilan olinadi: bu so'm bo'lgan — won bilan keyin
// Profil → Sozlamalar → Do'kon kitoblari da tuzating. Kutubxona kitobi o'zgarmaydi. Qayta yurgizish xavfsiz
// (shu nomli do'kon mahsuloti bor bo'lsa, o'tkazib yuboriladi).
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const [backupPath, flag] = process.argv.slice(2);
const livePath = process.env.BIR_ILM_DB_PATH?.trim();
const mediaRoot = path.resolve(process.env.BIR_ILM_MEDIA_DIR?.trim() || ".sites-runtime/media");
const apply = flag === "--apply";
if (!backupPath || !livePath) {
  console.error("Foydalanish: set BIR_ILM_DB_PATH=... && node scripts/restore-store-products.mjs <zaxira.sqlite> [--apply]");
  process.exit(1);
}

const backup = new DatabaseSync(backupPath, { readOnly: true });
const live = new DatabaseSync(livePath);
const old = backup.prepare("SELECT * FROM books WHERE price > 0 ORDER BY created_at").all();
const stores = live.prepare("SELECT lower(trim(title)) AS t FROM books WHERE kind = 'store'").all().map((r) => r.t);

console.log(`Joriy bazada do'kon mahsulotlari: ${stores.length}. Zaxirada narxi bor kitoblar: ${old.length}.`);
let created = 0;
for (const book of old) {
  if (stores.includes(book.title.trim().toLowerCase())) { console.log(`  o'tkazildi (bor): ${book.title}`); continue; }
  const id = `book_${randomBytes(6).toString("hex")}`;
  console.log(`  ${apply ? "yaratildi" : "yaratiladi"}: ${book.title} — ${book.author} · narx ${book.price} · muqova ${book.cover_file ? "bor" : "yo'q"}`);
  if (!apply) continue;
  const stamp = new Date().toISOString();
  live.prepare(`INSERT INTO books (id, title, author, summary, color, pages, active, cover_file, kind, price, category, created_by, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'store', ?, ?, ?, ?, ?)`)
    .run(id, book.title, book.author, book.summary, book.color, book.pages, book.cover_file, book.price, book.category, book.created_by, stamp, stamp);
  if (book.cover_file) {
    const from = path.join(mediaRoot, "books", book.id, book.cover_file);
    if (existsSync(from)) {
      mkdirSync(path.join(mediaRoot, "books", id), { recursive: true });
      copyFileSync(from, path.join(mediaRoot, "books", id, book.cover_file));
    } else console.log(`    ogohlantirish: muqova fayli topilmadi (${from}) — muqovani qo'lda yuklang`);
  }
  created += 1;
}
console.log(apply ? `Tayyor: ${created} ta mahsulot yaratildi.` : "Hech narsa o'zgarmadi. Yaratish uchun oxiriga --apply qo'shing.");
