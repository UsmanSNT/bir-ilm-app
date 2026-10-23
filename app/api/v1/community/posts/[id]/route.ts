/** O'z postini tahrirlash. */
import { defineRoute } from "@/server/http/handler";
import { updateCommunityPost } from "@/server/services/community";
import { createCommunityPostSchema, type CreateCommunityPostInput } from "@/shared/contract";

export const runtime = "edge";

export const PUT = defineRoute<CreateCommunityPostInput, { id: string }>({
  schema: createCommunityPostSchema,
  source: "body",
  handler: ({ db, identity, input, params }) => updateCommunityPost(db, identity.userId, params.id ?? "", input),
});

export const OPTIONS = PUT;
