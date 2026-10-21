/**
 * Ilovada Google/Telegram bilan kirishni boshlash.
 *
 * `POST { provider, challenge }` — telefon brauzerida ochiladigan havolani qaytaradi.
 * Kirish tugagach brauzer `uz.birilm.app://auth?code=…` ga qaytadi va ilova
 * `/api/v1/auth/app-login/redeem` orqali tokenni oladi.
 */
import { defineRoute } from "@/server/http/handler";
import { badRequest } from "@/server/http/errors";
import { createAppFlow } from "@/server/auth/link-codes";
import { loginConfig } from "@/server/auth/providers";
import { ensureUser } from "@/server/services/social";
import { startAppLoginSchema, type AppLoginStart, type StartAppLoginInput } from "@/shared/contract";

export const runtime = "edge";

export const POST = defineRoute<StartAppLoginInput, AppLoginStart>({
  schema: startAppLoginSchema,
  source: "body",
  status: 201,
  handler: async ({ db, identity, input, request }) => {
    const config = loginConfig(request);
    if (!config[input.provider]) {
      throw badRequest(input.provider === "google" ? "Google orqali kirish hali sozlanmagan." : "Telegram orqali kirish hali sozlanmagan.");
    }
    await ensureUser(db, identity.userId);
    const flow = await createAppFlow(db, identity.userId, input.challenge);
    return { url: `${config.publicUrl}/api/auth/${input.provider}?flow=${flow}` };
  },
});

export const OPTIONS = POST;
