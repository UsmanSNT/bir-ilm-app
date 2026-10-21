/** Admin: foydalanuvchilar soni — ro'yxatdan o'tganlar, mehmonlar, moderator va adminlar. */
import { defineRoute } from "@/server/http/handler";
import { requireRole, usersSummary } from "@/server/services/roles";
import { type AdminUsersSummary } from "@/shared/contract";

export const runtime = "edge";

export const GET = defineRoute<unknown, AdminUsersSummary>({
  handler: async ({ db, identity }) => {
    await requireRole(db, identity.userId, ["admin"]);
    return usersSummary(db);
  },
});

export const OPTIONS = GET;
