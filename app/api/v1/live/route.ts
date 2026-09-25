/** Jonli suhbatlar ro'yxati va yaratish. */
import { defineRoute } from "@/server/http/handler";
import { createLiveSession, listLiveSessions } from "@/server/services/live";
import { requireRole } from "@/server/services/roles";
import {
  createLiveSessionSchema,
  type CreateLiveSessionInput,
  type LiveSession,
} from "@/shared/contract";

export const runtime = "edge";

export const GET = defineRoute<undefined, LiveSession[]>({
  handler: ({ db }) => listLiveSessions(db),
});

export const POST = defineRoute<CreateLiveSessionInput, LiveSession>({
  schema: createLiveSessionSchema,
  source: "body",
  status: 201,
  handler: async ({ db, identity, input }) => {
    await requireRole(db, identity.userId, ["admin"], "Suhbatni faqat admin yarata oladi.");
    return createLiveSession(db, identity.userId, input);
  },
});

export const OPTIONS = POST;
