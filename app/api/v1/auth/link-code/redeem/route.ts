/**
 * Kod bilan kirish: to'g'ri kod shu qurilmaga kodni bergan akkauntning yangi sessiyasini ochadi.
 * Web cookie oladi; native ilova `wantToken: true` bilan tokenni tanada oladi.
 */
import { defineRoute } from "@/server/http/handler";
import { ApiException, badRequest } from "@/server/http/errors";
import { sessionCookie, TOKEN_MAX_AGE_SECONDS } from "@/server/auth/identity";
import { clientIp, isLinkRateLimited, recordLinkFailure, redeemLinkCode } from "@/server/auth/link-codes";
import { createSession, deleteSession } from "@/server/auth/sessions";
import { redeemLinkCodeSchema, type RedeemLinkCodeInput, type Session } from "@/shared/contract";

export const runtime = "edge";

export const POST = defineRoute<RedeemLinkCodeInput, Session>({
  schema: redeemLinkCodeSchema,
  source: "body",
  handler: async ({ db, identity, input, request, responseHeaders }) => {
    const ip = clientIp(request);
    if (isLinkRateLimited(ip)) {
      throw new ApiException("rate_limited", "Urinishlar ko'p bo'ldi. 10 daqiqadan keyin qayta urining.", 429);
    }
    const userId = await redeemLinkCode(db, input.code);
    if (!userId) {
      recordLinkFailure(ip);
      throw badRequest("Kod noto'g'ri yoki muddati o'tgan. Asosiy qurilmada yangi kod oling.");
    }

    const token = await createSession(db, userId);
    // Oldingi tokenga bog'langan login sessiyasi bo'lsa, u endi kerak emas.
    if (!identity.isNew) await deleteSession(db, identity.token);

    // Handler mehmon uchun qo'ygan cookie o'rniga yangi sessiya cookie'si.
    responseHeaders.delete("Set-Cookie");
    if (identity.platform === "web") responseHeaders.append("Set-Cookie", sessionCookie(request, token));

    return {
      userId,
      token: input.wantToken ? token : null,
      expiresAt: new Date(Date.now() + TOKEN_MAX_AGE_SECONDS * 1000).toISOString(),
    };
  },
});

export const OPTIONS = POST;
