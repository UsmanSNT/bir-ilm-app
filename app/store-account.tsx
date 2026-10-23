"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, BookOpen, CalendarDays, ChevronLeft, ChevronRight, LayoutDashboard, Library, MessageCircle, Minus, Plus, ShoppingBag, ShoppingCart, Star, Trash2, UserRound } from "lucide-react";
import { fetchMyReviews, fetchOrders, useCart } from "@/lib/api/store-client";
import { useViewer } from "@/lib/api/roles-client";
import { useAdminAttention } from "@/lib/api/admin-attention";
import { formatPrice, type MyReview, ORDER_STATUS_LABELS, STORE_LIMITS, type StoreBook, type StoreOrder } from "@/shared/contract";
import AdminOrders from "./admin-orders";
import AdminStoreBooks from "./admin-store-books";
import AdminStoreChat from "./admin-store-chat";
import { OrderProgress } from "./order-status";
import StoreMessages, { type Conversation } from "./store-messages";
import StoreSettings from "./store-settings";
import { BookCover } from "./store-ui";
import { HeroTop, StatGrid, grouped } from "./profile-hero";
import ProfileMenu, { type MenuItem } from "./profile-menu";

export type Cart = ReturnType<typeof useCart>;
/**
 * Book Store hisobi: faqat do'kon ma'lumotlari (xaridlar, savat, baholar, xabarlar, do'kon boshqaruvi).
 * `cart` — hisobning asosiy sahifasi (muqova, ko'rsatkichlar va xaridlar bo'limlari); qolganlari — ichki ekranlar.
 */
export type AccountTab = "cart" | "messages" | "settings" | "admin" | "menu";
export type AdminArea = "orders" | "chat" | "books";
export type PurchaseView = "orders" | "cart" | "reviews";
const PURCHASE_VIEWS: [PurchaseView, string][] = [["orders", "Xaridlar"], ["cart", "Savat"], ["reviews", "Baholar"]];

const SCREEN_TITLES: Record<Exclude<AccountTab, "cart">, string> = {
  menu: "Do‘kon boshqaruvi",
  messages: "Xabarlar",
  settings: "Hisob sozlamalari",
  admin: "Do‘kon boshqaruvi",
};
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
  /** Do'kon yozishmalarining o'qilmaganlari. */
  unread: number;
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

/** Xaridlar va baholar bir marta yuklanadi: ko'rsatkichlar ham, bo'limlar ham shu ma'lumotdan foydalanadi. */
function useStoreSummary(signedIn: boolean) {
  const [orders, setOrders] = useState<StoreOrder[] | null>(null);
  const [reviews, setReviews] = useState<MyReview[] | null>(null);
  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    fetchOrders().then((items) => { if (alive) setOrders(items); }).catch(() => { if (alive) setOrders([]); });
    fetchMyReviews().then((items) => { if (alive) setReviews(items); }).catch(() => { if (alive) setReviews([]); });
    return () => { alive = false; };
  }, [signedIn]);
  return { orders, reviews };
}

/**
 * Book Store hisobi — Bir Ilm profili bilan bir xil ko'rinish (muqova, avatar, ko'rsatkich kartalari, menyu),
 * lekin faqat do'kon ma'lumotlari: xaridlar, olingan kitoblar, savat, baholar, xabarlar va hisob sozlamalari.
 */
