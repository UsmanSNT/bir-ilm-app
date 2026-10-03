/** Xavfsizlik kodini qo'yish/almashtirish (PUT) va o'chirish (DELETE). Faqat kirgan hisob uchun. */
import { defineRoute } from "@/server/http/handler";
import { clientIp } from "@/server/auth/link-codes";
import { limitAttempt } from "@/server/auth/passwords";
import { removeTwoFactor, setTwoFactor } from "@/server/auth/two-factor";
import { requireSignedIn } from "@/server/services/community";
import { removeTwoFactorSchema, setTwoFactorSchema, type RemoveTwoFactorInput, type SetTwoFactorInput } from "@/shared/contract";

export const runtime = "edge";

export const PUT = defineRoute<SetTwoFactorInput, { enabled: true }>({
  schema: setTwoFactorSchema,
  source: "body",
  handler: async ({ db, identity, input, request }) => {
    await requireSignedIn(db, identity.userId, "Xavfsizlik kodini sozlash");
    limitAttempt("security", [`ip:${clientIp(request)}`, `user:${identity.userId}`]);
    await setTwoFactor(db, identity.userId, input);
    return { enabled: true };
  },
});

export const DELETE = defineRoute<RemoveTwoFactorInput, { enabled: false }>({
  schema: removeTwoFactorSchema,
  source: "body",
  handler: async ({ db, identity, input, request }) => {
    await requireSignedIn(db, identity.userId, "Xavfsizlik kodini o'chirish");
    limitAttempt("security", [`ip:${clientIp(request)}`, `user:${identity.userId}`]);
    await removeTwoFactor(db, identity.userId, input);
    return { enabled: false };
  },
});

export const OPTIONS = PUT;
