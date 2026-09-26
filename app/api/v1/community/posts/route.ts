/** Formatlangan post yoki maqola joylash (faqat ro'yxatdan o'tganlar). */
import { defineRoute } from "@/server/http/handler";
import { createCommunityPost } from "@/server/services/community";
import { createCommunityPostSchema, type CreateCommunityPostInput } from "@/shared/contract";

export const runtime = "edge";

export const POST = defineRoute<CreateCommunityPostInput, { id: string }>({
  schema: createCommunityPostSchema,
  source: "body",
  status: 201,
  handler: ({ db, identity, input }) => createCommunityPost(db, identity.userId, input),
});

export const OPTIONS = POST;
