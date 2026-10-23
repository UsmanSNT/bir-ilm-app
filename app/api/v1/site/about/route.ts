/** «Biz haqimizda»: o'qish — hamma, o'zgartirish — faqat admin. */
import { defineRoute } from "@/server/http/handler";
import { getAbout, saveAbout } from "@/server/services/about";
import { requireRole } from "@/server/services/roles";
import { aboutInputSchema, type AboutSettings } from "@/shared/contract";

export const runtime = "edge";

export const GET = defineRoute<undefined, AboutSettings>({
  handler: async ({ db }) => getAbout(db),
});

export const PUT = defineRoute<AboutSettings, AboutSettings>({
  schema: aboutInputSchema,
  source: "body",
  handler: async ({ db, identity, input }) => {
    await requireRole(db, identity.userId, ["admin"], "«Biz haqimizda»ni faqat admin o'zgartiradi.");
    return saveAbout(db, input);
  },
});

export const OPTIONS = GET;
