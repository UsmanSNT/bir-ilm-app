"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { BookOpen, Check, Heart, Library, MessageCircle, Minus, Pencil, Plus, Search, ShoppingCart, Sparkles, Store, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useViewer } from "@/lib/api/roles-client";
import { fetchChatUnread, fetchOrders, newOrderId, placeOrder, StoreError, useCart, useStoreBooks } from "@/lib/api/store-client";
import {
  formatPrice,
  ORDER_STATUS_LABELS,
  PHONE_PATTERN,
  STORE_LIMITS,
  type StoreBook,
  type StoreOrder,
} from "@/shared/contract";
import Dock, { type DockItem } from "./dock";
import LoginCard from "./login-card";
import StoreAi from "./store-ai";
import StoreBookPage from "./store-book-page";
import StoreChatThread from "./store-chat";
import BookEditor from "./book-editor";
import { notifyCatalogChanged, useStoreCatalog } from "@/lib/api/books-client";
import { BookCover, RatingLine } from "./store-ui";

type Section = "catalog" | "ai" | "cart" | "checkout" | "library" | "chat";
type Icon = typeof Store;
type Cart = ReturnType<typeof useCart>;

const left: [Section, string, Icon][] = [["catalog", "Do‘kon", Store], ["ai", "AI", Sparkles]];
const right: [Section, string, Icon][] = [["cart", "Savat", ShoppingCart], ["library", "Kutubxonam", Library]];
const titles: Record<Section, string> = { catalog: "Kitob do‘koni", ai: "AI yordamchi", cart: "Savat", checkout: "Buyurtma berish", library: "Kutubxonam", chat: "Admin bilan chat" };
const ALL = "Barchasi";

