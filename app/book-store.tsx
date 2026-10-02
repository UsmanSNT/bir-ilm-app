"use client";

import { FormEvent, useMemo, useState } from "react";
import { BookOpen, Check, Heart, Library, Minus, Plus, Search, ShoppingCart, Sparkles, Store, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import StoreAi from "./store-ai";
import StoreBookPage from "./store-book-page";
import { BookCover, RatingLine, useReviewSummaries } from "./store-ui";
import { useStoreState } from "./store-state";
import { books, type Book } from "./app-data";
import { formatPrice, getMeta, MAX_QTY, paymentMethods, type Order, type PaymentMethod } from "./store-data";

type Section = "catalog" | "ai" | "cart" | "checkout" | "library";
type Icon = typeof Store;
type Cart = ReturnType<typeof useStoreState>;

const left: [Section, string, Icon][] = [["catalog", "Do‘kon", Store], ["ai", "AI", Sparkles]];
const right: [Section, string, Icon][] = [["cart", "Savat", ShoppingCart], ["library", "Kutubxona", Library]];
const titles: Record<Section, string> = { catalog: "Kitob do‘koni", ai: "AI yordamchi", cart: "Savat", checkout: "Buyurtma berish", library: "Kutubxonam" };
const categories = ["Barchasi", ...new Set(books.map(b => getMeta(b).category))];
const phoneRe = /^\+998\d{9}$/;

export default function BookStore({ shelf, name, onBack, onToggle }: {
  shelf: string[]; name: string; onBack: () => void; onToggle: (book: Book) => void;
}) {
  const [section, setSection] = useState<Section>("catalog");
  const [detail, setDetail] = useState<Book | null>(null);
  const [placed, setPlaced] = useState<Order | null>(null);
  const [reviewsVersion, setReviewsVersion] = useState(0);
  const summaries = useReviewSummaries(reviewsVersion);
  const cart = useStoreState();

  const go = (next: Section) => { setSection(next); setDetail(null); setPlaced(null); window.scrollTo({ top: 0 }); };
  const open = (book: Book) => { setDetail(book); window.scrollTo({ top: 0 }); };
  const addToCart = (book: Book) => { cart.add(book.id); toast.success(`«${book.title}» savatga qo‘shildi`); };
  const active = section === "checkout" ? "cart" : section;
  const tab = ([id, label, Icon]: [Section, string, Icon]) => (
    <button key={id} type="button" aria-current={active === id && !detail ? "page" : undefined} onClick={() => go(id)}>
      <span className="zb-nav-icon"><Icon size={22} strokeWidth={1.8} />{id === "cart" && cart.count > 0 && <b className="zb-badge">{cart.count}</b>}</span><span>{label}</span>
    </button>
  );

  return <div className="zb">
    <nav className="zb-nav" aria-label="Book Store bo'limlari">
      {left.map(tab)}
      <button type="button" className="zb-nav-home" onClick={onBack} aria-label="Bir Ilm bosh sahifasiga qaytish"><span className="zb-nav-home-mark"><BookOpen size={22} strokeWidth={1.8} /></span><span>Bir Ilm</span></button>
      {right.map(tab)}
    </nav>
    <div className="zb-page">
      {detail
        ? <StoreBookPage key={detail.id} book={detail} name={name} saved={shelf.includes(detail.id)} summaries={summaries}
            onBack={() => setDetail(null)} onOpen={open} onAdd={() => addToCart(detail)} onToggle={() => onToggle(detail)} onReviewed={() => setReviewsVersion(v => v + 1)} />
        : <>
          {section !== "catalog" && <header className="zb-head"><span className="zb-eyebrow">BIR ILM · BOOK STORE</span><h1>{titles[section]}</h1></header>}
          {section === "catalog" && <StoreHome summaries={summaries} onOpen={open} onAdd={addToCart} onAi={() => go("ai")} />}
          {section === "ai" && <StoreAi />}
          {section === "cart" && <CartView cart={cart} onCheckout={() => go("checkout")} onCatalog={() => go("catalog")} onOpen={open} />}
          {section === "checkout" && (placed
            ? <Confirmation order={placed} onLibrary={() => go("library")} />
            : <Checkout cart={cart} onBack={() => go("cart")} onPlaced={setPlaced} />)}
          {section === "library" && <LibraryView shelf={shelf} orders={cart.orders} onOpen={open} />}
        </>}
    </div>
  </div>;
}

function StoreHome({ summaries, onOpen, onAdd, onAi }: { summaries: ReturnType<typeof useReviewSummaries>; onOpen: (b: Book) => void; onAdd: (b: Book) => void; onAi: () => void }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Barchasi");
  const q = query.trim().toLocaleLowerCase();
  const list = useMemo(() => books.filter(b => (category === "Barchasi" || getMeta(b).category === category) && `${b.title} ${b.author}`.toLocaleLowerCase().includes(q)), [category, q]);
  // Trend: eng ko'p baholangan kitoblar (baho bo'lmasa katalog tartibi).
  const trending = useMemo(() => [...books].sort((a, b) => (summaries[b.id]?.count ?? 0) - (summaries[a.id]?.count ?? 0)).slice(0, 6), [summaries]);

  return <>
    <header className="zb-head zb-head-home"><span className="zb-eyebrow">BIR ILM · BOOK STORE</span><h1>Har bir kitob —<br /><em>yangi imkoniyat</em></h1></header>
    <label className="zb-search"><Search size={20} /><input aria-label="Kitob yoki muallifni izlash" placeholder="Kitob yoki muallif..." value={query} onChange={e => setQuery(e.target.value)} />{query && <button type="button" aria-label="Tozalash" onClick={() => setQuery("")}><X size={16} /></button>}</label>
    {!q && <button className="zb-ai-banner" onClick={onAi}><Sparkles size={26} /><span><strong>AI sizga kitob tanlab beradi</strong><small>Qiziqishingizni yozing — katalogdan mosini topadi</small></span></button>}
    <div className="zb-chips" role="group" aria-label="Kategoriyalar">{categories.map(c => <button key={c} aria-pressed={category === c} onClick={() => setCategory(c)}>{c}</button>)}</div>
    {!q && category === "Barchasi" && <section className="zb-section"><h2>Trendda</h2>
      <div className="zb-rail">{trending.map(b => <button key={b.id} className="zb-rail-item" onClick={() => onOpen(b)}><BookCover book={b} size="md" /><strong>{b.title}</strong><RatingLine summary={summaries[b.id]} /></button>)}</div>
    </section>}
    <section className="zb-section"><h2>{q ? `Natija: ${list.length}` : category === "Barchasi" ? "Barcha kitoblar" : category}</h2>
      {list.length ? <div className="zb-grid">{list.map(b => <article key={b.id} className="zb-card">
        <button className="zb-card-cover" onClick={() => onOpen(b)} aria-label={`${b.title} haqida`}><BookCover book={b} /></button>
        <div className="zb-card-body">
          <button className="zb-card-title" onClick={() => onOpen(b)}>{b.title}</button>
          <span className="zb-muted">{b.author}</span>
          <RatingLine summary={summaries[b.id]} />
          <div className="zb-card-foot"><strong>{formatPrice(getMeta(b).price)}</strong><button className="zb-add" aria-label={`${b.title}ni savatga qo‘shish`} onClick={() => onAdd(b)}><Plus size={18} /></button></div>
        </div>
      </article>)}</div>
        : <div className="zb-empty"><Search size={28} /><h3>Kitob topilmadi</h3><button className="zb-btn zb-btn-ghost" onClick={() => { setQuery(""); setCategory("Barchasi"); }}>Filtrlarni tozalash</button></div>}
    </section>
  </>;
}

function CartView({ cart, onCheckout, onCatalog, onOpen }: { cart: Cart; onCheckout: () => void; onCatalog: () => void; onOpen: (b: Book) => void }) {
  const [code, setCode] = useState("");
  if (!cart.lines.length) return <div className="zb-empty"><ShoppingCart size={30} /><h3>Savat bo‘sh</h3><button className="zb-btn zb-btn-primary" onClick={onCatalog}>Do‘konga o‘tish</button></div>;
  return <div className="zb-cart">
    {cart.lines.map(({ book, meta, qty }) => <article className="zb-line" key={book.id}>
      <button className="zb-line-cover" onClick={() => onOpen(book)} aria-label={`${book.title} haqida`}><BookCover book={book} size="sm" /></button>
      <div className="zb-line-info"><strong>{book.title}</strong><span className="zb-muted">{book.author}</span><span className="zb-line-price">{formatPrice(meta.price * qty)}</span></div>
      <div className="zb-qty">
        <button aria-label="Kamaytirish" onClick={() => cart.setQty(book.id, qty - 1)}>{qty === 1 ? <Trash2 size={15} /> : <Minus size={15} />}</button>
        <span aria-live="polite">{qty}</span>
        <button aria-label="Ko‘paytirish" disabled={qty >= MAX_QTY} onClick={() => cart.setQty(book.id, qty + 1)}><Plus size={15} /></button>
      </div>
    </article>)}
    <form className="zb-promo" onSubmit={(e: FormEvent) => { e.preventDefault(); if (cart.applyPromo(code)) { toast.success("Promo kod qo‘llandi"); setCode(""); } else toast.error("Promo kod noto‘g‘ri"); }}>
      {cart.promo
        ? <span className="zb-promo-on"><Check size={16} />{cart.promo} · −{cart.percent}%<button type="button" aria-label="Promo kodni olib tashlash" onClick={cart.clearPromo}><X size={15} /></button></span>
        : <><input aria-label="Promo kod" value={code} onChange={e => setCode(e.target.value)} placeholder="Promo kod" maxLength={20} /><button className="zb-btn zb-btn-ghost" disabled={!code.trim()}>Qo‘llash</button></>}
    </form>
    <Totals cart={cart} />
    <button className="zb-btn zb-btn-primary zb-btn-block" onClick={onCheckout}>Rasmiylashtirish · {formatPrice(cart.total)}</button>
  </div>;
}

function Totals({ cart }: { cart: Cart }) {
  return <dl className="zb-totals">
    <div><dt>Kitoblar ({cart.count})</dt><dd>{formatPrice(cart.subtotal)}</dd></div>
    {cart.discount > 0 && <div><dt>Chegirma</dt><dd>−{formatPrice(cart.discount)}</dd></div>}
    <div className="zb-totals-sum"><dt>Jami</dt><dd>{formatPrice(cart.total)}</dd></div>
  </dl>;
}

function Checkout({ cart, onBack, onPlaced }: { cart: Cart; onBack: () => void; onPlaced: (order: Order) => void }) {
  const [form, setForm] = useState({ name: "", phone: "+998", address: "" });
  const [payment, setPayment] = useState<PaymentMethod>("click");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  // Qayta urinishda bir xil raqam yuboriladi, shuning uchun buyurtma ikki marta yozilmaydi.
  const [orderId] = useState(() => `ZB-${crypto.randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase()}`);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm(f => ({ ...f, [key]: e.target.value }));

  if (!cart.lines.length) return <div className="zb-empty"><ShoppingCart size={30} /><h3>Savat bo‘sh</h3><button className="zb-btn zb-btn-ghost" onClick={onBack}>Savatga qaytish</button></div>;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const next: Record<string, string> = {};
    if (form.name.trim().length < 2) next.name = "Ismni kiriting";
    if (!phoneRe.test(form.phone.replace(/\s/g, ""))) next.phone = "Telefon +998901234567 ko‘rinishida bo‘lsin";
    if (form.address.trim().length < 8) next.address = "Manzilni to‘liq kiriting";
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    const order = await cart.placeOrder(orderId, { name: form.name.trim(), phone: form.phone.replace(/\s/g, ""), address: form.address.trim(), payment });
    setBusy(false);
    if (order) onPlaced(order); else toast.error("Buyurtma saqlanmadi. Qayta urinib ko‘ring.");
  };

  return <form className="zb-checkout" onSubmit={e => void submit(e)} noValidate>
    <section className="zb-panel"><h3>Yetkazib berish</h3>
      {([["name", "Ism", "name"], ["phone", "Telefon", "tel"], ["address", "Manzil", "street-address"]] as const).map(([key, label, ac]) => <div className="zb-field" key={key}>
        <label htmlFor={`co-${key}`}>{label}</label>
        <input id={`co-${key}`} autoComplete={ac} inputMode={key === "phone" ? "tel" : undefined} value={form[key]} onChange={set(key)} maxLength={160} aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `co-${key}-err` : undefined} />
        {errors[key] && <small id={`co-${key}-err`} role="alert">{errors[key]}</small>}
      </div>)}
    </section>
    <fieldset className="zb-panel zb-pay"><legend>To‘lov usuli</legend>
      {paymentMethods.map(m => <label key={m.id} className={payment === m.id ? "is-on" : ""}><input type="radio" name="payment" checked={payment === m.id} onChange={() => setPayment(m.id)} />{m.label}</label>)}
      <p className="zb-muted">To‘lov tizimlari hali ulanmagan: buyurtma «To‘lov kutilmoqda» holatida saqlanadi, pul yechilmaydi.</p>
    </fieldset>
    <Totals cart={cart} />
    <div className="zb-row"><button type="button" className="zb-btn zb-btn-ghost" onClick={onBack}>Orqaga</button><button className="zb-btn zb-btn-primary" disabled={busy}>{busy ? "Saqlanmoqda..." : "Buyurtmani tasdiqlash"}</button></div>
  </form>;
}

