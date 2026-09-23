/**
 * O'qish jarayoni.
 *
 * Bir xil foydalanuvchi telefonda o'qib, keyin webda davom ettirsa — sahifa
 * raqami serverda saqlangani uchun o'sha joydan davom etadi.
 */
import { defineRoute } from "@/server/http/handler";
import { listProgress, resolveName, updateProgress } from "@/server/services/library";
import {
  updateProgressSchema,
  type ReadingProgress,
  type UpdateProgressInput,
} from "@/shared/contract";

export const runtime = "edge";

export const GET = defineRoute<undefined, { items: ReadingProgress[] }>({
  handler: async ({ db, identity }) => ({
    items: await listProgress(db, identity.userId),
  }),
});

export const PUT = defineRoute<UpdateProgressInput, ReadingProgress>({
  schema: updateProgressSchema,
  source: "body",
  handler: async ({ db, identity, input }) => {
    const name = await resolveName(db, identity.userId);
    return updateProgress(db, identity.userId, name, input);
  },
});

export const OPTIONS = GET;
