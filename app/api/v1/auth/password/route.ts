/** Parolni o'zgartirish (kirgan foydalanuvchi; avvalgi parol bo'lsa uni ham so'raydi). */
import { defineRoute } from "@/server/http/handler";
import { clientIp } from "@/server/auth/link-codes";
import { changePassword, limitAttempt } from "@/server/auth/passwords";
import { requireSignedIn } from "@/server/services/community";
import { changePasswordSchema, type ChangePasswordInput } from "@/shared/contract";

export const runtime = "edge";

export const PUT = defineRoute<ChangePasswordInput, { changed: true }>({
  schema: changePasswordSchema,
  source: "body",
  handler: async ({ db, identity, input, request }) => {
    await requireSignedIn(db, identity.userId, "Parolni o'zgartirish");
    limitAttempt("login", [`ip:${clientIp(request)}`, `user:${identity.userId}`]);
    await changePassword(db, identity.userId, input);
    return { changed: true };
  },
});

export const OPTIONS = PUT;
