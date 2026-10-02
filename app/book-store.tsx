"use client";

import { FormEvent, useState } from "react";
import { BookOpen, Check, Heart, Library, Minus, Plus, ShoppingCart, Sparkles, Star, Store, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import BookDiscovery from "./book-discovery";
import StoreAi, { askAi } from "./store-ai";
import { useStoreState } from "./store-state";
import { books, type Book } from "./app-data";
import { formatPrice, getMeta, MAX_QTY, paymentMethods, type Order, type PaymentMethod } from "./store-data";

type Section = "catalog" | "ai" | "cart" | "checkout" | "library";
type Icon = typeof Store;

const left: [Section, string, Icon][] = [["catalog", "Katalog", Store], ["ai", "AI yordamchi", Sparkles]];
const right: [Section, string, Icon][] = [["cart", "Savat", ShoppingCart], ["library", "Kutubxona", Library]];
const titles: Record<Section, string> = { catalog: "Kitob do‘koni", ai: "AI yordamchi", cart: "Savat", checkout: "Buyurtma berish", library: "Kutubxona" };
const phoneRe = /^\+998\d{9}$/;

export default function BookStore({ shelf, onBack, onToggle }: {
  shelf: string[]; onBack: () => void; onToggle: (book: Book) => void;
}) {
  const [section, setSection] = useState<Section>("catalog");
  const [detail, setDetail] = useState<Book | null>(null);
  const [placed, setPlaced] = useState<Order | null>(null);
  const cart = useStoreState();

  const go = (next: Section) => { setSection(next); setPlaced(null); window.scrollTo({ top: 0 }); };
  const active = section === "checkout" ? "cart" : section;
  const tab = ([id, label, Icon]: [Section, string, Icon]) => (
    <button key={id} type="button" aria-current={active === id ? "page" : undefined} onClick={() => go(id)}>
      <span className="store-icon"><Icon size={22} strokeWidth={1.8} />{id === "cart" && cart.count > 0 && <b className="store-badge">{cart.count}</b>}</span><span>{label}</span>
    </button>
  );
  const addToCart = (book: Book) => { cart.add(book.id); toast.success("Savatga qo‘shildi"); };

  return <>
    <nav className="store-nav" aria-label="Book Store bo'limlari">
      {left.map(tab)}
      <button type="button" className="store-home" onClick={onBack} aria-label="Bir Ilm bosh sahifasiga qaytish"><BookOpen size={22} strokeWidth={1.8} /><span>Bir Ilm</span></button>
      {right.map(tab)}
    </nav>
    <div className="workspace">
      <div className="page-heading"><div><p className="eyebrow">BOOK STORE</p><h1>{titles[section]}</h1></div></div>
      {section === "catalog" && <BookDiscovery library shelf={shelf} page={0} total={1} streak={0} onNavigate={() => {}} onProgress={() => {}} onOpen={setDetail} onToggle={onToggle} />}
      {section === "ai" && <StoreAi />}
      {section === "cart" && <Cart cart={cart} onCheckout={() => go("checkout")} onCatalog={() => go("catalog")} />}
      {section === "checkout" && (placed
        ? <Confirmation order={placed} onLibrary={() => go("library")} />
        : <Checkout cart={cart} onBack={() => go("cart")} onPlaced={setPlaced} />)}
      {section === "library" && <LibraryView shelf={shelf} orders={cart.orders} onOpen={setDetail} />}
    </div>
    <Dialog open={!!detail} onOpenChange={open => { if (!open) setDetail(null); }}>
      <DialogContent>{detail && <Detail key={detail.id} book={detail} saved={shelf.includes(detail.id)} onToggle={() => onToggle(detail)} onAdd={() => addToCart(detail)} />}</DialogContent>
    </Dialog>
  </>;
}

function Detail({ book, saved, onToggle, onAdd }: { book: Book; saved: boolean; onToggle: () => void; onAdd: () => void }) {
  const meta = getMeta(book);
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const generate = async () => { setBusy(true); setSummary(await askAi({ mode: "summary", bookId: book.id })); setBusy(false); };
  return <>
    <DialogTitle>{book.title}</DialogTitle>
    <DialogDescription>{book.author} · {meta.category}</DialogDescription>
    <p>{book.summary}</p>
    <p className="book-detail-meta"><Star size={16}/> {meta.rating} ({meta.reviews} sharh) · <BookOpen size={16}/> {book.pages} sahifa</p>
    <p className="store-price">{formatPrice(meta.price)}</p>
    <div className="store-actions">
      <button className="button" onClick={onAdd}><ShoppingCart size={17}/>Savatga</button>
      <button className="button" aria-pressed={saved} onClick={onToggle}><Heart size={17}/>{saved ? "Javondan olish" : "Javonga"}</button>
      <button className="button" disabled={busy} onClick={() => void generate()}><Sparkles size={17}/>{busy ? "Tayyorlanmoqda..." : "AI xulosa"}</button>
    </div>
    {summary && <div className="store-ai-msg model" style={{ whiteSpace: "pre-wrap" }}>{summary}</div>}
  </>;
}

function Cart({ cart, onCheckout, onCatalog }: { cart: ReturnType<typeof useStoreState>; onCheckout: () => void; onCatalog: () => void }) {
  const [code, setCode] = useState("");
  if (!cart.lines.length) return <div className="store-empty"><ShoppingCart size={28}/><h3>Savat bo‘sh</h3><button className="button" onClick={onCatalog}>Katalogga o‘tish</button></div>;
  return <div className="store-cart">
    {cart.lines.map(({ book, meta, qty }) => <article className="store-line" key={book.id}>
      <span className="store-thumb" style={{ backgroundColor: book.color }} aria-hidden/>
      <div><strong>{book.title}</strong><p>{book.author}</p><span>{formatPrice(meta.price)}</span></div>
      <div className="store-qty">
        <button aria-label="Kamaytirish" onClick={() => cart.setQty(book.id, qty - 1)}><Minus size={16}/></button><span aria-live="polite">{qty}</span>
        <button aria-label="Ko‘paytirish" disabled={qty >= MAX_QTY} onClick={() => cart.setQty(book.id, qty + 1)}><Plus size={16}/></button>
        <button aria-label={`${book.title}ni olib tashlash`} onClick={() => cart.setQty(book.id, 0)}><Trash2 size={16}/></button>
      </div>
    </article>)}
    <form className="store-promo" onSubmit={(e: FormEvent) => { e.preventDefault(); if (cart.applyPromo(code)) { toast.success("Promo kod qo‘llandi"); setCode(""); } else toast.error("Promo kod noto‘g‘ri"); }}>
      <input aria-label="Promo kod" value={code} onChange={e => setCode(e.target.value)} placeholder="Promo kod" maxLength={20}/>
      <button className="button" disabled={!code.trim()}>Qo‘llash</button>
      {cart.promo && <button type="button" className="button" onClick={cart.clearPromo}>{cart.promo} · {cart.percent}% ✕</button>}
    </form>
    <Totals cart={cart}/>
    <button className="button" onClick={onCheckout}>Buyurtma berish</button>
  </div>;
}

function Totals({ cart }: { cart: ReturnType<typeof useStoreState> }) {
  return <dl className="store-totals">
    <div><dt>Jami</dt><dd>{formatPrice(cart.subtotal)}</dd></div>
    {cart.discount > 0 && <div><dt>Chegirma</dt><dd>−{formatPrice(cart.discount)}</dd></div>}
    <div><dt><strong>To‘lash uchun</strong></dt><dd><strong>{formatPrice(cart.total)}</strong></dd></div>
  </dl>;
}

function Checkout({ cart, onBack, onPlaced }: { cart: ReturnType<typeof useStoreState>; onBack: () => void; onPlaced: (order: Order) => void }) {
  const [form, setForm] = useState({ name: "", phone: "+998", address: "" });
  const [payment, setPayment] = useState<PaymentMethod>("click");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  // Qayta urinishda bir xil raqam yuboriladi, shuning uchun buyurtma ikki marta yozilmaydi.
  const [orderId] = useState(() => `ZB-${crypto.randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase()}`);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm(f => ({ ...f, [key]: e.target.value }));

  if (!cart.lines.length) return <div className="store-empty"><ShoppingCart size={28}/><h3>Savat bo‘sh</h3><button className="button" onClick={onBack}>Savatga qaytish</button></div>;

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

  return <form className="store-checkout" onSubmit={e => void submit(e)} noValidate>
    {([["name", "Ism", "name"], ["phone", "Telefon", "tel"], ["address", "Yetkazib berish manzili", "street-address"]] as const).map(([key, label, ac]) => <div key={key}>
      <label htmlFor={`co-${key}`}>{label}</label>
      <input id={`co-${key}`} autoComplete={ac} value={form[key]} onChange={set(key)} maxLength={160} aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `co-${key}-err` : undefined}/>
      {errors[key] && <small id={`co-${key}-err`} role="alert">{errors[key]}</small>}
    </div>)}
    <fieldset className="store-pay"><legend>To‘lov usuli</legend>
      {paymentMethods.map(m => <label key={m.id}><input type="radio" name="payment" checked={payment === m.id} onChange={() => setPayment(m.id)}/>{m.label}</label>)}
    </fieldset>
    <p className="muted">To‘lov tizimlari hali ulanmagan: buyurtma serverda «To‘lov kutilmoqda» holatida saqlanadi, pul yechilmaydi.</p>
    <Totals cart={cart}/>
    <div className="store-actions"><button type="button" className="button" onClick={onBack}>Orqaga</button><button className="button" disabled={busy}>{busy ? "Saqlanmoqda..." : "Buyurtmani tasdiqlash"}</button></div>
  </form>;
}

