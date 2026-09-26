/**
 * Ilova brauzerdan qaytgan kod va o'zidagi `verifier` bilan tokenni oladi.
 * Akkaunt shu yerda bog'lanadi: ilovadagi mehmon ma'lumotlari saqlanib qoladi.
 */
import { defineRoute } from "@/server/http/handler";
import { ApiException, badRequest } from "@/server/http/errors";
import { TOKEN_MAX_AGE_SECONDS } from "@/server/auth/identity";
import { clientIp, isLinkRateLimited, recordLinkFailure, redeemHandoff } from "@/server/auth/link-codes";
import { createSession, deleteSession } from "@/server/auth/sessions";
import { signInWithProvider } from "@/server/services/accounts";
import { finishAppLoginSchema, type FinishAppLoginInput, type Session } from "@/shared/contract";

export const runtime = "edge";

export const POST = defineRoute<FinishAppLoginInput, Session>({
  schema: finishAppLoginSchema,
  source: "body",
  handler: async ({ db, identity, input, request, responseHeaders }) => {
    const ip = clientIp(request);
    if (isLinkRateLimited(ip)) {
      throw new ApiException("rate_limited", "Urinishlar ko'p bo'ldi. 10 daqiqadan keyin qayta urining.", 429);
    }
    const handoff = await redeemHandoff(db, input.code, input.verifier);
    // Kodni faqat oqimni boshlagan ilova (o'sha token) ishlata oladi.
    if (!handoff || handoff.userId !== identity.userId) {
      recordLinkFailure(ip);
      throw badRequest("Kirish tugallanmadi. Qayta urinib ko'ring.");
    }

    const userId = await signInWithProvider(db, identity.userId, handoff.profile);
    const token = await createSession(db, userId);
    if (!identity.isNew) await deleteSession(db, identity.token);
    responseHeaders.delete("Set-Cookie");

    return {
      userId,
      token,
      expiresAt: new Date(Date.now() + TOKEN_MAX_AGE_SECONDS * 1000).toISOString(),
    };
  },
});

export const OPTIONS = POST;
