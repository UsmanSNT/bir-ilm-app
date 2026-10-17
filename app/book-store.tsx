"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowLeft, BookOpen, Check, MessageCircle, Pencil, Plus, Search, ShoppingCart, SlidersHorizontal, Store, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { useViewer } from "@/lib/api/roles-client";
import { fetchStoreProfile, newOrderId, placeOrder, StoreError, useCart, useStoreBooks, useStoreInbox } from "@/lib/api/store-client";
import {
  formatPrice,
  normalizePhone,
  normalizeTelegram,
  PHONE_PATTERN,
  TELEGRAM_PATTERN,
  STORE_LIMITS,
  type StoreBook,
  type StoreOrder,
} from "@/shared/contract";
import Dock, { type DockItem } from "./dock";
import { LoginDialog } from "./login-dialog";
import StoreBookPage from "./store-book-page";
import type { Conversation } from "./store-messages";
import StoreAccount, { type AccountTab, type AdminArea, type Cart, type PurchaseView, Totals } from "./store-account";
import StoreFabs from "./store-fabs";
import BookEditor from "./book-editor";
import { notifyCatalogChanged, useStoreCatalog } from "@/lib/api/books-client";
import { BookCover } from "./store-ui";

type Section = "catalog" | "account" | "checkout";

const titles: Record<Section, string> = { catalog: "Kitob do‘koni", account: "Hisobim", checkout: "Buyurtma berish" };
const ALL = "Barchasi";

/** Book Store: Bir Ilm ichidagi alohida rejim — pastki dock'da Do‘kon va Hisobim; markazdagi yulduz Bir Ilm'ga qaytaradi. */
/** Bildirishnomadan Hisobim bo'limini ochish (nonce — har safar qayta ochish uchun). */
export type StoreRoute = { tab: AccountTab; area?: AdminArea; nonce: number };

