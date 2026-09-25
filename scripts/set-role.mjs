// Birinchi adminni tayinlash uchun: node scripts/set-role.mjs <userId> admin
// Foydalanuvchilarni ko'rish:         node scripts/set-role.mjs --list
import { sqlite } from "./local-d1.mjs";

const ROLES = ["user", "moderator", "admin"];
const [target, role] = process.argv.slice(2);

if (!target || target === "--list") {
  const rows = sqlite
    .prepare("SELECT id, name, role, created_at FROM users ORDER BY created_at DESC LIMIT 30")
    .all();
  console.table(rows);
  if (!target) console.log("Foydalanish: node scripts/set-role.mjs <userId> <user|moderator|admin>");
  process.exit(0);
}

if (!ROLES.includes(role)) {
  console.error(`Rol quyidagilardan biri bo'lishi kerak: ${ROLES.join(", ")}`);
  process.exit(1);
}

// Ilova sozlamalarida ID'ning faqat boshi ko'rinadi, shuning uchun noyob prefiks ham qabul qilinadi.
const prefix = target.startsWith("reader_") ? target : `reader_${target}`;
const matches = sqlite.prepare("SELECT id, name FROM users WHERE id LIKE ? || '%'").all(prefix);
if (matches.length !== 1) {
  console.error(matches.length === 0 ? `Foydalanuvchi topilmadi: ${target}` : `Bir nechta mos keldi, ID'ni uzunroq yozing: ${target}`);
  process.exit(1);
}
const { id, name } = matches[0];
sqlite.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, id);
console.log(`${name} (${id}) → ${role}`);
