/** «Bir Ilm yo'li» javoni: har bir haftaning yacheykasi (bo'sh ham bo'ladi) — hamma o'qiydi. */
import { defineRoute } from "@/server/http/handler";
import { listJourneySlots } from "@/server/services/journey";
import type { JourneySlot } from "@/shared/contract";

export const runtime = "edge";

export const GET = defineRoute<undefined, { items: JourneySlot[] }>({
  handler: async ({ db }) => ({ items: await listJourneySlots(db) }),
});

export const OPTIONS = GET;
