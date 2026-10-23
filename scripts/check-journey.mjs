// «Bir Ilm yo'li», hafta kitobi, jamoa va e-kitob manbasi ma'lumotlarini tekshiradi. FAQAT O'QIYDI — hech narsani o'zgartirmaydi.
//
//   Serverda:  set BIR_ILM_DB_PATH=C:\bir-ilm\data\bir-ilm.sqlite
//              node scripts\check-journey.mjs
//
// Natijani (xato chiqqan bo'lsa, xato matni bilan birga) yuboring.
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const dbPath = process.env.BIR_ILM_DB_PATH?.trim()
  || fileURLToPath(new URL("../.sites-runtime/node-preview.sqlite", import.meta.url));
const db = new DatabaseSync(dbPath);
db.exec("PRAGMA busy_timeout=5000;");

const all = (sql, ...args) => db.prepare(sql).all(...args);
const one = (sql, ...args) => db.prepare(sql).get(...args);
const hasTable = (name) => one("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?", name) !== undefined;
const hasColumn = (table, column) => all("SELECT name FROM pragma_table_info(?)", table).some((row) => row.name === column);
const problems = [];
const problem = (text) => { problems.push(text); console.log(`  ✗ ${text}`); };
const ok = (text) => console.log(`  ✓ ${text}`);
const section = (title) => console.log(`\n== ${title}`);

console.log(`Baza: ${dbPath}`);

section("Migratsiyalar");
const applied = hasTable("_preview_migrations") ? all("SELECT name FROM _preview_migrations ORDER BY name").map((row) => row.name) : [];
if (applied.length === 0) console.log("  (_preview_migrations jadvali yo'q — bu baza boshqa usulda yuritiladi)");
for (const name of ["0035_team_about.sql", "0036_team_links.sql", "0037_journey_books.sql", "0038_team_alumni_ebook_source.sql"]) {
  if (applied.includes(name)) ok(name);
  else problem(`${name} qo'llanmagan — serverni qayta ishga tushiring (scripts\\deploy.cmd); migratsiya server ishga tushganda qo'llanadi`);
}

section("Ustunlar");
const columns = [
  ["journey_books", "number"], ["journey_books", "discussed_on"], ["journey_books", "book_id"],
  ["books", "active_since"],
  ["team_members", "avatar"], ["team_members", "former"], ["team_members", "period"],
  ["book_ebooks", "source_name"], ["book_ebooks", "source_url"],
];
for (const [table, column] of columns) {
  if (hasTable(table) && hasColumn(table, column)) ok(`${table}.${column}`);
  else problem(`${table}.${column} yo'q`);
}

if (hasTable("journey_books")) {
  section("«Bir Ilm yo'li» tayanch nuqtasi");
  const raw = one("SELECT value FROM site_settings WHERE key = 'about'")?.value;
  let anchor = { number: 248, date: "2026-10-24" };
  if (raw) {
    try {
      const parsed = JSON.parse(raw).anchor;
      if (parsed && Number.isInteger(parsed.number) && typeof parsed.date === "string") anchor = parsed;
      else problem("site_settings.about ichida anchor yo'q yoki noto'g'ri — standart ishlatiladi");
    } catch {
      problem("site_settings.about buzilgan JSON — standart tayanch nuqta ishlatiladi");
    }
  }
  console.log(`  ${anchor.number}-kitob — ${anchor.date}`);

  section("Ro'yxatga yozilgan kitoblar (journey_books)");
  const rows = all(`SELECT j.number, j.discussed_on, j.title, j.book_id,
      CAST(strftime('%w', j.discussed_on) AS INTEGER) AS weekday,
      CAST(round((julianday(j.discussed_on) - julianday(?)) / 7) AS INTEGER) + ? AS expected,
      (SELECT count(*) FROM books b WHERE b.id = j.book_id) AS book_exists
    FROM journey_books j ORDER BY j.number`, anchor.date, anchor.number);
  console.log(`  Jami: ${rows.length} ta`);
  for (const row of rows.slice(-8)) console.log(`  #${row.number}  ${row.discussed_on}  «${row.title}»${row.book_id ? "" : "  (kitobga bog'lanmagan)"}`);
  for (const row of rows) {
    if (row.weekday !== 6) problem(`#${row.number}: ${row.discussed_on} shanba emas`);
    if (row.expected !== row.number) problem(`#${row.number}: sanasiga ko'ra ${row.expected}-kitob bo'lishi kerak (${row.discussed_on})`);
    if (row.book_id && !row.book_exists) problem(`#${row.number}: book_id=${row.book_id} kitobi topilmaydi`);
    if (!row.title.trim()) problem(`#${row.number}: nom bo'sh`);
  }
  if (rows.length === 0) console.log("  (hali yozilmagan: hafta kitobiga suhbat vaqti belgilanganda yoziladi)");

  section("Hafta kitobi");
  const week = all("SELECT id, title, active_since FROM books WHERE kind = 'library' AND active = 1");
  if (week.length === 0) console.log("  Hafta kitobi tanlanmagan (bosh sahifada «Tez kunda yangi kitob e'lon qilinadi» chiqadi).");
  if (week.length > 1) problem(`Hafta kitobi ${week.length} ta (bitta bo'lishi kerak): ${week.map((b) => b.title).join("; ")}`);
  for (const book of week) {
    const entry = one("SELECT number, discussed_on FROM journey_books WHERE book_id = ? ORDER BY number DESC LIMIT 1", book.id);
    console.log(`  «${book.title}» — ${entry ? `${entry.number}-kitob, ${entry.discussed_on}` : "ro'yxatda yo'q (suhbat vaqti belgilanmagan)"}${book.active_since ? `, e'londa: ${book.active_since}` : ""}`);
  }

  section("Oxirgi suhbatlar");
  for (const talk of all("SELECT book_title, status, scheduled_at FROM live_sessions ORDER BY scheduled_at DESC LIMIT 5")) {
    console.log(`  ${talk.scheduled_at}  ${talk.status.padEnd(7)}  «${talk.book_title}»`);
  }
}

if (hasTable("book_ebooks") && hasColumn("book_ebooks", "source_name")) {
  section("E-kitob manbalari");
  const withSource = all("SELECT b.title, e.source_name, e.source_url FROM book_ebooks e JOIN books b ON b.id = e.book_id WHERE e.source_name <> '' OR e.source_url <> ''");
  console.log(`  E-kitoblar: ${one("SELECT count(*) AS n FROM book_ebooks").n} ta, manbasi borlari: ${withSource.length} ta`);
  for (const row of withSource) {
    console.log(`  «${row.title}» — ${row.source_name || "(nomsiz)"} ${row.source_url}`);
    if (row.source_url && !/^https:\/\//.test(row.source_url)) problem(`«${row.title}»: manba havolasi https emas`);
  }
}

section("Natija");
console.log(problems.length ? `  ${problems.length} ta muammo topildi (yuqorida ✗ bilan).` : "  Muammo topilmadi.");
db.close();
