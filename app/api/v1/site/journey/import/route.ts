/** «Bir Ilm yo'li»: o'tgan kitoblar ro'yxatini bir yo'la joylash — faqat admin. */
import { defineRoute } from "@/server/http/handler";
import { importJourneyTitles } from "@/server/services/journey";
import { requireRole } from "@/server/services/roles";
import { journeyImportSchema, type JourneyImportData, type JourneyImportResult } from "@/shared/contract";

export const runtime = "edge";

export const POST = defineRoute<JourneyImportData, JourneyImportResult>({
  schema: journeyImportSchema,
  source: "body",
  handler: async ({ db, identity, input }) => {
    await requireRole(db, identity.userId, ["admin"], "«Bir Ilm yo‘li» kitoblarini faqat admin kiritadi.");
    return importJourneyTitles(db, input);
  },
});

export const OPTIONS = POST;
