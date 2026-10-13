"use client";

import { useEffect, useState } from "react";
import { ChevronRight, Library, MessageCircle, Minus, Plus, ShoppingCart, Star, Trash2, UserRound, BookOpen } from "lucide-react";
import { fetchMyReviews, fetchOrders, useCart } from "@/lib/api/store-client";
import { useViewer } from "@/lib/api/roles-client";
import { formatPrice, type MyReview, ORDER_STATUS_LABELS, STORE_LIMITS, type StoreBook, type StoreOrder } from "@/shared/contract";
import AdminOrders from "./admin-orders";
import AdminStoreBooks from "./admin-store-books";
import AdminStoreChat from "./admin-store-chat";
import { OrderProgress } from "./order-status";
import StoreMessages, { type Conversation } from "./store-messages";
import { BookCover } from "./store-ui";

export type Cart = ReturnType<typeof useCart>;
/** Book Store hisobi: faqat do'kon ma'lumotlari (savat, xaridlar, baholar, xabarlar, do'kon boshqaruvi). */
export type AccountTab = "cart" | "messages" | "admin";
export type AdminArea = "orders" | "chat" | "books";
export type PurchaseView = "orders" | "cart" | "reviews";
const PURCHASE_VIEWS: [PurchaseView, string][] = [["orders", "Oxirgi xaridlar"], ["cart", "Savat"], ["reviews", "Baholar"]];

const ACCOUNT_TABS: Record<AccountTab, string> = { cart: "Savat", messages: "Xabarlar", admin: "Boshqaruv" };
const ADMIN_AREAS: [AdminArea, string][] = [
  ["orders", "Buyurtmalar"],
  ["chat", "Do‘kon chati"],
  ["books", "Kitoblar"],
];

export type StoreAccountProps = {
  tab: AccountTab;
  /** Admin «Boshqaruv» ichida ochiladigan bo'lim (bildirishnomadan). */
  adminArea?: AdminArea;
  /** Savat bo'limidagi ko'rinish: oxirgi xaridlar, savat yoki baholar. */
  purchaseView: PurchaseView;
  onPurchaseView: (view: PurchaseView) => void;
  /** Bir Ilm hisobiga o'tish (o'qilgan kitoblar, postlar, Bir Ilm sozlamalari). */
  onMain: () => void;
  onTab: (tab: AccountTab) => void;
  cart: Cart;
  books: StoreBook[];
  messagesStart: Conversation | null;
  chatBook: StoreBook | null;
  onOpen: (book: StoreBook) => void;
  onCheckout: () => void;
  onCatalog: () => void;
  onOrderChat: (order: StoreOrder) => void;
  onNeedLogin: () => void;
};

/**
 * Book Store hisobi — Bir Ilm hisobidan alohida: xaridlar, savat, baholar va do'kon xabarlari.
 * O'qilgan kitoblar va Bir Ilm sozlamalari — Bir Ilm hisobida («Bir Ilm hisobi» havolasi).
 */
export default function StoreAccount({ tab, adminArea, purchaseView, onPurchaseView, onMain, onTab, cart, books, messagesStart, chatBook, onOpen, onCheckout, onCatalog, onOrderChat, onNeedLogin }: StoreAccountProps) {
  const viewer = useViewer();
  const signedIn = Boolean(viewer?.signedIn);
  const isAdmin = viewer?.role === "admin";
  const tabs: AccountTab[] = isAdmin ? ["cart", "messages", "admin"] : ["cart", "messages"];

  return (
    <section className="sa" aria-label="Book Store hisobi">
      <button type="button" className="sa-main" onClick={onMain}>
        <span className="sa-main-icon" aria-hidden="true"><BookOpen size={18} /></span>
        <span className="sa-main-copy">
          <strong>Bir Ilm hisobi</strong>
          <small>O‘qilgan kitoblar, postlar va Bir Ilm sozlamalari</small>
        </span>
        <ChevronRight size={18} aria-hidden="true" />
      </button>

      <div className="zb-segment sa-tabs" role="tablist" aria-label="Do‘kon hisobi bo‘limlari">
        {tabs.map((id) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => onTab(id)}>
            {ACCOUNT_TABS[id]}
            {id === "cart" && cart.count > 0 && <b aria-label={`${cart.count} ta mahsulot`}>{cart.count}</b>}
          </button>
        ))}
      </div>

      {tab === "cart" && <PurchasesView view={purchaseView} onView={onPurchaseView} cart={cart} books={books} signedIn={signedIn} onCheckout={onCheckout} onCatalog={onCatalog} onOpen={onOpen} onOrderChat={onOrderChat} onNeedLogin={onNeedLogin} />}
      {tab === "messages" && (signedIn
        ? <StoreMessages key={`${messagesStart?.kind === "order" ? messagesStart.order.id : "list"}-${chatBook?.id ?? ""}`} initial={messagesStart} bookId={chatBook?.id} bookTitle={chatBook?.title} onNeedLogin={onNeedLogin} />
        : <SignInPrompt text="Admin bilan yozishish faqat ro‘yxatdan o‘tgan kitobxonlar uchun." onNeedLogin={onNeedLogin} />)}
      {tab === "admin" && isAdmin && <AdminArea initial={adminArea ?? "orders"} />}
    </section>
  );
}

