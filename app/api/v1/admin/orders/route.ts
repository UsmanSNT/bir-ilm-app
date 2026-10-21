/** Admin: do'kon buyurtmalari (holat bo'yicha filtr). */
import { z } from "zod";
import { defineRoute } from "@/server/http/handler";
import { requireRole } from "@/server/services/roles";
import { listAllOrders } from "@/server/services/store";
import { ORDER_STATUSES, type StoreOrder } from "@/shared/contract";

export const runtime = "edge";

const querySchema = z.object({ status: z.enum(ORDER_STATUSES).optional() });
type Query = z.infer<typeof querySchema>;

export const GET = defineRoute<Query, { items: StoreOrder[] }>({
  schema: querySchema,
  source: "query",
  handler: async ({ db, identity, input }) => {
    await requireRole(db, identity.userId, ["admin"], "Buyurtmalarni faqat admin ko'radi.");
    return { items: await listAllOrders(db, input.status) };
  },
});

export const OPTIONS = GET;