export default function BookStore({ shelf, route, onBack, onToggle }: { shelf: string[]; route?: StoreRoute; onBack: () => void; onToggle: (bookId: string) => void }) {
  const [section, setSection] = useState<Section>(route ? "account" : "catalog");
  const [accountTab, setAccountTab] = useState<AccountTab>(route?.tab ?? "cart");
  const [purchaseView, setPurchaseView] = useState<PurchaseView>("cart");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [placed, setPlaced] = useState<StoreOrder | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  /** Xabarlarda ochiladigan yozishma: buyurtma yoki umumiy; bo'sh bo'lsa — yozishmalar ro'yxati. */
  const [messagesStart, setMessagesStart] = useState<Conversation | null>(null);
  /** Kitob sahifasidan savol bo'lsa — birinchi xabar shu kitob haqida. */
  const [chatBook, setChatBook] = useState<StoreBook | null>(null);
  /** Admin: do'kon mahsulotini qo'shish/tahrirlash (id yo'q — yangi). */
  const [editing, setEditing] = useState<{ id: string | null } | null>(null);
  const viewer = useViewer();
  const isAdmin = viewer?.role === "admin";
  const store = useStoreBooks();
  const cart = useCart(store.items);
  const detail = detailId ? store.items.find((b) => b.id === detailId) ?? null : null;

  // Yozishmalarning o'qilmagani — Hisobim belgisi va Adminga yozish tugmasi uchun.
  const signedIn = Boolean(viewer?.signedIn);
  const unread = useStoreInbox(signedIn).inbox?.unread ?? 0;

  const resetView = () => { setDetailId(null); setPlaced(null); window.scrollTo({ top: 0 }); };
  const go = (next: "catalog" | "checkout") => { setSection(next); resetView(); };
  const openAccount = (tab: AccountTab, conversation: Conversation | null = null, book: StoreBook | null = null) => {
    setSection("account"); setAccountTab(tab); setMessagesStart(conversation); setChatBook(book); resetView();
  };
  // Kitob haqida savol — shu kitob bilan umumiy yozishma ochiladi; tugmadan — yozishmalar ro'yxati.
  const askAdmin = (book: StoreBook | null) => (signedIn ? openAccount("messages", book ? { kind: "general" } : null, book) : setLoginOpen(true));
  const openOrderChat = (order: StoreOrder) => { if (signedIn) openAccount("messages", { kind: "order", order }); };
  const openCart = () => { openAccount("cart"); setPurchaseView("cart"); };
  const openOrders = () => { openAccount("cart"); setPurchaseView("orders"); };
  const open = (book: StoreBook) => { setDetailId(book.id); window.scrollTo({ top: 0 }); };
  const addToCart = (book: StoreBook) => { cart.add(book.id); toast.success(`«${book.title}» savatga qo‘shildi`); };
  const active = section === "checkout" ? "account" : section;
  const catalogItem: DockItem = { id: "catalog", label: "Do‘kon", icon: Store, active: active === "catalog" && !detail, onClick: () => go("catalog") };
  const accountItem: DockItem = {
    id: "account", label: "Hisobim", icon: UserRound, active: active === "account" && !detail, badge: cart.count || undefined,
    onClick: () => openAccount(section === "account" ? accountTab : "cart"),
  };

  return (
    <div className="zb">
      <Dock
        mode="store"
        label="Book Store bo'limlari"
        left={[catalogItem]}
        right={[accountItem]}
        center={{ label: "Bir Ilm", ariaLabel: "Bir Ilm bosh sahifasiga qaytish", icon: BookOpen, onClick: onBack }}
      />
      <StoreFabs showChat={!(section === "account" && accountTab === "messages")} unread={unread} onChat={() => askAdmin(null)} />
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
            {section === "checkout" && <header className="zb-head"><button type="button" className="zb-back zb-back-round" onClick={openCart} aria-label="Orqaga" title="Orqaga"><ArrowLeft size={20} /></button><span className="zb-eyebrow">Bir Ilm · Book Store</span><h1>{titles.checkout}</h1></header>}
            {section === "catalog" && <StoreHome books={store.items} loading={store.loading} error={store.error} onRetry={store.reload} onOpen={open} onAdd={addToCart} isAdmin={isAdmin} onCreate={() => setEditing({ id: null })} onEdit={(b) => setEditing({ id: b.id })} />}
            {section === "account" && (
              <StoreAccount
                tab={accountTab}
                adminArea={route?.area}
                purchaseView={purchaseView}
                onPurchaseView={setPurchaseView}
                unread={unread}
                onTab={setAccountTab}
                cart={cart}
                books={store.items}
                messagesStart={messagesStart}
                chatBook={chatBook}
                onOpen={open}
                onCheckout={() => go("checkout")}
                onCatalog={() => go("catalog")}
                onOrderChat={openOrderChat}
                onNeedLogin={() => setLoginOpen(true)}
              />
            )}
            {section === "checkout" && (placed
              ? <Confirmation order={placed} onChat={() => openOrderChat(placed)} onLibrary={openOrders} />
              : <Checkout cart={cart} signedIn={Boolean(viewer?.signedIn)} defaultName={viewer?.name ?? ""} onLogin={() => setLoginOpen(true)} onBack={openCart} onPlaced={setPlaced} />)}
          </>
        )}
      </div>

      {isAdmin && editing && <StoreBookEditor id={editing.id} onClose={() => { setEditing(null); store.reload(); }} />}

      {viewer && <LoginDialog viewer={viewer} open={loginOpen} onOpenChange={setLoginOpen} />}
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

