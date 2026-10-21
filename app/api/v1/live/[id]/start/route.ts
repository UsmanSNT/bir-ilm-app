/** Suhbatni boshlash (faqat admin). Boshlanmaguncha xonaga hech kim kira olmaydi. */
import { defineRoute } from "@/server/http/handler";
import { badRequest, notFound } from "@/server/http/errors";
import { getLiveSession, startLiveSession } from "@/server/services/live";
import { requireRole } from "@/server/services/roles";
import type { LiveSession } from "@/shared/contract";

export const runtime = "edge";

export const POST = defineRoute<undefined, LiveSession>({
  handler: async ({ db, identity, params }) => {
    await requireRole(db, identity.userId, ["admin"], "Suhbatni faqat admin boshlaydi.");
    const session = await getLiveSession(db, params.id, true);
    if (!session) throw notFound("Suhbat topilmadi.");
    if (session.status === "ended") throw badRequest("Suhbat allaqachon tugagan.");
    if (session.status === "planned") await startLiveSession(db, params.id);
    return (await getLiveSession(db, params.id, true))!;
  },
});
