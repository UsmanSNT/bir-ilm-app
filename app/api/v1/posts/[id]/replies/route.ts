/** Postga izoh qoldirish. */
import { defineRoute } from "@/server/http/handler";
import { badRequest } from "@/server/http/errors";
import { createReply } from "@/server/services/social";
import { createReplySchema, type CreateReplyInput, type Reply } from "@/shared/contract";

export const runtime = "edge";

export const POST = defineRoute<CreateReplyInput, Reply>({
  schema: createReplySchema,
  source: "body",
  status: 201,
  handler: ({ db, identity, input, params }) => {
    const postId = params.id;
    if (!postId) throw badRequest("Post identifikatori ko'rsatilmagan.");

    return createReply(db, identity.userId, postId, input);
  },
});

export const OPTIONS = POST;
