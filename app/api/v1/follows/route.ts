/** Obuna bo'lish / bekor qilish. */
import { defineRoute } from "@/server/http/handler";
import { setFollow } from "@/server/services/social";
import { followSchema, type FollowInput } from "@/shared/contract";

export const runtime = "edge";

export const POST = defineRoute<FollowInput, { following: boolean }>({
  schema: followSchema,
  source: "body",
  handler: ({ db, identity, input }) => setFollow(db, identity.userId, input),
});

export const OPTIONS = POST;
