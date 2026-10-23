/** Xatcho‘p yoki belgini o'chirish (faqat o'zinikini). */
import { defineRoute } from "@/server/http/handler";
import { removeMark } from "@/server/services/ebook-marks";
import type { Empty } from "@/shared/contract";

export const runtime = "edge";

export const DELETE = defineRoute<undefined, Empty>({
  handler: async ({ db, identity, params }) => {
    await removeMark(db, identity.userId, params.id, params.mid);
    return {} as Empty;
  },
});
