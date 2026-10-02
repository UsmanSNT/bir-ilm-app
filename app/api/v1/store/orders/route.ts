/** Buyurtmalar: o'z buyurtmalari ro'yxati va yangi buyurtma (faqat tizimga kirganlar). */
import { defineRoute } from "@/server/http/handler";
import { listOrders, placeOrder } from "@/server/services/store";
import { placeOrderSchema, type PlaceOrderInput, type StoreOrder } from "@/shared/contract";

export const runtime = "edge";

export const GET = defineRoute<undefined, { items: StoreOrder[] }>({
  handler: async ({ db, identity }) => ({ items: await listOrders(db, identity.userId) }),
});

export const POST = defineRoute<PlaceOrderInput, StoreOrder>({
  schema: placeOrderSchema,
  source: "body",
  status: 201,
  handler: async ({ db, identity, input }) => placeOrder(db, identity.userId, input),
});

export const OPTIONS = GET;
