/** Qisqa videolar: ro'yxat — hamma, qo'shish — faqat admin (YouTube/Instagram/Facebook havolasi). */
import { defineRoute } from "@/server/http/handler";
import { requireRole } from "@/server/services/roles";
import { addVideo, listVideos } from "@/server/services/site";
import { addVideoSchema, type AddVideoInput, type SiteVideo } from "@/shared/contract";

export const runtime = "edge";

export const GET = defineRoute<undefined, { items: SiteVideo[] }>({
  handler: async ({ db }) => ({ items: await listVideos(db) }),
});

export const POST = defineRoute<AddVideoInput, SiteVideo>({
  schema: addVideoSchema,
  source: "body",
  status: 201,
  handler: async ({ db, identity, input }) => {
    await requireRole(db, identity.userId, ["admin"], "Videoni faqat admin qo'shadi.");
    return addVideo(db, identity.userId, input);
  },
});

export const OPTIONS = GET;
