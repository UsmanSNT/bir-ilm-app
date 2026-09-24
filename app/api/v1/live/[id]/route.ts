/** Bitta jonli suhbat tafsilotlari. */
import { defineRoute } from "@/server/http/handler";
import { getLiveSession, getParticipants, getRecentMessages } from "@/server/services/live";
import type { LiveSession, LiveParticipant, LiveMessage } from "@/shared/contract";

export const runtime = "edge";

type SessionDetail = {
  session: LiveSession;
  participants: LiveParticipant[];
  recentMessages: LiveMessage[];
};

export const GET = defineRoute<undefined, SessionDetail>({
  handler: async ({ db, params }) => {
    const session = await getLiveSession(db, params.id);
    if (!session) throw new Error("Suhbat topilmadi.");
    const [participants, recentMessages] = await Promise.all([
      getParticipants(db, params.id),
      getRecentMessages(db, params.id),
    ]);
    return { session, participants, recentMessages };
  },
});

export const OPTIONS = GET;
