/** Global rollar: kim admin, kim moderator. HTTP va WebSocket ikkalasi ham shu yerdan so'raydi. */
import { and, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { badRequest, forbidden, notFound } from "@/server/http/errors";
import type { AdminUser, AdminUserKind, AdminUsersSummary, UserRole } from "@/shared/contract";

const { authAccounts, users } = schema;

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

/** Ro'yxatdan o'tgan: email/Google/Telegram hisobi bor yoki admin/moderator roli berilgan. */
const registeredSql = sql`(exists (select 1 from auth_accounts a where a.user_id = ${users.id}) or ${users.role} != 'user')`;

type UserRow = { id: string; name: string; role: UserRole; createdAt: string };

async function withAccounts(db: Database, rows: UserRow[]): Promise<AdminUser[]> {
  const accounts = rows.length
    ? await db
        .select({ userId: authAccounts.userId, provider: authAccounts.provider, email: authAccounts.email, displayName: authAccounts.displayName })
        .from(authAccounts)
        .where(inArray(authAccounts.userId, rows.map((r) => r.id)))
    : [];
  return rows.map((row) => {
    const linked = accounts
      .filter((a) => a.userId === row.id)
      .map((a) => ({ provider: a.provider, label: a.email ?? a.displayName }));
    return { ...row, accounts: linked, registered: linked.length > 0 || row.role !== "user" };
  });
}

export async function listUsers(db: Database, q?: string, kind: AdminUserKind = "all"): Promise<AdminUser[]> {
  const pattern = q ? `%${q}%` : null;
  const conditions = [
    pattern
      ? or(
          like(users.name, pattern),
          like(users.id, pattern),
          sql`exists (select 1 from auth_accounts a where a.user_id = ${users.id} and (a.email like ${pattern} or a.display_name like ${pattern}))`,
        )
      : undefined,
    kind === "registered" ? registeredSql : kind === "guests" ? sql`not ${registeredSql}` : undefined,
  ];
  const rows = await db
    .select({ id: users.id, name: users.name, role: users.role, createdAt: users.createdAt })
    .from(users)
    .where(and(...conditions))
    .orderBy(desc(users.createdAt))
    .limit(100);
  return withAccounts(db, rows);
}

/** Panel tepasidagi sonlar: ro'yxat 100 tagacha kesilgani uchun alohida hisoblanadi. */
export async function usersSummary(db: Database): Promise<AdminUsersSummary> {
  const [row] = await db
    .select({
      registered: sql<number>`coalesce(sum(case when ${registeredSql} then 1 else 0 end), 0)`,
      guests: sql<number>`coalesce(sum(case when ${registeredSql} then 0 else 1 end), 0)`,
      moderators: sql<number>`coalesce(sum(case when ${users.role} = 'moderator' then 1 else 0 end), 0)`,
      admins: sql<number>`coalesce(sum(case when ${users.role} = 'admin' then 1 else 0 end), 0)`,
    })
    .from(users);
  return { registered: Number(row.registered), guests: Number(row.guests), moderators: Number(row.moderators), admins: Number(row.admins) };
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

  const [target] = await db
    .select({ id: users.id, name: users.name, role: users.role, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, targetId));
  if (!target) throw notFound("Foydalanuvchi topilmadi.");
  // Rol faqat ro'yxatdan o'tganga beriladi: mehmonni keyin tanib bo'lmaydi va u hisobni yo'qotishi mumkin.
  const [registered] = await withAccounts(db, [target]);
  if (!registered.registered) {
    throw badRequest("Rol faqat ro'yxatdan o'tgan (email, Google yoki Telegram) foydalanuvchiga beriladi. Bu mehmon hali kirmagan.");
  }

  await db.update(users).set({ role }).where(eq(users.id, targetId));
  return { ...registered, role, registered: registered.accounts.length > 0 || role !== "user" };
}
