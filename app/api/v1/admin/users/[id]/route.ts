/** Admin: foydalanuvchiga rol berish (user / moderator / admin). */
import { defineRoute } from "@/server/http/handler";
import { setUserRole } from "@/server/services/roles";
import { setUserRoleSchema, type AdminUser, type SetUserRoleInput } from "@/shared/contract";

export const runtime = "edge";

export const PATCH = defineRoute<SetUserRoleInput, AdminUser>({
  schema: setUserRoleSchema,
  source: "body",
  handler: ({ db, identity, input, params }) =>
    setUserRole(db, identity.userId, params.id, input.role),
});

export const OPTIONS = PATCH;
