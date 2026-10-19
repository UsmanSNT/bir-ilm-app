/**
 * Suhbat izohlari (faqat admin va moderator): efirda suzib o'tgan izohlarning to'liq ro'yxati,
 * eskidan yangiga, kursor bilan sahifalab. Oddiy foydalanuvchiga izoh tarixi berilmaydi.
 */
import { defineRoute } from "@/server/http/handler";
import { notFound } from "@/server/http/errors";
import { getLiveSession, listMessages } from "@/server/services/live";
import { requireRole } from "@/server/services/roles";
import { liveMessagesQuerySchema, type LiveMessage, type LiveMessagesQuery, type Page } from "@/shared/contract";

export const runtime = "edge";

export const GET = defineRoute<LiveMessagesQuery, Page<LiveMessage>>({
  schema: liveMessagesQuerySchema,
  source: "query",
  handler: async ({ db, identity, input, params }) => {
    await requireRole(db, identity.userId, ["admin", "moderator"], "Suhbat izohlarini faqat admin va moderator ko‘radi.");
    if (!(await getLiveSession(db, params.id))) throw notFound("Suhbat topilmadi.");
    return listMessages(db, params.id, input);
  },
});

export const OPTIONS = GET;
