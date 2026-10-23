/** Hikmatni tahrirlash, bugunga belgilash va o'chirish (faqat admin). */
import { defineRoute } from "@/server/http/handler";
import { requireRole } from "@/server/services/roles";
import { deleteWisdom, updateWisdom } from "@/server/services/wisdom";
import { wisdomUpdateSchema, type Empty, type Wisdom, type WisdomUpdate } from "@/shared/contract";

export const runtime = "edge";

export const PUT = defineRoute<WisdomUpdate, Wisdom>({
  schema: wisdomUpdateSchema,
  source: "body",
  handler: async ({ db, identity, input, params }) => {
    await requireRole(db, identity.userId, ["admin"], "Hikmatni faqat admin o'zgartiradi.");
    return updateWisdom(db, params.id, input);
  },
});

export const DELETE = defineRoute<undefined, Empty>({
  handler: async ({ db, identity, params }) => {
    await requireRole(db, identity.userId, ["admin"], "Hikmatni faqat admin o'chiradi.");
    await deleteWisdom(db, params.id);
    return {} as Empty;
  },
});

export const OPTIONS = PUT;