export default function StoreAccount({ tab, adminArea, purchaseView, onPurchaseView, unread, onTab, cart, books, messagesStart, chatBook, onOpen, onCheckout, onCatalog, onOrderChat, onNeedLogin }: StoreAccountProps) {
  const viewer = useViewer();
  const signedIn = Boolean(viewer?.signedIn);
  const isAdmin = viewer?.role === "admin";
  const attention = useAdminAttention(isAdmin);
  const { orders, reviews } = useStoreSummary(signedIn);
  // Menyudan tanlangan boshqaruv bo'limi; bildirishnomadan kelgan `adminArea` o'zgarsa, o'sha ustun turadi.
  const [areaPick, setAreaPick] = useState<{ base?: AdminArea; area: AdminArea } | null>(null);
  const area = areaPick && areaPick.base === adminArea ? areaPick.area : adminArea;
  // Ichki ekrandan «orqaga»: menyudan ochilgan bo'lsa — menyuga, aks holda — hisob sahifasiga.
  const [backTo, setBackTo] = useState<AccountTab>("cart");

  const go = (next: AccountTab) => {
    setBackTo(next === "menu" || tab === "cart" ? "cart" : tab === "menu" ? "menu" : backTo);
    onTab(next);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const showView = (view: PurchaseView) => { onPurchaseView(view); onTab("cart"); };
  const openArea = (next: AdminArea) => { setAreaPick({ base: adminArea, area: next }); go("admin"); };

  if (!viewer) return <section className="sa" aria-busy="true" />;

  if (tab !== "cart") {
    // Menyu faqat adminga: unda do'kon boshqaruvi. Hisob sozlamalari, xabarlar va xaridlar asosiy sahifaning o'zida.
    const adminItems: MenuItem[] = [
      { id: "admin-orders", title: "Buyurtmalar", icon: ShoppingBag, tone: "tilla", value: attention.orders ? `${attention.orders} ta yangi` : undefined, onClick: () => openArea("orders") },
      { id: "admin-chat", title: "Do‘kon chati", icon: MessageCircle, tone: "firuza", value: attention.chats ? `${attention.chats} ta yangi` : undefined, onClick: () => openArea("chat") },
      { id: "admin-books", title: "Kitoblar", icon: LayoutDashboard, tone: "lojuvard", onClick: () => openArea("books") },
    ];
    return (
      <section className="sa sa-screen" aria-label={SCREEN_TITLES[tab]}>
        <header className="sa-head">
          <button type="button" className="sa-head-back" onClick={() => go(tab === "menu" ? "cart" : backTo)} aria-label="Orqaga"><ChevronLeft size={23} /></button>
          <h1>{SCREEN_TITLES[tab]}</h1>
          <span />
        </header>
        {tab === "menu" && isAdmin && <ProfileMenu search={false} groups={[{ id: "admin", title: "Boshqaruv", items: adminItems }]} />}
        {tab === "messages" && (signedIn
          ? <StoreMessages key={`${messagesStart?.kind === "order" ? messagesStart.order.id : "list"}-${chatBook?.id ?? ""}`} initial={messagesStart} bookId={chatBook?.id} bookTitle={chatBook?.title} onNeedLogin={onNeedLogin} />
          : <SignInPrompt text="Admin bilan yozishish faqat ro‘yxatdan o‘tgan kitobxonlar uchun." onNeedLogin={onNeedLogin} />)}
        {tab === "settings" && (signedIn ? <StoreSettings /> : <SignInPrompt text="Yetkazib berish ma’lumotlari kirgan hisobingizda saqlanadi." onNeedLogin={onNeedLogin} />)}
        {tab === "admin" && isAdmin && <AdminArea key={area ?? "list"} initial={area} embedded={backTo === "menu"} />}
      </section>
    );
  }

  const joinedYear = viewer.joinedAt ? new Date(viewer.joinedAt).getFullYear() : null;
  const count = (value: number | null | undefined) => (signedIn ? (value == null ? "—" : grouped(value)) : "0");

  return (
    <section className="sa" aria-label="Book Store hisobi">
      <header className="pv">
        <HeroTop
          viewer={viewer}
          tone="firuza"
          onMenu={isAdmin ? () => go("menu") : undefined}
          actions={signedIn ? <>
            <button type="button" className="pv-edit" onClick={() => go("settings")}>Hisob sozlamalari</button>
            <button type="button" className="pv-share sa-msg" onClick={() => go("messages")} aria-label={unread ? `Xabarlar, ${unread} ta yangi` : "Xabarlar"} title="Xabarlar">
              <MessageCircle size={19} />
              {unread > 0 && <b>{unread > 9 ? "9+" : unread}</b>}
            </button>
          </> : <button type="button" className="pv-edit" onClick={onNeedLogin}>Kirish</button>}
        />
        <div className="pv-identity">
          <h2>{viewer.name || "Kitobxon"}</h2>
          <p className="pv-handle">
            {viewer.username && <span>@{viewer.username}</span>}
            <b className="pv-role-chip is-store">Book Store xaridori</b>
          </p>
          {joinedYear && <ul className="pv-meta"><li><CalendarDays size={17} />{joinedYear}-yildan beri a’zo</li></ul>}
        </div>
        <StatGrid
          columns={3}
          items={[
            { key: "orders", label: "Xaridlar", icon: ShoppingBag, tone: "tilla", value: count(orders?.length), onClick: () => showView("orders") },
            { key: "cart", label: "Savatda", icon: ShoppingCart, tone: "anor", value: grouped(cart.count), onClick: () => showView("cart") },
            { key: "reviews", label: "Baholar", icon: Star, tone: "lojuvard", value: count(reviews?.length), onClick: () => showView("reviews") },
          ]}
        />
      </header>
      <PurchasesView view={purchaseView} onView={onPurchaseView} cart={cart} books={books} signedIn={signedIn} orders={orders} reviews={reviews} onCheckout={onCheckout} onCatalog={onCatalog} onOpen={onOpen} onOrderChat={onOrderChat} onNeedLogin={onNeedLogin} />
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

/** Admin «Boshqaruv»: do'kon boshqaruvi. Avval ro'yxat, bo'lim tanlanganda — shu bo'lim bilan (filtrlar bitta qatorda). */
function AdminArea({ initial, embedded = false }: { initial?: AdminArea; embedded?: boolean }) {
  const [area, setArea] = useState<AdminArea | null>(initial ?? null);
  const attention = useAdminAttention(true);
  const counts: Partial<Record<AdminArea, number>> = { orders: attention.orders, chat: attention.chats };
  if (!area) {
    return (
      <section className="sa-admin" aria-label="Do‘kon boshqaruvi">
        <div className="sa-menu">
          {ADMIN_AREAS.map(([id, label]) => (
            <button key={id} type="button" className="sa-row" onClick={() => setArea(id)}>
              <span>{label}</span>
              {(counts[id] ?? 0) > 0 && <small>{counts[id]} ta yangi</small>}
              <ChevronRight size={17} aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>
    );
  }
  return (
    <section className="sa-admin" aria-label={ADMIN_AREAS.find(([id]) => id === area)?.[1]}>
      {!embedded && <button type="button" className="sa-back-link" onClick={() => setArea(null)}><ArrowLeft size={17} aria-hidden="true" />Boshqaruv</button>}
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
function PurchasesView({ view, onView, cart, books, signedIn, orders, reviews, onCheckout, onCatalog, onOpen, onOrderChat, onNeedLogin }: {
  view: PurchaseView; onView: (view: PurchaseView) => void; cart: Cart; books: StoreBook[]; signedIn: boolean;
  orders: StoreOrder[] | null; reviews: MyReview[] | null;
  onCheckout: () => void; onCatalog: () => void; onOpen: (book: StoreBook) => void; onOrderChat: (order: StoreOrder) => void; onNeedLogin: () => void;
}) {
  return (
    <>
      <div className="p-tabs p-main-tabs sa-tabs-main" role="tablist" aria-label="Xaridlar bo‘limlari">
        {PURCHASE_VIEWS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => onView(id)}>
            {label}
            {id === "cart" && cart.count > 0 && <i aria-label={`${cart.count} ta mahsulot`}>{cart.count}</i>}
          </button>
        ))}
      </div>
      {view === "orders" && <OrdersView signedIn={signedIn} orders={orders} onOrderChat={onOrderChat} onNeedLogin={onNeedLogin} />}
      {view === "cart" && <CartView cart={cart} onCheckout={onCheckout} onCatalog={onCatalog} onOpen={onOpen} />}
      {view === "reviews" && <ReviewsView signedIn={signedIn} reviews={reviews} books={books} onOpen={onOpen} onNeedLogin={onNeedLogin} />}
    </>
  );
}

function OrdersView({ signedIn, orders, onOrderChat, onNeedLogin }: { signedIn: boolean; orders: StoreOrder[] | null; onOrderChat: (order: StoreOrder) => void; onNeedLogin: () => void }) {
  if (!signedIn) return <SignInPrompt text="Xaridlaringiz kirgan hisobingizda saqlanadi." onNeedLogin={onNeedLogin} />;
  if (orders === null) return <p className="zb-muted" role="status">Yuklanmoqda...</p>;
  if (!orders.length) return <div className="zb-empty"><Library size={30} /><h3>Hali kitob olinmagan</h3><p className="zb-muted">Buyurtma bergach, bu yerda holati ko‘rinadi.</p></div>;
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

function ReviewsView({ signedIn, reviews, books, onOpen, onNeedLogin }: { signedIn: boolean; reviews: MyReview[] | null; books: StoreBook[]; onOpen: (book: StoreBook) => void; onNeedLogin: () => void }) {
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
