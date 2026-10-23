/** Jonli suhbatlar ro'yxati va yaratish. */
import { defineRoute } from "@/server/http/handler";
import { forbidden } from "@/server/http/errors";
import { createLiveSession, listLiveSessions } from "@/server/services/live";
import { createCommunityPost } from "@/server/services/community";
import { getUserRole, requireRole } from "@/server/services/roles";
import { canModerate } from "@/shared/contract/roles";
import {
  createLiveSessionSchema,
  plainToDoc,
  type CreateLiveSessionInput,
  type LiveSession,
} from "@/shared/contract";

export const runtime = "edge";

export const GET = defineRoute<undefined, LiveSession[]>({
  // Tugagan, audiosi joylanmagan suhbatlar va xom yozuvlar faqat admin/moderatorga.
  handler: async ({ db, identity }) => listLiveSessions(db, canModerate(await getUserRole(db, identity.userId))),
});

export const POST = defineRoute<CreateLiveSessionInput, LiveSession>({
  schema: createLiveSessionSchema,
  source: "body",
  status: 201,
  handler: async ({ db, identity, input }) => {
    const role = await requireRole(db, identity.userId, ["admin", "moderator"], "Suhbatni faqat admin yoki moderator yarata oladi.");
    // E’lon (bosh sahifa va e’lonlar doskasi) faqat admin uchun; moderator suhbatni e’lonsiz ochadi.
    if (input.announcement && role !== "admin") throw forbidden("E’lonni faqat admin joylaydi.");
    const session = await createLiveSession(db, identity.userId, input);
    if (input.announcement) {
      await createCommunityPost(db, identity.userId, {
        format: "post",
        kind: "announcement",
        title: input.announcement.title,
        book: input.bookTitle,
        content: plainToDoc(input.announcement.body),
        attachments: [],
        design: null,
      });
    }
    return session;
  },
});

export const OPTIONS = POST;
