/** Admin: foydalanuvchilar ro'yxati (ism yoki ID bo'yicha qidiruv). */
import { defineRoute } from "@/server/http/handler";
import { listUsers, requireRole } from "@/server/services/roles";
import { adminUsersQuerySchema, type AdminUser, type AdminUsersQuery } from "@/shared/contract";

export const runtime = "edge";

export const GET = defineRoute<AdminUsersQuery, AdminUser[]>({
  schema: adminUsersQuerySchema,
  source: "query",
  handler: async ({ db, identity, input }) => {
    await requireRole(db, identity.userId, ["admin"]);
    return listUsers(db, input.q);
  },
});

export const OPTIONS = GET;
