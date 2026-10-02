/** Global rollar: kim admin, kim moderator. HTTP va WebSocket ikkalasi ham shu yerdan so'raydi. */
import { desc, eq, like, or } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { badRequest, forbidden, notFound } from "@/server/http/errors";
import type { AdminUser, UserRole } from "@/shared/contract";

const { users } = schema;

export async function getUserRole(db: Database, userId: string): Promise<UserRole> {
  const row = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { role: true },
  });
  return row?.role ?? "user";
}

export async function requireRole(
  db: Database,
  userId: string,
  allowed: readonly UserRole[],
  message = "Bu amal faqat admin uchun.",
): Promise<UserRole> {
  const role = await getUserRole(db, userId);
  if (!allowed.includes(role)) throw forbidden(message);
  return role;
}

export async function listUsers(db: Database, q?: string): Promise<AdminUser[]> {
  const pattern = q ? `%${q}%` : null;
  const rows = await db
    .select({ id: users.id, name: users.name, role: users.role, createdAt: users.createdAt })
    .from(users)
    .where(pattern ? or(like(users.name, pattern), like(users.id, pattern)) : undefined)
    .orderBy(desc(users.createdAt))
    .limit(100);
  return rows;
}

export async function setUserRole(
  db: Database,
  actorId: string,
  targetId: string,
  role: UserRole,
): Promise<AdminUser> {
  await requireRole(db, actorId, ["admin"], "Rollarni faqat admin o'zgartira oladi.");
  // Admin o'zini tushirib yuborsa, tizimda admin qolmasligi mumkin.
  if (actorId === targetId) throw badRequest("O'z rolingizni o'zgartira olmaysiz.");

  const updated = await db
    .update(users)
    .set({ role })
    .where(eq(users.id, targetId))
    .returning({ id: users.id, name: users.name, role: users.role, createdAt: users.createdAt });
  if (!updated[0]) throw notFound("Foydalanuvchi topilmadi.");
  return updated[0];
}
