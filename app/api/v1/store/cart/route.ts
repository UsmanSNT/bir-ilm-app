/** Savat: serverda saqlanadi (web va mobil ilovada bir xil). Mehmon ham to'ldira oladi. */
import { defineRoute } from "@/server/http/handler";
import { getCart, replaceCart } from "@/server/services/store";
import { cartSchema, type CartInput, type CartLine } from "@/shared/contract";

export const runtime = "edge";

export const GET = defineRoute<undefined, { items: CartLine[] }>({
  handler: async ({ db, identity }) => ({ items: await getCart(db, identity.userId) }),
});

export const PUT = defineRoute<CartInput, { items: CartLine[] }>({
  schema: cartSchema,
  source: "body",
  handler: async ({ db, identity, input }) => ({ items: await replaceCart(db, identity.userId, input) }),
});

export const OPTIONS = GET;
