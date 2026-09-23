/** Postni o'chirish. Faqat muallifning o'zi o'chira oladi. */
import { defineRoute } from "@/server/http/handler";
import { badRequest } from "@/server/http/errors";
import { deletePost } from "@/server/services/social";
import type { Empty } from "@/shared/contract";

export const runtime = "edge";

export const DELETE = defineRoute<undefined, Empty>({
  handler: async ({ db, identity, params }) => {
    const postId = params.id;
    if (!postId) throw badRequest("Post identifikatori ko'rsatilmagan.");

    await deletePost(db, identity.userId, postId);
    return {} as Empty;
  },
});

export const OPTIONS = DELETE;
