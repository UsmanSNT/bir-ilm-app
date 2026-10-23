"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { refreshAdminAttention } from "@/lib/api/admin-attention";
import { setAdminOrderStatus } from "@/lib/api/store-client";
import { formatPrice, ORDER_PROGRESS, ORDER_STATUS_LABELS, type OrderStatus, type StoreOrder } from "@/shared/contract";

const PROGRESS: readonly OrderStatus[] = ORDER_PROGRESS;

/** Buyurtma jarayoni: Qabul qilindi → Tayyorlanmoqda → Yuborildi → Yetkazildi. Bekor bo'lsa — alohida belgi. */
export function OrderProgress({ status }: { status: OrderStatus }) {
  if (status === "cancelled") {
    return <p className="op-cancelled" role="status"><X size={14} aria-hidden="true" /> Buyurtma bekor qilindi</p>;
  }
  const current = PROGRESS.indexOf(status);
  return (
    <div className="op">
      {status === "new" && <p className="op-note">Buyurtma qabul qilinishini kutmoqda.</p>}
      <ol className="op-steps" aria-label="Buyurtma jarayoni">
        {PROGRESS.map((step, i) => (
          <li key={step} className={`op-step${i <= current ? " is-done" : ""}`} aria-current={i === current ? "step" : undefined}>
            <span className="op-dot">{i <= current ? <Check size={12} aria-hidden="true" /> : i + 1}</span>
            <span className="op-label">{ORDER_STATUS_LABELS[step]}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Buyurtmaning qisqa ma'lumoti (chat tepasida va ro'yxatda). */
export function OrderSummary({ order }: { order: StoreOrder }) {
  return (
    <section className="os-summary" aria-label={`Buyurtma ${order.id}`}>
      <div className="os-summary-head">
        <strong>№ {order.id}</strong>
        <span className="os-total">{formatPrice(order.total)}</span>
      </div>
      <p className="os-lines">{order.lines.map((l) => `${l.title} ×${l.qty}`).join(", ")}</p>
      <OrderProgress status={order.status} />
    </section>
  );
}

const NEXT: Partial<Record<OrderStatus, OrderStatus>> = { new: "confirmed", confirmed: "preparing", preparing: "shipped", shipped: "delivered" };
const NEXT_LABEL: Partial<Record<OrderStatus, string>> = {
  new: "Qabul qilish",
  confirmed: "Tayyorlashni boshlash",
  preparing: "Yuborildi deb belgilash",
  shipped: "Yetkazildi deb belgilash",
};

/** Admin: keyingi bosqichga o'tkazish va bekor qilish. Har bir o'zgarish xaridorning buyurtma chatiga tushadi. */
export function OrderStatusActions({ order, onChange }: { order: StoreOrder; onChange: (updated: StoreOrder) => void }) {
  const [busy, setBusy] = useState(false);
  const next = NEXT[order.status];

  async function set(status: OrderStatus) {
    setBusy(true);
    try {
      const updated = await setAdminOrderStatus(order.id, status);
      onChange(updated);
      refreshAdminAttention();
      toast.success(`Holat: ${ORDER_STATUS_LABELS[status]}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Holat o‘zgarmadi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="os-actions">
      {next && <button type="button" className="os-next" disabled={busy} onClick={() => void set(next)}>{NEXT_LABEL[order.status]}</button>}
      {order.status === "cancelled" && <button type="button" className="os-reopen" disabled={busy} onClick={() => void set("confirmed")}>Qayta ochish</button>}
      {order.status !== "cancelled" && order.status !== "delivered" && (
        <button type="button" className="os-cancel" disabled={busy} onClick={() => window.confirm("Buyurtma bekor qilinsinmi?") && void set("cancelled")}>Bekor qilish</button>
      )}
    </div>
  );
}
