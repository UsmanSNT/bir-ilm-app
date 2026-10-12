"use client";

import { useEffect, useState } from "react";
import { Heart, Library, MessageCircle, Minus, Plus, ShoppingCart, Trash2, UserRound } from "lucide-react";
import { fetchOrders, useCart } from "@/lib/api/store-client";
import { useViewer } from "@/lib/api/roles-client";
import { formatPrice, ORDER_STATUS_LABELS, STORE_LIMITS, type StoreBook, type StoreOrder } from "@/shared/contract";
import { USER_ROLE_LABELS } from "@/shared/contract/roles";
import AdminOrders from "./admin-orders";
import AdminPanel from "./admin-panel";
import AdminQuizzes from "./admin-quizzes";
import AdminSite from "./admin-site";
import AdminStoreBooks from "./admin-store-books";
import AdminStoreChat from "./admin-store-chat";
import ProfileScreens, { type ProfileRoute, type ProfileScreensProps } from "./profile-screens";
import { OrderProgress } from "./order-status";
import StoreMessages, { type Conversation } from "./store-messages";
import { BookCover } from "./store-ui";

export type Cart = ReturnType<typeof useCart>;
export type AccountTab = "profile" | "cart" | "library" | "messages" | "admin";
export type AdminArea = "orders" | "chat" | "books" | "quizzes" | "site" | "roles";

const ACCOUNT_TABS: Record<AccountTab, string> = { profile: "Profil", cart: "Savat", library: "Kutubxona", messages: "Xabarlar", admin: "Boshqaruv" };
const ADMIN_AREAS: [AdminArea, string][] = [
  ["orders", "Buyurtmalar"],
  ["chat", "Do‘kon chati"],
  ["books", "Kitoblar"],
  ["quizzes", "Viktorinalar"],
  ["site", "Sayt"],
  ["roles", "Rollar"],
];

export type StoreAccountProps = {
  tab: AccountTab;
  /** Admin «Boshqaruv» ichida ochiladigan bo'lim (bildirishnomadan). */
  adminArea?: AdminArea;
  /** Profil ichida ochiladigan ekran (bildirishnomadan yoki tashqaridan). */
  profileRoute?: ProfileRoute;
  /** Shaxsiy sahifa ma'lumotlari (asosiy sahifadan). */
  profile: ProfileScreensProps;
  onTab: (tab: AccountTab) => void;
  cart: Cart;
  books: StoreBook[];
  shelf: string[];
  messagesStart: Conversation | null;
  chatBook: StoreBook | null;
  onOpen: (book: StoreBook) => void;
  onCheckout: () => void;
  onCatalog: () => void;
  onOrderChat: (order: StoreOrder) => void;
  onNeedLogin: () => void;
};

/**
 * Hisobim — do'kon ichidagi yagona shaxsiy bo'lim: Profil (shaxsiy sahifa va sozlamalar), Savat, Kutubxona,
 * Xabarlar. Admin uchun qo'shimcha «Boshqaruv» bo'limi.
 */