function Confirmation({ order, onLibrary }: { order: Order; onLibrary: () => void }) {
  return <div className="store-empty"><Check size={32}/><h3>Buyurtma qabul qilindi</h3>
    <p>№ {order.id} · {formatPrice(order.total)} · {paymentMethods.find(m => m.id === order.payment)?.label}</p>
    <p className="muted">Holat: to‘lov kutilmoqda.</p>
    <button className="button" onClick={onLibrary}>Buyurtmalarni ko‘rish</button></div>;
}

function LibraryView({ shelf, orders, onOpen }: { shelf: string[]; orders: Order[]; onOpen: (book: Book) => void }) {
  const [view, setView] = useState<"saved" | "orders">("saved");
  const saved = books.filter(b => shelf.includes(b.id));
  return <div className="discovery">
    <div className="genre-chips"><button aria-pressed={view === "saved"} onClick={() => setView("saved")}>Sevimlilar ({saved.length})</button><button aria-pressed={view === "orders"} onClick={() => setView("orders")}>Buyurtmalar ({orders.length})</button></div>
    {view === "saved" && (saved.length
      ? <div className="discovery-books">{saved.map(book => <article className="discovery-book" key={book.id}>
          <button className="discovery-cover" style={{ backgroundColor: book.color }} onClick={() => onOpen(book)} aria-label={`${book.title} haqida`}><strong>{book.title}</strong><span className="cover-author">{book.author}</span></button>
          <button className="catalog-book-title" onClick={() => onOpen(book)}>{book.title}</button><p>{book.author}</p></article>)}</div>
      : <div className="store-empty"><Heart size={28}/><h3>Sevimlilar bo‘sh</h3></div>)}
    {view === "orders" && (orders.length
      ? <div className="store-cart">{orders.map(o => <article className="store-line" key={o.id}>
          <div><strong>№ {o.id}</strong><p>{new Date(o.createdAt).toLocaleDateString("uz-UZ")} · {o.lines.map(l => `${l.title} ×${l.qty}`).join(", ")}</p><span>{formatPrice(o.total)} · to‘lov kutilmoqda</span></div></article>)}</div>
      : <div className="store-empty"><Library size={28}/><h3>Buyurtmalar yo‘q</h3></div>)}
  </div>;
}
