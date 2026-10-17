/** Ijtimoiy tarmoq havolalari: o'qish — hamma (mehmon ham), o'zgartirish — faqat admin. */
import { defineRoute } from "@/server/http/handler";
import { requireRole } from "@/server/services/roles";
import { getSiteLinks, saveSiteLinks } from "@/server/services/site";
import { siteLinksSchema, type SiteLinks, type SiteLinksInput } from "@/shared/contract";

export const runtime = "edge";

export const GET = defineRoute<undefined, SiteLinks>({
  handler: async ({ db }) => getSiteLinks(db),
});

export const PUT = defineRoute<SiteLinksInput, SiteLinks>({
  schema: siteLinksSchema,
  source: "body",
  handler: async ({ db, identity, input }) => {
    await requireRole(db, identity.userId, ["admin"], "Havolalarni faqat admin o'zgartiradi.");
    return saveSiteLinks(db, input);
  },
});

export const OPTIONS = GET;
