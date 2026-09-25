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

const result = sqlite.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, target);
if (result.changes === 0) {
  console.error(`Foydalanuvchi topilmadi: ${target}`);
  process.exit(1);
}
console.log(`${target} → ${role}`);