/** Book Store: Bir Ilm ichidagi alohida rejim — o'z dock'i va pastki qismi bilan; markazdagi yulduz Bir Ilm'ga qaytaradi. */
export default function BookStore({ shelf, onBack, onToggle }: { shelf: string[]; onBack: () => void; onToggle: (bookId: string) => void }) {
  const [section, setSection] = useState<Section>("catalog");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [placed, setPlaced] = useState<StoreOrder | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  /** Chat kitob sahifasidan ochilsa — birinchi xabar shu kitob haqida bo'ladi. */
  const [chatBook, setChatBook] = useState<StoreBook | null>(null);
  const [unread, setUnread] = useState(0);
  /** Admin: do'kon mahsulotini qo'shish/tahrirlash (id yo'q — yangi). */
  const [editing, setEditing] = useState<{ id: string | null } | null>(null);
  const viewer = useViewer();
  const isAdmin = viewer?.role === "admin";
  const store = useStoreBooks();
  const cart = useCart(store.items);
  const detail = detailId ? store.items.find((b) => b.id === detailId) ?? null : null;

  // Admin javob yozgani haqida belgi (chat ochiq bo'lmaganda ham, kirgan foydalanuvchiga).
  const signedIn = Boolean(viewer?.signedIn);
  useEffect(() => {
    if (!signedIn || section === "chat") return;
    let alive = true;
    const load = () => { if (document.visibilityState === "visible") fetchChatUnread().then((n) => alive && setUnread(n)).catch(() => undefined); };
    load();
    const timer = setInterval(load, 15_000);
    return () => { alive = false; clearInterval(timer); };
  }, [signedIn, section]);

  const go = (next: Section, book: StoreBook | null = null) => {
    setSection(next); setDetailId(null); setPlaced(null); setChatBook(next === "chat" ? book : null);
    if (next === "chat") setUnread(0);
    window.scrollTo({ top: 0 });
  };
  const askAdmin = (book: StoreBook | null) => (signedIn ? go("chat", book) : setLoginOpen(true));
  const open = (book: StoreBook) => { setDetailId(book.id); window.scrollTo({ top: 0 }); };
  const addToCart = (book: StoreBook) => { cart.add(book.id); toast.success(`«${book.title}» savatga qo‘shildi`); };
  const active = section === "checkout" ? "cart" : section;
  const tab = ([id, label, icon]: [Section, string, Icon]): DockItem => ({
    id, label, icon, active: active === id && !detail, badge: id === "cart" ? cart.count : undefined, onClick: () => go(id),
  });

  return (
    <div className="zb">
      <Dock
        mode="store"
        label="Book Store bo'limlari"
        left={left.map(tab)}
        right={right.map(tab)}
        center={{ label: "Bir Ilm", ariaLabel: "Bir Ilm bosh sahifasiga qaytish", icon: BookOpen, onClick: onBack }}
      />
      <div className="zb-page">
        {detail ? (
          <StoreBookPage
            key={detail.id}
            book={detail}
            related={store.items}
            saved={shelf.includes(detail.id)}
            onBack={() => setDetailId(null)}
            onOpen={open}
            onAdd={() => addToCart(detail)}
            onToggle={() => onToggle(detail.id)}
            onNeedLogin={() => setLoginOpen(true)}
            onAsk={() => askAdmin(detail)}
            onEdit={isAdmin ? () => setEditing({ id: detail.id }) : undefined}
          />
        ) : (
          <>
            {section !== "chat" && (
              <button type="button" className="zb-chat-chip" onClick={() => askAdmin(null)} aria-label={unread ? `Admin bilan chat, ${unread} ta yangi javob` : "Admin bilan chat"}>
                <MessageCircle size={17} />Admin bilan chat{unread > 0 && <b>{unread}</b>}
              </button>
            )}
            {section !== "catalog" && <header className="zb-head"><span className="zb-eyebrow">Bir Ilm · Book Store</span><h1>{titles[section]}</h1></header>}
            {section === "catalog" && <StoreHome books={store.items} loading={store.loading} error={store.error} onRetry={store.reload} onOpen={open} onAdd={addToCart} onAi={() => go("ai")} isAdmin={isAdmin} onCreate={() => setEditing({ id: null })} onEdit={(b) => setEditing({ id: b.id })} />}
            {section === "ai" && <StoreAi onNeedLogin={() => setLoginOpen(true)} />}
            {section === "cart" && <CartView cart={cart} onCheckout={() => go("checkout")} onCatalog={() => go("catalog")} onOpen={open} />}
            {section === "chat" && (signedIn
              ? <StoreChatThread key={chatBook?.id ?? "general"} me="user" bookId={chatBook?.id} bookTitle={chatBook?.title} onNeedLogin={() => setLoginOpen(true)} empty="Savolingizni yozing." />
              : <div className="zb-empty"><MessageCircle size={30} /><h3>Yozish uchun kiring</h3><p className="zb-muted">Admin bilan yozishish faqat ro‘yxatdan o‘tgan kitobxonlar uchun.</p><button className="zb-btn zb-btn-primary" onClick={() => setLoginOpen(true)}>Kirish</button></div>)}
            {section === "checkout" && (placed
              ? <Confirmation order={placed} onChat={() => go("chat")} onLibrary={() => go("library")} />
              : <Checkout cart={cart} signedIn={Boolean(viewer?.signedIn)} defaultName={viewer?.name ?? ""} onLogin={() => setLoginOpen(true)} onBack={() => go("cart")} onPlaced={setPlaced} />)}
            {section === "library" && <LibraryView books={store.items} shelf={shelf} signedIn={Boolean(viewer?.signedIn)} onOpen={open} />}
          </>
        )}
        <footer className="zb-foot"><span><b>Bir Ilm</b> · Book Store</span><span>Har bir kitob — yangi imkoniyat</span></footer>
      </div>

      {isAdmin && editing && <StoreBookEditor id={editing.id} onClose={() => { setEditing(null); store.reload(); }} />}

      <Dialog open={loginOpen} onOpenChange={setLoginOpen}>
        <DialogContent className="app-dialog">
          <DialogTitle>Hisobingizga kiring</DialogTitle>
          <DialogDescription>Buyurtma, sharh va AI yordamchi faqat ro‘yxatdan o‘tgan kitobxonlar uchun.</DialogDescription>
          {viewer ? <LoginCard viewer={viewer} title="Kirish" text="Google yoki Telegram orqali bir bosishda kiring." /> : <p className="zb-muted">Yuklanmoqda...</p>}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Admin: do'kon mahsuloti muharriri (audio va hafta kitobisiz). Mahsulot ro'yxati yuklangach ochiladi. */
function StoreBookEditor({ id, onClose }: { id: string | null; onClose: () => void }) {
  const catalog = useStoreCatalog();
  const book = id ? catalog.items.find((b) => b.id === id) ?? null : null;
  if (id && !book) return null;
  return <BookEditor kind="store" open book={book} onClose={() => { notifyCatalogChanged(); onClose(); }} />;
}

function StoreHome({ books, loading, error, onRetry, onOpen, onAdd, onAi, isAdmin, onCreate, onEdit }: {
  books: StoreBook[]; loading: boolean; error: string; onRetry: () => void;
  onOpen: (b: StoreBook) => void; onAdd: (b: StoreBook) => void; onAi: () => void;
  isAdmin: boolean; onCreate: () => void; onEdit: (b: StoreBook) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(ALL);
  const q = query.trim().toLocaleLowerCase();
  const categories = useMemo(() => [ALL, ...new Set(books.map((b) => b.category).filter(Boolean))], [books]);
  const list = useMemo(
    () => books.filter((b) => (category === ALL || b.category === category) && `${b.title} ${b.author}`.toLocaleLowerCase().includes(q)),
    [books, category, q],
  );
  // Trend: eng ko'p baholangan kitoblar.
  const trending = useMemo(() => [...books].filter((b) => b.reviews > 0).sort((a, b) => b.reviews - a.reviews || b.rating - a.rating).slice(0, 8), [books]);

  return (
    <>
      <header className="zb-head zb-head-home"><span className="zb-eyebrow">Bir Ilm · Book Store</span><h1>Har bir kitob —<br /><em>yangi imkoniyat</em></h1></header>
      {isAdmin && <button type="button" className="zb-btn zb-btn-primary zb-admin-add" onClick={onCreate}><Plus size={18} />Kitob qo‘shish</button>}
      <label className="zb-search">
        <Search size={20} />
        <input aria-label="Kitob yoki muallifni izlash" placeholder="Kitob yoki muallif..." value={query} onChange={(e) => setQuery(e.target.value)} />
        {query && <button type="button" aria-label="Tozalash" onClick={() => setQuery("")}><X size={16} /></button>}
      </label>
      {!q && <button className="zb-ai-banner" onClick={onAi}><Sparkles size={26} /><span><strong>AI sizga kitob tanlab beradi</strong><small>Qiziqishingizni yozing — do‘kondagi kitoblardan mosini topadi</small></span></button>}
      {categories.length > 1 && <div className="zb-chips" role="group" aria-label="Janrlar">{categories.map((c) => <button key={c} aria-pressed={category === c} onClick={() => setCategory(c)}>{c}</button>)}</div>}
      {!q && category === ALL && trending.length > 0 && (
        <section className="zb-section">
          <h2>Ko‘p baholangan</h2>
          <div className="zb-rail">
            {trending.map((b) => (
              <button key={b.id} className="zb-rail-item" onClick={() => onOpen(b)}>
                <BookCover book={b} size="md" />
                <strong>{b.title}</strong>
                <RatingLine rating={b.rating} count={b.reviews} />
              </button>
            ))}
          </div>
        </section>
      )}
      <section className="zb-section">
        <h2>{q ? `Natija: ${list.length}` : category === ALL ? "Barcha kitoblar" : category}</h2>
        {loading ? (
          <p className="zb-muted" role="status">Yuklanmoqda...</p>
        ) : error ? (
          <div className="zb-error" role="alert"><p>{error}</p><button className="zb-btn zb-btn-ghost" onClick={onRetry}>Qayta urinish</button></div>
        ) : list.length ? (
          <div className="zb-grid">
            {list.map((b) => (
              <article key={b.id} className="zb-card">
                <button className="zb-card-cover" onClick={() => onOpen(b)} aria-label={`${b.title} haqida`}><BookCover book={b} /></button>
                {isAdmin && <button type="button" className="zb-card-edit" onClick={() => onEdit(b)} aria-label={`${b.title} ni tahrirlash`}><Pencil size={15} /></button>}
                <div className="zb-card-body">
                  <button className="zb-card-title" onClick={() => onOpen(b)}>{b.title}</button>
                  <span className="zb-muted">{b.author}</span>
                  <RatingLine rating={b.rating} count={b.reviews} />
                  <div className="zb-card-foot">
                    <strong>{formatPrice(b.price)}</strong>
                    <button className="zb-add" aria-label={`${b.title}ni savatga qo‘shish`} onClick={() => onAdd(b)}><Plus size={18} /></button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : books.length ? (
          <div className="zb-empty"><Search size={28} /><h3>Kitob topilmadi</h3><button className="zb-btn zb-btn-ghost" onClick={() => { setQuery(""); setCategory(ALL); }}>Filtrlarni tozalash</button></div>
        ) : (
          <div className="zb-empty"><Store size={28} /><h3>Do‘kon tez orada ochiladi</h3>{isAdmin && <button className="zb-btn zb-btn-primary" onClick={onCreate}><Plus size={18} />Birinchi kitobni qo‘shish</button>}</div>
        )}
      </section>
    </>
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

function Totals({ cart }: { cart: Cart }) {
  return (
    <dl className="zb-totals">
      <div><dt>Kitoblar ({cart.count})</dt><dd>{formatPrice(cart.total)}</dd></div>
      <div><dt>Yetkazib berish</dt><dd>Operator aytadi</dd></div>
      <div className="zb-totals-sum"><dt>Jami</dt><dd>{formatPrice(cart.total)}</dd></div>
    </dl>
  );
}

function Checkout({ cart, signedIn, defaultName, onLogin, onBack, onPlaced }: {
  cart: Cart; signedIn: boolean; defaultName: string; onLogin: () => void; onBack: () => void; onPlaced: (order: StoreOrder) => void;
}) {
  const [form, setForm] = useState({ name: defaultName === "Kitobxon" ? "" : defaultName, phone: "+998", address: "", note: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  // Qayta urinishda bir xil raqam yuboriladi — buyurtma ikki marta yozilmaydi.
  const [orderId] = useState(newOrderId);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  if (!cart.items.length) return <div className="zb-empty"><ShoppingCart size={30} /><h3>Savat bo‘sh</h3><button className="zb-btn zb-btn-ghost" onClick={onBack}>Savatga qaytish</button></div>;
  if (!signedIn) {
    return (
      <div className="zb-empty">
        <ShoppingCart size={30} />
        <h3>Buyurtma uchun kiring</h3>
        <p className="zb-muted">Savatingiz saqlanadi — kirgandan keyin shu yerdan davom etasiz.</p>
        <div className="zb-row"><button className="zb-btn zb-btn-ghost" onClick={onBack}>Savatga qaytish</button><button className="zb-btn zb-btn-primary" onClick={onLogin}>Kirish</button></div>
      </div>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const phone = form.phone.replace(/[\s()-]/g, "");
    const next: Record<string, string> = {};
    if (form.name.trim().length < 2) next.name = "Ismingizni yozing";
    if (!PHONE_PATTERN.test(phone)) next.phone = "Telefon +998901234567 ko‘rinishida bo‘lsin";
    if (form.address.trim().length < 8) next.address = "Manzilni to‘liqroq yozing";
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await cart.commit();
      const order = await placeOrder({ id: orderId, name: form.name.trim(), phone, address: form.address.trim(), note: form.note.trim(), payment: "chat" });
      cart.clear();
      onPlaced(order);
    } catch (error) {
      if (error instanceof StoreError && error.status === 401) onLogin();
      else toast.error(error instanceof Error ? error.message : "Buyurtma saqlanmadi.");
    } finally {
      setBusy(false);
    }
  };

  const fields = [
    ["name", "Ism", "name", STORE_LIMITS.name],
    ["phone", "Telefon", "tel", 20],
    ["address", "Manzil", "street-address", STORE_LIMITS.address],
    ["note", "Izoh (ixtiyoriy)", "off", STORE_LIMITS.note],
  ] as const;

  return (
    <form className="zb-checkout" onSubmit={(e) => void submit(e)} noValidate>
      <section className="zb-panel">
        <h3>Yetkazib berish</h3>
        {fields.map(([key, label, autoComplete, max]) => (
          <div className="zb-field" key={key}>
            <label htmlFor={`co-${key}`}>{label}</label>
            <input id={`co-${key}`} autoComplete={autoComplete} inputMode={key === "phone" ? "tel" : undefined} value={form[key]} onChange={set(key)} maxLength={max} aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `co-${key}-err` : undefined} />
            {errors[key] && <small id={`co-${key}-err`} role="alert">{errors[key]}</small>}
          </div>
        ))}
      </section>
      <section className="zb-panel zb-pay">
        <h3>To‘lov</h3>
        <p className="zb-note">To‘lov chatda: admin hisob raqam yuboradi, siz chek rasmini shu chatga tashlaysiz.</p>
      </section>
      <Totals cart={cart} />
      <div className="zb-row"><button type="button" className="zb-btn zb-btn-ghost" onClick={onBack}>Orqaga</button><button className="zb-btn zb-btn-primary" disabled={busy}>{busy ? "Saqlanmoqda..." : "Buyurtmani tasdiqlash"}</button></div>
    </form>
  );
}

function Confirmation({ order, onChat, onLibrary }: { order: StoreOrder; onChat: () => void; onLibrary: () => void }) {
  return (
    <div className="zb-empty zb-success">
      <span className="zb-success-mark"><Check size={30} /></span>
      <h3>Buyurtma qabul qilindi</h3>
      <p>№ {order.id}<br />{formatPrice(order.total)}</p>
      <p className="zb-muted">Admin chatda hisob raqam yuboradi.</p>
      <div className="zb-row"><button className="zb-btn zb-btn-ghost" onClick={onLibrary}>Buyurtmalarim</button><button className="zb-btn zb-btn-primary" onClick={onChat}><MessageCircle size={17} />Chatga o‘tish</button></div>
    </div>
  );
}

function LibraryView({ books, shelf, signedIn, onOpen }: { books: StoreBook[]; shelf: string[]; signedIn: boolean; onOpen: (book: StoreBook) => void }) {
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
            </article>
          ))}
        </div>
      ) : (
        <div className="zb-empty"><Library size={30} /><h3>Buyurtmalar yo‘q</h3>{!signedIn && <p className="zb-muted">Buyurtmalar kirgan hisobingizda saqlanadi.</p>}</div>
      ))}
    </>
  );
}
