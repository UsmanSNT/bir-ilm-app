/** Postga reaksiya: `emoji` — qo'yish yoki almashtirish, `null` — olib tashlash. */
import { defineRoute } from "@/server/http/handler";
import { setReaction } from "@/server/services/community";
import { reactSchema, type ReactInput, type ReactionCount } from "@/shared/contract";

export const runtime = "edge";

export const POST = defineRoute<ReactInput, { reactions: ReactionCount[]; mine: string | null }>({
  schema: reactSchema,
  source: "body",
  handler: ({ db, identity, input }) => setReaction(db, identity.userId, input),
});

export const OPTIONS = POST;
