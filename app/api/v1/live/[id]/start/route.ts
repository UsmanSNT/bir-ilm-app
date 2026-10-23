/** Suhbatni boshlash: admin — har qanday; moderator — o'zi ochgan suhbatni. Boshlanmaguncha xonaga hech kim kira olmaydi. */
import { defineRoute } from "@/server/http/handler";
import { badRequest, forbidden, notFound } from "@/server/http/errors";
import { canHostLiveSession, getLiveSession, startLiveSession } from "@/server/services/live";
import { getUserRole } from "@/server/services/roles";
import type { LiveSession } from "@/shared/contract";

export const runtime = "edge";

export const POST = defineRoute<undefined, LiveSession>({
  handler: async ({ db, identity, params }) => {
    const session = await getLiveSession(db, params.id, true);
    if (!session) throw notFound("Suhbat topilmadi.");
    if (!canHostLiveSession(await getUserRole(db, identity.userId), session, identity.userId)) {
      throw forbidden("Suhbatni admin yoki uni ochgan moderator boshlaydi.");
    }
    if (session.status === "ended") throw badRequest("Suhbat allaqachon tugagan.");
    if (session.status === "planned") await startLiveSession(db, params.id);
    return (await getLiveSession(db, params.id, true))!;
  },
});