function SignInPrompt({ text, onNeedLogin }: { text: string; onNeedLogin: () => void }) {
  return (
    <div className="zb-empty">
      <UserRound size={30} />
      <h3>Kirish kerak</h3>
      <p className="zb-muted">{text}</p>
      <button className="zb-btn zb-btn-primary" onClick={onNeedLogin}>Kirish</button>
    </div>
  );
}

/** Admin «Boshqaruv»: do'kon boshqaruvi (buyurtmalar, do'kon chati, kitoblar). Bir Ilm boshqaruvi — Bir Ilm profilida. */
function AdminArea({ initial }: { initial: AdminArea }) {
  const [area, setArea] = useState<AdminArea>(initial);
  return (
    <section className="sa-admin" aria-label="Do‘kon boshqaruvi">
      <div className="sa-chips" role="tablist" aria-label="Do‘kon boshqaruvi bo‘limlari">
        {ADMIN_AREAS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={area === id} onClick={() => setArea(id)}>{label}</button>
        ))}
      </div>
      {area === "orders" && <AdminOrders />}
      {area === "chat" && <AdminStoreChat />}
      {area === "books" && <AdminStoreBooks />}
    </section>
  );
}

function CartView({ cart, onCheckout, onCatalog, onOpen }: { cart: Cart; onCheckout: () => void; onCatalog: () => void; onOpen: (b: StoreBook) => void }) {
  if (!cart.ready) return <p className="zb-muted" role="status">Yuklanmoqda...</p>;
  if (!cart.items.length) return <div className="zb-empty"><ShoppingCart size={30} /><h3>Savat bo‘sh</h3><button className="zb-btn zb-btn-primary" onClick={onCatalog}>Do‘konga o‘tish</button></div>;
  return (
    <div className="zb-cart">
      {cart.items.map(({ book, qty }) => (
        <article className="zb-line" key={book.id}>
          <button className="zb-line-cover" onClick={() => onOpen(book)} aria-label={`${book.title} haqida`}><BookCover book={book} size="sm" /></button>
          <div className="zb-line-info"><strong>{book.title}</strong><span className="zb-muted">{book.author}</span><span className="zb-line-price">{formatPrice(book.price * qty)}</span></div>
          <div className="zb-qty">
            <button aria-label="Kamaytirish" onClick={() => cart.setQty(book.id, qty - 1)}>{qty === 1 ? <Trash2 size={15} /> : <Minus size={15} />}</button>
            <span aria-live="polite">{qty}</span>
            <button aria-label="Ko‘paytirish" disabled={qty >= STORE_LIMITS.maxQty} onClick={() => cart.setQty(book.id, qty + 1)}><Plus size={15} /></button>
          </div>
        </article>
      ))}
      <Totals cart={cart} />
      <button className="zb-btn zb-btn-primary zb-btn-block" onClick={onCheckout}>Rasmiylashtirish · {formatPrice(cart.total)}</button>
    </div>
  );
}

export function Totals({ cart }: { cart: Cart }) {
  return (
    <dl className="zb-totals">
      <div><dt>Kitoblar ({cart.count})</dt><dd>{formatPrice(cart.total)}</dd></div>
      <div><dt>Yetkazib berish</dt><dd>Operator aytadi</dd></div>
      <div className="zb-totals-sum"><dt>Jami</dt><dd>{formatPrice(cart.total)}</dd></div>
    </dl>
  );
}


