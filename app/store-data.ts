import { books, type Book } from "./app-data";

export type StoreMeta = { price: number; rating: number; reviews: number; category: string };
export type CartLine = { book: Book; meta: StoreMeta; qty: number };
export type PaymentMethod = "click" | "payme" | "uzum" | "visa" | "mastercard";
export type Order = {
  id: string;
  lines: { bookId: string; title: string; qty: number; price: number }[];
  subtotal: number;
  discount: number;
  total: number;
  name: string;
  phone: string;
  address: string;
  payment: PaymentMethod;
  createdAt: string;
};

/** Namuna narxlar (so'm). Haqiqiy narxlar do'kon ma'lumotlari ulangach almashtiriladi. */
export const storeMeta: Record<string, StoreMeta> = {
  "atomic-habits": { price: 89000, rating: 4.8, reviews: 214, category: "Shaxsiy rivojlanish" },
  alchemist: { price: 59000, rating: 4.7, reviews: 188, category: "Badiiy adabiyot" },
  "otkan-kunlar": { price: 75000, rating: 4.9, reviews: 302, category: "O‘zbek adabiyoti" },
  "1984": { price: 69000, rating: 4.6, reviews: 121, category: "Badiiy adabiyot" },
  ikigai: { price: 65000, rating: 4.5, reviews: 97, category: "Shaxsiy rivojlanish" },
  "deep-work": { price: 85000, rating: 4.6, reviews: 76, category: "Shaxsiy rivojlanish" },
  "money-psychology": { price: 92000, rating: 4.8, reviews: 143, category: "Biznes va moliya" },
  metamorphosis: { price: 45000, rating: 4.4, reviews: 58, category: "Badiiy adabiyot" },
  "start-with-why": { price: 79000, rating: 4.5, reviews: 64, category: "Biznes va moliya" },
};

export const paymentMethods: { id: PaymentMethod; label: string }[] = [
  { id: "click", label: "Click" },
  { id: "payme", label: "Payme" },
  { id: "uzum", label: "Uzum" },
  { id: "visa", label: "Visa" },
  { id: "mastercard", label: "Mastercard" },
];

/** Promo kodlar (chegirma foizi). Server tomonda tekshiruv to'lov integratsiyasi bilan qo'shiladi. */
export const promoCodes: Record<string, number> = { BIRILM10: 10, KITOB15: 15 };

export const MAX_QTY = 10;

export const formatPrice = (value: number) => `${value.toLocaleString("ru-RU").replace(/,/g, " ")} so‘m`;

export const getMeta = (book: Book): StoreMeta =>
  storeMeta[book.id] ?? { price: 60000, rating: 4.5, reviews: 0, category: "Boshqa" };

export const catalogForAi = () =>
  books.map(book => {
    const meta = getMeta(book);
    return `${book.id} | ${book.title} | ${book.author} | ${meta.category} | ${meta.price} so'm | ${book.pages} bet`;
  }).join("\n");

/** Xom kirishni tekshiradi: faqat katalogdagi kitoblar, butun miqdor 1..MAX_QTY. Noto'g'ri bo'lsa null. */
export function sanitizeCart(raw: unknown): Record<string, number> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length > books.length) return null;
  const cart: Record<string, number> = {};
  for (const [id, qty] of entries) {
    if (!books.some(b => b.id === id) || typeof qty !== "number" || !Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return null;
    cart[id] = qty;
  }
  return cart;
}

export function computeTotals(cart: Record<string, number>, promo: string) {
  const subtotal = Object.entries(cart).reduce((sum, [id, qty]) => {
    const book = books.find(b => b.id === id);
    return sum + (book ? getMeta(book).price * qty : 0);
  }, 0);
  const percent = promo in promoCodes ? promoCodes[promo] : 0;
  const discount = Math.round(subtotal * percent / 100);
  return { subtotal, percent, discount, total: subtotal - discount };
}
