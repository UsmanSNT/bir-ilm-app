"use client";

import { useState } from "react";
import { ArrowLeft, MessageCircle, ShoppingBag } from "lucide-react";
import { useStoreInbox } from "@/lib/api/store-client";
import { formatPrice, ORDER_STATUS_LABELS, type StoreOrder } from "@/shared/contract";
import StoreChatThread from "./store-chat";

/** Ochiq yozishma: umumiy savollar yoki bitta buyurtma. */
export type Conversation = { kind: "general" } | { kind: "order"; order: StoreOrder };

const timeOf = (iso: string) => {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
};

type Props = {
  /** Ochiq yozishma bilan boshlash (masalan, buyurtma chatidan yoki kitob haqida savol). */
  initial?: Conversation | null;
  /** Kitob sahifasidan savol: umumiy yozishmada birinchi xabar shu kitob haqida. */
  bookId?: string;
  bookTitle?: string;
  onNeedLogin?: () => void;
};

/**
 * Xaridorning barcha yozishmalari: «Umumiy savollar» va har bir buyurtma alohida qator.
 * Qatorga bosilsa — shu yozishma ochiladi; «Xabarlar» bilan ro'yxatga qaytiladi.
 */
export default function StoreMessages({ initial = null, bookId, bookTitle, onNeedLogin }: Props) {
  const { inbox, reload } = useStoreInbox(true);
  const [open, setOpen] = useState<Conversation | null>(initial);

  if (open) {
    const order = open.kind === "order" ? open.order : null;
    return (
      <div className="sm">
        <button type="button" className="sm-back" onClick={() => { setOpen(null); reload(); }}>
          <ArrowLeft size={17} />Xabarlar
        </button>
        <StoreChatThread
          key={order ? `order-${order.id}` : `general-${bookId ?? ""}`}
          me="user"
          order={order}
          bookId={order ? undefined : bookId}
          bookTitle={order ? undefined : bookTitle}
          onNeedLogin={onNeedLogin}
          empty={order ? "Buyurtma bo‘yicha savolingizni yozing." : "Savolingizni yozing."}
        />
      </div>
    );
  }

  if (!inbox) return <p className="sm-note" role="status">Yuklanmoqda…</p>;

  return (
    <ul className="sm-list" aria-label="Xabarlar">
      {inbox.items.map((item) => {
        const general = item.kind === "general";
        return (
          <li key={item.key}>
            <button
              type="button"
              className={`sm-row${item.unread ? " has-unread" : ""}`}
              onClick={() => setOpen(general || !item.order ? { kind: "general" } : { kind: "order", order: item.order })}
            >
              <span className="sm-icon" aria-hidden="true">{general ? <MessageCircle size={18} /> : <ShoppingBag size={18} />}</span>
              <span className="sm-body">
                <strong>{general ? "Umumiy savollar" : `Buyurtma № ${item.order?.id}`}</strong>
                <small>{general ? "Admin bilan savol-javob" : `${ORDER_STATUS_LABELS[item.order!.status]} · ${formatPrice(item.order!.total)}`}</small>
                <em>{item.preview || "Hali xabar yo‘q"}</em>
              </span>
              <span className="sm-meta">
                {item.lastAt && <time dateTime={item.lastAt}>{timeOf(item.lastAt)}</time>}
                {item.unread > 0 && <b aria-label={`${item.unread} ta yangi xabar`}>{item.unread}</b>}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