function Confirmation({ order, onLibrary }: { order: Order; onLibrary: () => void }) {
  return <div className="zb-empty zb-success"><span className="zb-success-mark"><Check size={30} /></span><h3>Buyurtma qabul qilindi</h3>
    <p>№ {order.id}<br />{formatPrice(order.total)} · {paymentMethods.find(m => m.id === order.payment)?.label}</p>
    <p className="zb-muted">Holat: to‘lov kutilmoqda.</p>
    <button className="zb-btn zb-btn-primary" onClick={onLibrary}>Buyurtmalarim</button></div>;
}

function LibraryView({ shelf, orders, onOpen }: { shelf: string[]; orders: Order[]; onOpen: (book: Book) => void }) {
  const [view, setView] = useState<"saved" | "orders">("saved");
  const saved = books.filter(b => shelf.includes(b.id));
  return <>
    <div className="zb-segment" role="tablist"><button role="tab" aria-selected={view === "saved"} onClick={() => setView("saved")}><Heart size={16} />Sevimlilar · {saved.length}</button><button role="tab" aria-selected={view === "orders"} onClick={() => setView("orders")}><Library size={16} />Buyurtmalar · {orders.length}</button></div>
    {view === "saved" && (saved.length
      ? <div className="zb-grid">{saved.map(b => <button key={b.id} className="zb-shelf-item" onClick={() => onOpen(b)}><BookCover book={b} /><strong>{b.title}</strong><span className="zb-muted">{b.author}</span></button>)}</div>
      : <div className="zb-empty"><Heart size={30} /><h3>Sevimlilar bo‘sh</h3><p className="zb-muted">Kitob sahifasidagi ♡ tugmasi bilan qo‘shing.</p></div>)}
    {view === "orders" && (orders.length
      ? <div className="zb-cart">{orders.map(o => <article className="zb-order" key={o.id}>
          <div className="zb-order-head"><strong>№ {o.id}</strong><span className="zb-status">To‘lov kutilmoqda</span></div>
          <p className="zb-muted">{new Date(o.createdAt).toLocaleDateString("ru-RU")} · {o.lines.map(l => `${l.title} ×${l.qty}`).join(", ")}</p>
          <strong>{formatPrice(o.total)}</strong></article>)}</div>
      : <div className="zb-empty"><Library size={30} /><h3>Buyurtmalar yo‘q</h3></div>)}
  </>;
}
