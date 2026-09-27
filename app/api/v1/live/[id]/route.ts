/** Bitta jonli suhbat: tafsilotlar va o'chirish (faqat admin). */
import { defineRoute } from "@/server/http/handler";
import { notFound } from "@/server/http/errors";
import { deleteLiveSession, getLiveSession, getParticipants, getRecentMessages, updateLiveSession } from "@/server/services/live";
import { createCommunityPost } from "@/server/services/community";
import { getUserRole, requireRole } from "@/server/services/roles";
import { canModerate } from "@/shared/contract/roles";
import {
  plainToDoc,
  updateLiveSessionSchema,
  type Empty,
  type LiveSession,
  type LiveParticipant,
  type LiveMessage,
  type UpdateLiveSessionInput,
} from "@/shared/contract";

export const runtime = "edge";

type SessionDetail = {
  session: LiveSession;
  participants: LiveParticipant[];
  recentMessages: LiveMessage[];
};

export const GET = defineRoute<undefined, SessionDetail>({
  handler: async ({ db, identity, params }) => {
    const staff = canModerate(await getUserRole(db, identity.userId));
    const session = await getLiveSession(db, params.id, staff);
    // Audiosi joylanmagan tugagan suhbat oddiy foydalanuvchiga yo'q.
    if (!session || (!staff && session.status === "ended" && !session.archive)) throw notFound("Suhbat topilmadi.");
    const [participants, recentMessages] = await Promise.all([
      getParticipants(db, params.id),
      getRecentMessages(db, params.id),
    ]);
    return { session, participants, recentMessages };
  },
});

/** Vaqt, sarlavha yoki kitob nomini o'zgartirish (admin); xohlasa e'lon ham joylanadi. */
export const PATCH = defineRoute<UpdateLiveSessionInput, LiveSession>({
  schema: updateLiveSessionSchema,
  source: "body",
  handler: async ({ db, identity, input, params }) => {
    await requireRole(db, identity.userId, ["admin"], "Suhbatni faqat admin o'zgartiradi.");
    const session = await updateLiveSession(db, params.id, input);
    if (input.announcement) {
      await createCommunityPost(db, identity.userId, {
        format: "post",
        kind: "announcement",
        title: input.announcement.title,
        book: session.bookTitle,
        content: plainToDoc(input.announcement.body),
        attachments: [],
      });
    }
    return session;
  },
});

export const DELETE = defineRoute<undefined, Empty>({
  handler: async ({ db, identity, params }) => {
    await requireRole(db, identity.userId, ["admin"], "Suhbatni faqat admin o'chiradi.");
    const session = await getLiveSession(db, params.id);
    if (session?.status === "live") throw notFound("Jonli suhbatni avval tugating.");
    await deleteLiveSession(db, params.id);
    return {} as Empty;
  },
});

export const OPTIONS = GET;
