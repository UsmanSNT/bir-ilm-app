/**
 * Boshqa qurilmani ulash kodi.
 *
 * `POST` — kirgan foydalanuvchi uchun 6 xonali kod (10 daqiqa, bir marta).
 * Ikkinchi qurilma uni `/api/v1/auth/link-code/redeem` ga yuboradi.
 */
import { defineRoute } from "@/server/http/handler";
import { forbidden } from "@/server/http/errors";
import { createLinkCode } from "@/server/auth/link-codes";
import { isSignedIn } from "@/server/services/accounts";
import type { LinkCode } from "@/shared/contract";

export const runtime = "edge";

export const POST = defineRoute<undefined, LinkCode>({
  status: 201,
  handler: async ({ db, identity }) => {
    if (!(await isSignedIn(db, identity.userId))) {
      throw forbidden("Avval Google yoki Telegram orqali kiring.");
    }
    return createLinkCode(db, identity.userId);
  },
});

export const OPTIONS = POST;
