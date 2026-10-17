/** Xaridorning o'z baholari (Hisobim → Savat → Baholar). */
import { defineRoute } from "@/server/http/handler";
import { listMyReviews } from "@/server/services/store";
import type { MyReview } from "@/shared/contract";

export const runtime = "edge";

export const GET = defineRoute<undefined, { items: MyReview[] }>({
  handler: async ({ db, identity }) => ({ items: await listMyReviews(db, identity.userId) }),
});

export const OPTIONS = GET;
