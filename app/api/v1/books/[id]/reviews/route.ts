/** Kitob sharhlari: o'qish — hamma; yozish/o'chirish — faqat o'z sharhi, tizimga kirganlar. */
import { defineRoute } from "@/server/http/handler";
import { badRequest } from "@/server/http/errors";
import { deleteReview, listReviews, saveReview } from "@/server/services/store";
import { reviewSchema, type ReviewInput, type ReviewSummary } from "@/shared/contract";

export const runtime = "edge";

function bookIdOf(params: Record<string, string>): string {
  const id = params.id;
  if (!id) throw badRequest("Kitob identifikatori ko'rsatilmagan.");
  return id;
}

export const GET = defineRoute<undefined, ReviewSummary>({
  handler: async ({ db, identity, params }) => listReviews(db, bookIdOf(params), identity.userId),
});

export const PUT = defineRoute<ReviewInput, ReviewSummary>({
  schema: reviewSchema,
  source: "body",
  handler: async ({ db, identity, input, params }) => saveReview(db, identity.userId, bookIdOf(params), input),
});

export const DELETE = defineRoute<undefined, ReviewSummary>({
  handler: async ({ db, identity, params }) => deleteReview(db, identity.userId, bookIdOf(params)),
});

export const OPTIONS = GET;
