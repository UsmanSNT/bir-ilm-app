/** Yangi post yaratish. */
import { defineRoute } from "@/server/http/handler";
import { createPost } from "@/server/services/social";
import { createPostSchema, type CreatePostInput, type Post } from "@/shared/contract";

export const runtime = "edge";

export const POST = defineRoute<CreatePostInput, Post>({
  schema: createPostSchema,
  source: "body",
  status: 201,
  handler: ({ db, identity, input }) => createPost(db, identity.userId, input),
});

export const OPTIONS = POST;
