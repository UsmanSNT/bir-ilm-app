/** «Bir Ilm yo'li» kitoblar ro'yxati: qaysi shanba qaysi kitob muhokama qilingan yoki qilinadi (hamma o'qiydi). */
import { defineRoute } from "@/server/http/handler";
import { listJourneyBooks } from "@/server/services/journey";
import type { JourneyBook } from "@/shared/contract";

export const runtime = "edge";

export const GET = defineRoute<undefined, { items: JourneyBook[] }>({
  handler: async ({ db }) => ({ items: await listJourneyBooks(db) }),
});

export const OPTIONS = GET;