export default function StoreAccount({ tab, adminArea, profileRoute, profile, onTab, cart, books, shelf, messagesStart, chatBook, onOpen, onCheckout, onCatalog, onOrderChat, onNeedLogin }: StoreAccountProps) {
  const viewer = useViewer();
  const signedIn = Boolean(viewer?.signedIn);
  const isAdmin = viewer?.role === "admin";
  const tabs: AccountTab[] = isAdmin ? ["profile", "cart", "library", "messages", "admin"] : ["profile", "cart", "library", "messages"];
  const initial = (viewer?.name || "K").slice(0, 1).toUpperCase();

  return (
    <section className="sa" aria-label="Hisobim">
      {tab !== "profile" && (
        <div className="sa-card">
          <span className="sa-avatar" aria-hidden="true">{initial}</span>
          <div>
            <strong>{viewer?.name || "Kitobxon"}</strong>
            <small>{USER_ROLE_LABELS[viewer?.role ?? "user"]}{signedIn ? "" : " · mehmon"}</small>
          </div>
        </div>
      )}

      <div className="zb-segment sa-tabs" role="tablist" aria-label="Hisobim bo‘limlari">
        {tabs.map((id) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => onTab(id)}>
            {ACCOUNT_TABS[id]}
            {id === "cart" && cart.count > 0 && <b aria-label={`${cart.count} ta mahsulot`}>{cart.count}</b>}
          </button>
        ))}
      </div>

      {tab === "profile" && <ProfileScreens key={profileRoute?.nonce ?? 0} {...profile} route={profileRoute} embedded />}
      {tab === "cart" && <CartView cart={cart} onCheckout={onCheckout} onCatalog={onCatalog} onOpen={onOpen} />}
      {tab === "library" && <LibraryView books={books} shelf={shelf} signedIn={signedIn} onOpen={onOpen} onOrderChat={onOrderChat} />}
      {tab === "messages" && (signedIn
        ? <StoreMessages key={`${messagesStart?.kind === "order" ? messagesStart.order.id : "list"}-${chatBook?.id ?? ""}`} initial={messagesStart} bookId={chatBook?.id} bookTitle={chatBook?.title} onNeedLogin={onNeedLogin} />
        : <SignInPrompt text="Admin bilan yozishish faqat ro‘yxatdan o‘tgan kitobxonlar uchun." onNeedLogin={onNeedLogin} />)}
      {tab === "admin" && isAdmin && viewer && <AdminArea selfId={viewer.userId} initial={adminArea ?? "orders"} />}
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

/** Admin «Boshqaruv»: do'kon boshqaruvining mavjud bo'limlari shu yerda ochiladi. */
function AdminArea({ selfId, initial }: { selfId: string; initial: AdminArea }) {
  const [area, setArea] = useState<AdminArea>(initial);
  return (
    <section className="sa-admin" aria-label="Boshqaruv">
      <div className="sa-chips" role="tablist" aria-label="Boshqaruv bo‘limlari">
        {ADMIN_AREAS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={area === id} onClick={() => setArea(id)}>{label}</button>
        ))}
      </div>
      {area === "orders" && <AdminOrders />}
      {area === "chat" && <AdminStoreChat />}
      {area === "books" && <AdminStoreBooks />}
      {area === "quizzes" && <AdminQuizzes />}
      {area === "site" && <AdminSite />}
      {area === "roles" && <AdminPanel selfId={selfId} />}
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


function LibraryView({ books, shelf, signedIn, onOpen, onOrderChat }: { books: StoreBook[]; shelf: string[]; signedIn: boolean; onOpen: (book: StoreBook) => void; onOrderChat: (order: StoreOrder) => void }) {
  const [view, setView] = useState<"saved" | "orders">("saved");
  const [orders, setOrders] = useState<StoreOrder[] | null>(null);
  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    fetchOrders().then((items) => { if (alive) setOrders(items); }).catch(() => { if (alive) setOrders([]); });
    return () => { alive = false; };
  }, [signedIn]);
  const saved = books.filter((b) => shelf.includes(b.id));
  const list = signedIn ? orders : [];

  return (
    <>
      <div className="zb-segment" role="tablist">
        <button role="tab" aria-selected={view === "saved"} onClick={() => setView("saved")}><Heart size={16} />Javonda · {saved.length}</button>
        <button role="tab" aria-selected={view === "orders"} onClick={() => setView("orders")}><Library size={16} />Buyurtmalar · {list?.length ?? "…"}</button>
      </div>
      {view === "saved" && (saved.length ? (
        <div className="zb-grid">{saved.map((b) => <button key={b.id} className="zb-shelf-item" onClick={() => onOpen(b)}><BookCover book={b} /><strong>{b.title}</strong><span className="zb-muted">{b.author}</span></button>)}</div>
      ) : (
        <div className="zb-empty"><Heart size={30} /><h3>Javon bo‘sh</h3><p className="zb-muted">Kitob sahifasidagi ♡ tugmasi bilan qo‘shing.</p></div>
      ))}
      {view === "orders" && (list === null ? (
        <p className="zb-muted" role="status">Yuklanmoqda...</p>
      ) : list.length ? (
        <div className="zb-cart">
          {list.map((o) => (
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
      ) : (
        <div className="zb-empty"><Library size={30} /><h3>Buyurtmalar yo‘q</h3>{!signedIn && <p className="zb-muted">Buyurtmalar kirgan hisobingizda saqlanadi.</p>}</div>
      ))}
    </>
  );
}
