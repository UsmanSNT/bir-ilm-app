"use client";

import { useEffect, useState } from "react";
import { Phone } from "lucide-react";
import { fetchAdminOrders, setAdminOrderStatus } from "@/lib/api/store-client";
import { refreshAdminAttention } from "@/lib/api/admin-attention";
import { formatPrice, ORDER_STATUSES, ORDER_STATUS_LABELS, PAYMENT_LABELS, type OrderStatus, type StoreOrder } from "@/shared/contract";

/** Admin: do'kon buyurtmalari — holat bo'yicha filtr, holatni o'zgartirish, mijozga qo'ng'iroq. */
export default function AdminOrders() {
  const [filter, setFilter] = useState<OrderStatus | "all">("new");
  const [orders, setOrders] = useState<StoreOrder[] | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchAdminOrders(filter === "all" ? undefined : filter)
      .then((items) => { if (alive) { setOrders(items); setError(""); } })
      .catch((e: Error) => { if (alive) { setOrders([]); setError(e.message); } });
    return () => { alive = false; };
  }, [filter]);

  async function change(order: StoreOrder, status: OrderStatus) {
    setSaving(order.id);
    setError("");
    try {
      const updated = await setAdminOrderStatus(order.id, status);
      refreshAdminAttention();
      setOrders((prev) => (prev ?? []).map((o) => (o.id === updated.id ? updated : o)).filter((o) => filter === "all" || o.status === filter));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="admin-panel admin-orders">
      <div className="admin-orders-filter" role="group" aria-label="Holat bo'yicha">
        {(["all", ...ORDER_STATUSES] as const).map((s) => (
          <button key={s} aria-pressed={filter === s} onClick={() => { setOrders(null); setFilter(s); }}>{s === "all" ? "Barchasi" : ORDER_STATUS_LABELS[s]}</button>
        ))}
      </div>
      {error && <p className="admin-error" role="alert">{error}</p>}
      {orders === null && <p className="admin-empty">Yuklanmoqda…</p>}
      {orders?.length === 0 && !error && <p className="admin-empty">Buyurtma yo‘q.</p>}
      {orders?.map((o) => (
        <article className="admin-order" key={o.id}>
          <div className="admin-order-head">
            <strong>№ {o.id}</strong>
            <select aria-label={`${o.id} holati`} value={o.status} disabled={saving === o.id} onChange={(e) => void change(o, e.target.value as OrderStatus)}>
              {ORDER_STATUSES.map((s) => <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>)}
            </select>
          </div>
          <span>{o.name} · <a href={`tel:${o.phone}`}><Phone size={13} /> {o.phone}</a>{o.telegram && <> · <a href={`https://t.me/${o.telegram}`} target="_blank" rel="noopener noreferrer">@{o.telegram}</a></>}</span>
          <span>{o.address}</span>
          {o.note && <span className="admin-empty">Izoh: {o.note}</span>}
          <span>{o.lines.map((l) => `${l.title} ×${l.qty}`).join(", ")}</span>
          <strong>{formatPrice(o.total)} · {PAYMENT_LABELS[o.payment]} · {new Date(o.createdAt).toLocaleString("ru-RU")}</strong>
        </article>
      ))}
    </div>
  );
}
