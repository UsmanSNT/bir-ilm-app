/** «Bir Ilm yo'li» yacheykasini tahrirlash (nom, muallif, matn, moderator) — admin va moderator. */
import { defineRoute } from "@/server/http/handler";
import { badRequest } from "@/server/http/errors";
import { updateJourneySlot } from "@/server/services/journey";
import { requireRole } from "@/server/services/roles";
import { journeyDetailsSchema, type JourneyDetailsData, type JourneySlot } from "@/shared/contract";

export const runtime = "edge";

const STAFF_ONLY = "«Bir Ilm yo‘li» kitoblarini faqat admin yoki moderator tahrirlaydi.";

function numberOf(raw: string | undefined): number {
  if (!raw || !/^\d{1,5}$/.test(raw)) throw badRequest("Kitob raqami noto‘g‘ri.");
  return Number(raw);
}

export const PUT = defineRoute<JourneyDetailsData, { item: JourneySlot }>({
  schema: journeyDetailsSchema,
  source: "body",
  handler: async ({ db, identity, input, params }) => {
    await requireRole(db, identity.userId, ["admin", "moderator"], STAFF_ONLY);
    return { item: await updateJourneySlot(db, numberOf(params.number), input, identity.userId) };
  },
});

export const OPTIONS = PUT;
