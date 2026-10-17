/** Buyurtma ko'rinishi: bazadagi qatorlardan API javobi (store va store-chat ishlatadi). */
import { inArray } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { schema } from "@/server/db/client";
import type { StoreOrder } from "@/shared/contract";

const { storeOrders, storeOrderItems } = schema;
export type OrderRow = typeof storeOrders.$inferSelect;
type ItemRow = typeof storeOrderItems.$inferSelect;

export function toOrders(rows: OrderRow[], items: ItemRow[]): StoreOrder[] {
  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    name: row.name,
    phone: row.phone,
    telegram: row.telegram,
    address: row.address,
    note: row.note,
    payment: row.payment,
    status: row.status,
    total: row.total,
    createdAt: row.createdAt,
    adminUnread: row.adminUnread,
    userUnread: row.userUnread,
    lines: items
      .filter((item) => item.orderId === row.id)
      .map(({ bookId, title, qty, price }) => ({ bookId, title, qty, price })),
  }));
}

export async function withItems(db: Database, rows: OrderRow[]): Promise<StoreOrder[]> {
  if (!rows.length) return [];
  const items = await db
    .select()
    .from(storeOrderItems)
    .where(inArray(storeOrderItems.orderId, rows.map((row) => row.id)))
    .orderBy(storeOrderItems.id);
  return toOrders(rows, items);
}
