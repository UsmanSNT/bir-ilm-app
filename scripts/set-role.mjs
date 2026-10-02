// Birinchi adminni tayinlash uchun: node scripts/set-role.mjs <userId yoki Google email> admin
// Foydalanuvchilarni ko'rish:         node scripts/set-role.mjs --list
// Email bo'yicha:                     node scripts/set-role.mjs ism@gmail.com admin
//   (faqat Google hisobi: Google emailni tasdiqlaydi; parol bilan ro'yxatdan o'tgan email tasdiqlanmagan, shuning uchun qidirilmaydi)
import { sqlite } from "./local-d1.mjs";

const ROLES = ["user", "moderator", "admin"];
const [target, role] = process.argv.slice(2);

if (!target || target === "--list") {
  const rows = sqlite
    .prepare(`SELECT u.id, u.name, u.role,
        (SELECT group_concat(a.provider || CASE WHEN a.email IS NOT NULL THEN ':' || a.email ELSE '' END, ', ')
           FROM auth_accounts a WHERE a.user_id = u.id) AS accounts,
        u.created_at
      FROM users u ORDER BY u.created_at DESC LIMIT 30`)
    .all();
  console.table(rows);
  if (!target) console.log("Foydalanish: node scripts/set-role.mjs <userId> <user|moderator|admin>");
  process.exit(0);
}

if (!ROLES.includes(role)) {
  console.error(`Rol quyidagilardan biri bo'lishi kerak: ${ROLES.join(", ")}`);
  process.exit(1);
}

let matches;
if (target.includes("@")) {
  // Faqat Google hisobi: email Google tomonidan tasdiqlangan.
  matches = sqlite
    .prepare(`SELECT DISTINCT u.id, u.name FROM auth_accounts a JOIN users u ON u.id = a.user_id
              WHERE a.provider = 'google' AND lower(a.email) = lower(?)`)
    .all(target.trim());
  if (matches.length === 0) {
    console.error(`Bu email bilan Google orqali kirgan foydalanuvchi topilmadi: ${target}\nAvval saytda «Google bilan kirish» ni bosing, keyin qayta urinib ko'ring.`);
    process.exit(1);
  }
} else {
  // Ilova sozlamalarida ID'ning faqat boshi ko'rinadi, shuning uchun noyob prefiks ham qabul qilinadi.
  const prefix = target.startsWith("reader_") ? target : `reader_${target}`;
  matches = sqlite.prepare("SELECT id, name FROM users WHERE id LIKE ? || '%'").all(prefix);
}
if (matches.length !== 1) {
  console.error(matches.length === 0 ? `Foydalanuvchi topilmadi: ${target}` : `Bir nechta mos keldi, ID'ni uzunroq yozing: ${target}`);
  process.exit(1);
}
const { id, name } = matches[0];
sqlite.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, id);
console.log(`${name} (${id}) → ${role}`);
