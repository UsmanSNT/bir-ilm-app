/** Global foydalanuvchi rollari va admin boshqaruvi shartnomasi. */
import { z } from "zod";
import type { LinkedAccount } from "./auth";

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

/** all — eski ilovalar uchun; registered — email/Google/Telegram bilan kirganlar; guests — ro'yxatdan o'tmaganlar. */
export const ADMIN_USER_KINDS = ["all", "registered", "guests"] as const;
export type AdminUserKind = (typeof ADMIN_USER_KINDS)[number];

export const adminUsersQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  kind: z.enum(ADMIN_USER_KINDS).default("all"),
});
export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;

export type AdminUser = {
  id: string;
  name: string;
  role: UserRole;
  createdAt: string;
  /** Email, Google yoki Telegram bilan kirgan (yoki admin/moderator). Faqat shularga rol beriladi. */
  registered: boolean;
  /** Bog'langan hisoblar: provayder va email/ism. Mehmonda bo'sh. */
  accounts: LinkedAccount[];
};

export type AdminUsersSummary = {
  registered: number;
  guests: number;
  moderators: number;
  admins: number;
};

export function canModerate(role: UserRole | undefined): boolean {
  return role === "moderator" || role === "admin";
}
