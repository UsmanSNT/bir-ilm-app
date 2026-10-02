/** Global foydalanuvchi rollari va admin boshqaruvi shartnomasi. */
import { z } from "zod";

export const USER_ROLES = ["user", "moderator", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  user: "Kitobxon",
  moderator: "Moderator",
  admin: "Admin",
};

export const setUserRoleSchema = z.object({
  role: z.enum(USER_ROLES),
});
export type SetUserRoleInput = z.infer<typeof setUserRoleSchema>;

export const adminUsersQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
});
export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;

export type AdminUser = {
  id: string;
  name: string;
  role: UserRole;
  createdAt: string;
};

export function canModerate(role: UserRole | undefined): boolean {
  return role === "moderator" || role === "admin";
}
