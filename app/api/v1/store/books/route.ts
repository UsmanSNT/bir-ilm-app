/** Book Store vitrinasi: narxi qo'yilgan kitoblar, reyting bilan. */
import { defineRoute } from "@/server/http/handler";
import { listStoreBooks } from "@/server/services/store";
import type { StoreBook } from "@/shared/contract";

export const runtime = "edge";

export const GET = defineRoute<undefined, { items: StoreBook[] }>({
  handler: async ({ db }) => ({ items: await listStoreBooks(db) }),
});

export const OPTIONS = GET;
