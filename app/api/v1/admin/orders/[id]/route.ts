/** Admin: buyurtma holatini o'zgartirish. */
import { defineRoute } from "@/server/http/handler";
import { badRequest } from "@/server/http/errors";
import { requireRole } from "@/server/services/roles";
import { setOrderStatus } from "@/server/services/store";
import { orderStatusSchema, type OrderStatusInput, type StoreOrder } from "@/shared/contract";

export const runtime = "edge";

export const PATCH = defineRoute<OrderStatusInput, StoreOrder>({
  schema: orderStatusSchema,
  source: "body",
  handler: async ({ db, identity, input, params }) => {
    await requireRole(db, identity.userId, ["admin"], "Buyurtmani faqat admin o'zgartiradi.");
    if (!params.id) throw badRequest("Buyurtma ko'rsatilmagan.");
    return setOrderStatus(db, params.id, input.status);
  },
});

export const OPTIONS = PATCH;
