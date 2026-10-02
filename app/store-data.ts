import { books, type Book } from "./app-data";

export type StoreMeta = { price: number; category: string; about: string };
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

/** Narxlar namuna (so'm); haqiqiy narxlar do'kon ma'lumotlari ulangach almashtiriladi. */
export const storeMeta: Record<string, StoreMeta> = {
  "atomic-habits": { price: 89000, category: "Shaxsiy rivojlanish", about: "Kichik, kundalik 1% yaxshilanishlar vaqt o‘tib katta natija berishi haqida. Muallif odat shakllanishining to‘rt qonunini tushuntiradi: odatni ko‘zga tashlanadigan, jozibali, oson va qoniqarli qilish. Asosiy g‘oya — maqsadlarga emas, tizim va o‘zligingizga tayangan odatlar qurish." },
  alchemist: { price: 59000, category: "Badiiy adabiyot", about: "Andalusiyalik yosh cho‘pon Santyago tushida ko‘rgan xazinani izlab Misr ehromlari tomon yo‘lga chiqadi. Safar davomida u qalbini tinglashni, belgilarni o‘qishni va o‘z «shaxsiy afsona»sini anglashni o‘rganadi. Orzu, sabr va hayot yo‘lini tanlash haqidagi qisqa, ramziy roman." },
  "otkan-kunlar": { price: 75000, category: "O‘zbek adabiyoti", about: "O‘zbek adabiyotidagi ilk roman. XIX asr Turkistoni, Qo‘qon xonligidagi siyosiy nizolar fonida Otabek va Kumushning fojiali muhabbati hikoya qilinadi. Asar o‘sha davr urf-odatlari, oilaviy munosabatlar va jamiyat illatlarini jonli tasvirlaydi." },
  "1984": { price: 69000, category: "Badiiy adabiyot", about: "Okeaniya davlatida har bir qadam «Katta Og‘a» nazoratida. Haqiqat vazirligida tarixni qayta yozuvchi Uinston Smit tizimga qarshi ichki isyon boshlaydi. Totalitarizm, tilni boshqarish orqali fikrni cheklash va shaxs erkinligi haqidagi ogohlantiruvchi roman." },
  ikigai: { price: 65000, category: "Shaxsiy rivojlanish", about: "Yaponiyaning Okinava orolidagi uzoq umr ko‘ruvchilar hayoti asosida yozilgan kitob. «Ikigai» — har kuni ertalab turishga sabab bo‘ladigan mazmun. Mualliflar faol hayot, do‘stlik, sog‘lom ovqatlanish va sevimli ishga berilish haqida amaliy xulosalar beradi." },
  "deep-work": { price: 85000, category: "Shaxsiy rivojlanish", about: "Chalg‘ituvchilarsiz, to‘liq diqqat bilan ishlash qobiliyati bugun kamyob va qimmatli ekanini isbotlaydi. Muallif chuqur ishlash uchun vaqt ajratish, zerikishga chidash, ijtimoiy tarmoqlardan ongli foydalanish va sayoz ishlarni kamaytirish qoidalarini taklif qiladi." },
  "money-psychology": { price: 92000, category: "Biznes va moliya", about: "Pul bilan muvaffaqiyat bilimdan ko‘ra xulq-atvorga bog‘liq. Qisqa hikoyalar orqali muallif murakkab foiz, sabr, xavf, omad va «yetarli» tushunchasini tushuntiradi. Moliyaviy qarorlarni hissiyot emas, ongli tanlov asosida qilishga o‘rgatadi." },
  metamorphosis: { price: 45000, category: "Badiiy adabiyot", about: "Gregor Zamza bir kuni ertalab ulkan hasharotga aylanib uyg‘onadi. Oilasini boqib kelgan odam endi ularga yuk bo‘lib qoladi. Begonalashuv, oila va inson qadri haqidagi qisqa, ammo chuqur ma’noli qissa." },
  "start-with-why": { price: 79000, category: "Biznes va moliya", about: "Ilhomlantiruvchi yetakchi va kompaniyalar avval «Nima uchun?» savoliga javob beradi, keyin «Qanday?» va «Nima?»ga o‘tadi. Muallif «Oltin doira» modeli orqali odamlar mahsulotga emas, uning ortidagi maqsad va ishonchga ergashishini ko‘rsatadi." },
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
  storeMeta[book.id] ?? { price: 60000, category: "Boshqa", about: book.summary };

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
