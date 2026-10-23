/** «Bir Ilm yo'li»: bitta haftaning kitob nomini qo'lda yozish (`PUT`) yoki olib tashlash (`DELETE`) — faqat admin. */
import { defineRoute } from "@/server/http/handler";
import { badRequest } from "@/server/http/errors";
import { removeJourneyTitle, setJourneyTitle } from "@/server/services/journey";
import { requireRole } from "@/server/services/roles";
import { journeyTitleSchema, type JourneyBook, type JourneyTitleData } from "@/shared/contract";

export const runtime = "edge";

const ADMIN_ONLY = "«Bir Ilm yo‘li» kitoblarini faqat admin kiritadi.";

function numberOf(raw: string | undefined): number {
  if (!raw || !/^\d{1,5}$/.test(raw)) throw badRequest("Kitob raqami noto‘g‘ri.");
  return Number(raw);
}

export const PUT = defineRoute<JourneyTitleData, { items: JourneyBook[] }>({
  schema: journeyTitleSchema,
  source: "body",
  handler: async ({ db, identity, input, params }) => {
    await requireRole(db, identity.userId, ["admin"], ADMIN_ONLY);
    return { items: await setJourneyTitle(db, numberOf(params.number), input) };
  },
});

export const DELETE = defineRoute<undefined, { items: JourneyBook[] }>({
  handler: async ({ db, identity, params }) => {
    await requireRole(db, identity.userId, ["admin"], ADMIN_ONLY);
    return { items: await removeJourneyTitle(db, numberOf(params.number)) };
  },
});

export const OPTIONS = PUT;