function StoreHome({ books, loading, error, onRetry, onOpen, onAdd, isAdmin, onCreate, onEdit }: {
  books: StoreBook[]; loading: boolean; error: string; onRetry: () => void;
  onOpen: (b: StoreBook) => void; onAdd: (b: StoreBook) => void;
  isAdmin: boolean; onCreate: () => void; onEdit: (b: StoreBook) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(ALL);
  const [filterOpen, setFilterOpen] = useState(false);
  // Filtr oynasi Esc yoki tashqariga bosilganda yopiladi.
  useEffect(() => {
    if (!filterOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFilterOpen(false); };
    const onDown = (e: PointerEvent) => { if (!(e.target as Element).closest("#zb-filter, .zb-icon-btn")) setFilterOpen(false); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("pointerdown", onDown); };
  }, [filterOpen]);
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
      <div className="zb-searchrow">
        <label className="zb-search">
          <Search size={20} />
          <input aria-label="Kitob yoki muallifni izlash" placeholder="Kitob yoki muallif..." value={query} onChange={(e) => setQuery(e.target.value)} />
          {query && <button type="button" aria-label="Tozalash" onClick={() => setQuery("")}><X size={16} /></button>}
        </label>
        {categories.length > 1 && (
          <button type="button" className={`zb-icon-btn${category !== ALL ? " is-on" : ""}`} onClick={() => setFilterOpen((v) => !v)} aria-expanded={filterOpen} aria-controls="zb-filter" aria-label={category === ALL ? "Janr bo‘yicha saralash" : `Janr: ${category}`} title="Janr bo‘yicha saralash">
            <SlidersHorizontal size={20} />
          </button>
        )}
        {isAdmin && <button type="button" className="zb-icon-btn zb-icon-add" onClick={onCreate} aria-label="Kitob qo‘shish" title="Kitob qo‘shish"><Plus size={22} /></button>}
        {filterOpen && categories.length > 1 && (
          <div id="zb-filter" className="zb-filter-pop" role="group" aria-label="Janrlar">
            {categories.map((c) => <button key={c} type="button" aria-pressed={category === c} onClick={() => { setCategory(c); setFilterOpen(false); }}>{c}</button>)}
          </div>
        )}
      </div>
      {!q && category === ALL && trending.length > 0 && (
        <section className="zb-section">
          <h2>Ko‘p baholangan</h2>
          <div className="zb-rail">
            {trending.map((b) => (
              <button key={b.id} className="zb-rail-item" onClick={() => onOpen(b)}>
                <BookCover book={b} size="md" />
                <strong>{b.title}</strong>
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
                  <div className="zb-card-foot">
                    <strong>{formatPrice(b.price)}</strong>
                    <button className="zb-add" aria-label={`${b.title}ni savatga qo‘shish`} onClick={() => onAdd(b)}><Plus size={15} strokeWidth={2.4} /></button>
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

function Checkout({ cart, signedIn, defaultName, onLogin, onBack, onPlaced }: {
  cart: Cart; signedIn: boolean; defaultName: string; onLogin: () => void; onBack: () => void; onPlaced: (order: StoreOrder) => void;
}) {
  const [form, setForm] = useState({ name: defaultName === "Kitobxon" ? "" : defaultName, phone: "", telegram: "", address: "", note: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  // Qayta urinishda bir xil raqam yuboriladi — buyurtma ikki marta yozilmaydi.
  const [orderId] = useState(newOrderId);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));
  // Do'kon sozlamalaridagi yetkazib berish ma'lumotlari — bo'sh maydonlarni oldindan to'ldiradi (yozilgan narsani o'chirmaydi).
  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    fetchStoreProfile().then((saved) => {
      if (!alive) return;
      setForm((f) => ({ name: f.name || saved.name, phone: f.phone || saved.phone, telegram: f.telegram || saved.telegram, address: f.address || saved.address, note: f.note }));
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [signedIn]);

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
    const phone = normalizePhone(form.phone);
    const telegram = normalizeTelegram(form.telegram);
    const next: Record<string, string> = {};
    if (form.name.trim().length < 2) next.name = "Ismingizni yozing";
    if (!PHONE_PATTERN.test(phone)) next.phone = "Telefon +998… yoki +82… (Koreya) ko‘rinishida bo‘lsin";
    if (telegram && !TELEGRAM_PATTERN.test(telegram)) next.telegram = "Telegram nomi: @nom (5–32 belgi)";
    if (form.address.trim().length < 8) next.address = "Manzilni to‘liqroq yozing";
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await cart.commit();
      const order = await placeOrder({ id: orderId, name: form.name.trim(), phone, telegram, address: form.address.trim(), note: form.note.trim(), payment: "chat" });
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
    ["name", "Ism", "name", STORE_LIMITS.name, undefined],
    ["phone", "Telefon", "tel", 24, "+998 90 123 45 67 yoki +82 10 1234 5678"],
    ["telegram", "Telegram (ixtiyoriy)", "off", 40, "@foydalanuvchi_nomi"],
    ["address", "Manzil", "street-address", STORE_LIMITS.address, undefined],
    ["note", "Izoh (ixtiyoriy)", "off", STORE_LIMITS.note, undefined],
  ] as const;

  return (
    <form className="zb-checkout" onSubmit={(e) => void submit(e)} noValidate>
      <section className="zb-panel">
        <h3>Yetkazib berish</h3>
        {fields.map(([key, label, autoComplete, max, placeholder]) => (
          <div className="zb-field" key={key}>
            <label htmlFor={`co-${key}`}>{label}</label>
            <input id={`co-${key}`} autoComplete={autoComplete} placeholder={placeholder} inputMode={key === "phone" ? "tel" : undefined} value={form[key]} onChange={set(key)} maxLength={max} aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `co-${key}-err` : undefined} />
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

