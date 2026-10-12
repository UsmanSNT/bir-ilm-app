"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, MessageCircle, Phone } from "lucide-react";
import { fetchAdminOrders, setAdminOrderStatus } from "@/lib/api/store-client";
import { refreshAdminAttention } from "@/lib/api/admin-attention";
import { formatPrice, ORDER_STATUSES, ORDER_STATUS_LABELS, PAYMENT_LABELS, type OrderStatus, type StoreOrder } from "@/shared/contract";
import { OrderProgress } from "./order-status";
import StoreChatThread from "./store-chat";

/** Admin: do'kon buyurtmalari — holat bo'yicha filtr, holatni o'zgartirish, har bir buyurtmaning alohida yozishmasi, mijozga qo'ng'iroq. */
export default function AdminOrders() {
  const [filter, setFilter] = useState<OrderStatus | "all">("new");
  const [orders, setOrders] = useState<StoreOrder[] | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [openOrder, setOpenOrder] = useState<StoreOrder | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    fetchAdminOrders(filter === "all" ? undefined : filter)
      .then((items) => { if (alive) { setOrders(items); setError(""); } })
      .catch((e: Error) => { if (alive) { setOrders([]); setError(e.message); } });
    return () => { alive = false; };
  }, [filter, reload]);

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

  if (openOrder) {
    return (
      <div className="admin-panel admin-order-chat">
        <button type="button" className="admin-chat-back" onClick={() => { setOpenOrder(null); setReload((n) => n + 1); }}>
          <ArrowLeft size={17} />Buyurtmalar
        </button>
        <StoreChatThread key={openOrder.id} me="admin" customerId={openOrder.userId} order={openOrder} empty="Bu buyurtma bo‘yicha xabar yo‘q. Hisob raqamni shu yerda yuboring." />
      </div>
    );
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
          <OrderProgress status={o.status} />
          <span>{o.name} · <a href={`tel:${o.phone}`}><Phone size={13} /> {o.phone}</a>{o.telegram && <> · <a href={`https://t.me/${o.telegram}`} target="_blank" rel="noopener noreferrer">@{o.telegram}</a></>}</span>
          <span>{o.address}</span>
          {o.note && <span className="admin-empty">Izoh: {o.note}</span>}
          <span>{o.lines.map((l) => `${l.title} ×${l.qty}`).join(", ")}</span>
          <strong>{formatPrice(o.total)} · {PAYMENT_LABELS[o.payment]} · {new Date(o.createdAt).toLocaleString("ru-RU")}</strong>
          <button type="button" className="ao-chat" onClick={() => setOpenOrder(o)}>
            <MessageCircle size={16} /> Buyurtma yozishmasi
            {o.adminUnread > 0 && <b aria-label={`${o.adminUnread} ta o‘qilmagan`}>{o.adminUnread}</b>}
          </button>
        </article>
      ))}
    </div>
  );
}