/** Savat bo'limi: Oxirgi xaridlar | Savat | Baholar. */
function PurchasesView({ view, onView, cart, books, signedIn, onCheckout, onCatalog, onOpen, onOrderChat, onNeedLogin }: {
  view: PurchaseView; onView: (view: PurchaseView) => void; cart: Cart; books: StoreBook[]; signedIn: boolean;
  onCheckout: () => void; onCatalog: () => void; onOpen: (book: StoreBook) => void; onOrderChat: (order: StoreOrder) => void; onNeedLogin: () => void;
}) {
  return (
    <>
      <div className="zb-segment sa-subtabs" role="tablist" aria-label="Xaridlar bo‘limlari">
        {PURCHASE_VIEWS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => onView(id)}>
            {label}
            {id === "cart" && cart.count > 0 && <b aria-label={`${cart.count} ta mahsulot`}>{cart.count}</b>}
          </button>
        ))}
      </div>
      {view === "orders" && <OrdersView signedIn={signedIn} onOrderChat={onOrderChat} onNeedLogin={onNeedLogin} />}
      {view === "cart" && <CartView cart={cart} onCheckout={onCheckout} onCatalog={onCatalog} onOpen={onOpen} />}
      {view === "reviews" && <ReviewsView signedIn={signedIn} books={books} onOpen={onOpen} onNeedLogin={onNeedLogin} />}
    </>
  );
}

function OrdersView({ signedIn, onOrderChat, onNeedLogin }: { signedIn: boolean; onOrderChat: (order: StoreOrder) => void; onNeedLogin: () => void }) {
  const [orders, setOrders] = useState<StoreOrder[] | null>(null);
  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    fetchOrders().then((items) => { if (alive) setOrders(items); }).catch(() => { if (alive) setOrders([]); });
    return () => { alive = false; };
  }, [signedIn]);
  if (!signedIn) return <SignInPrompt text="Xaridlaringiz kirgan hisobingizda saqlanadi." onNeedLogin={onNeedLogin} />;
  if (orders === null) return <p className="zb-muted" role="status">Yuklanmoqda...</p>;
  if (!orders.length) return <div className="zb-empty"><Library size={30} /><h3>Xaridlar yo‘q</h3><p className="zb-muted">Buyurtma bergach, bu yerda holati ko‘rinadi.</p></div>;
  return (
    <div className="zb-cart">
      {orders.map((o) => (
        <article className="zb-order" key={o.id}>
          <div className="zb-order-head"><strong>№ {o.id}</strong><span className="zb-status" data-status={o.status}>{ORDER_STATUS_LABELS[o.status]}</span></div>
          <p className="zb-muted">{new Date(o.createdAt).toLocaleDateString("ru-RU")} · {o.lines.map((l) => `${l.title} ×${l.qty}`).join(", ")}</p>
          <strong>{formatPrice(o.total)}</strong>
          <OrderProgress status={o.status} />
          <button type="button" className="zb-btn zb-btn-ghost zb-order-chat" onClick={() => onOrderChat(o)}>
            <MessageCircle size={16} />Buyurtma yozishmasi
            {o.userUnread > 0 && <b aria-label={`${o.userUnread} ta yangi xabar`}>{o.userUnread}</b>}
          </button>
        </article>
      ))}
    </div>
  );
}

function ReviewsView({ signedIn, books, onOpen, onNeedLogin }: { signedIn: boolean; books: StoreBook[]; onOpen: (book: StoreBook) => void; onNeedLogin: () => void }) {
  const [reviews, setReviews] = useState<MyReview[] | null>(null);
  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    fetchMyReviews().then((items) => { if (alive) setReviews(items); }).catch(() => { if (alive) setReviews([]); });
    return () => { alive = false; };
  }, [signedIn]);
  if (!signedIn) return <SignInPrompt text="Baholaringiz kirgan hisobingizda saqlanadi." onNeedLogin={onNeedLogin} />;
  if (reviews === null) return <p className="zb-muted" role="status">Yuklanmoqda...</p>;
  if (!reviews.length) return <div className="zb-empty"><Star size={30} /><h3>Baholar yo‘q</h3><p className="zb-muted">Kitob sahifasida baho va sharh qoldirsangiz, shu yerda chiqadi.</p></div>;
  return (
    <ul className="sa-reviews">
      {reviews.map((r) => {
        const book = books.find((b) => b.id === r.bookId);
        return (
          <li key={r.bookId}>
            <button type="button" className="sa-review" onClick={() => book && onOpen(book)} disabled={!book}>
              <span className="sa-review-cover">{r.coverUrl ? <img src={r.coverUrl} alt="" /> : <BookOpen size={18} />}</span>
              <span className="sa-review-body">
                <strong>{r.title}</strong>
                <small>{r.author}</small>
                <span className="sa-stars" aria-label={`${r.rating} yulduz`}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                {r.body && <em>{r.body}</em>}
                <time dateTime={r.updatedAt}>{new Date(r.updatedAt).toLocaleDateString("ru-RU")}</time>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
