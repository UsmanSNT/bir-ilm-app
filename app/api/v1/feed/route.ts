/** Lenta: barcha / obuna bo'lganlar / o'zim / muallif bo'yicha, kursorli. */
import { defineRoute } from "@/server/http/handler";
import { getFeed } from "@/server/services/social";
import { feedQuerySchema, type FeedQuery, type Page, type Post } from "@/shared/contract";

export const runtime = "edge";

export const GET = defineRoute<FeedQuery, Page<Post>>({
  schema: feedQuerySchema,
  source: "query",
  handler: ({ db, identity, input }) => getFeed(db, identity.userId, input),
});

export const OPTIONS = GET;
