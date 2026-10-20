/** Book Store: katalog, savat, buyurtma va kitob sharhlari. */
import { z } from "zod";
import type { EbookInfo } from "./ebook";

export const STORE_LIMITS = {
  maxQty: 10,
  maxCartLines: 30,
  name: 80,
  address: 240,
  note: 300,
  reviewBody: 1500,
  category: 40,
  /** Narx chegarasi (Koreya woni, ₩). */
  maxPrice: 10_000_000,
  aiTurns: 12,
  aiText: 1000,
  chatBody: 1000,
  chatImageBytes: 5 * 1024 * 1024,
  chatPerMinute: 20,
} as const;

/** Janr tavsiyalari (admin boshqasini ham yozishi mumkin). */
export const STORE_CATEGORIES = ["Badiiy adabiyot", "O‘zbek adabiyoti", "Shaxsiy rivojlanish", "Biznes va moliya", "Psixologiya", "Tarix", "Bolalar uchun", "Diniy-ma’rifiy"] as const;

export const PAYMENT_METHODS = ["chat", "cash", "click", "payme", "uzum", "card"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  chat: "Chatda kelishiladi",
  cash: "Naqd (yetkazishda)",
  click: "Click",
  payme: "Payme",
  uzum: "Uzum",
  card: "Karta (yetkazishda)",
};

export const ORDER_STATUSES = ["new", "confirmed", "preparing", "shipped", "delivered", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  new: "Yangi",
  confirmed: "Qabul qilindi",
  preparing: "Tayyorlanmoqda",
  shipped: "Yuborildi",
  delivered: "Yetkazildi",
  cancelled: "Bekor qilindi",
};
/** Xaridor ko'radigan jarayon bosqichlari (ketma-ket). */
export const ORDER_PROGRESS = ["confirmed", "preparing", "shipped", "delivered"] as const;

/** O'zbekiston raqami: +998 va 9 raqam. */
/** Xalqaro raqam (E.164): O'zbekiston +998…, Koreya +82… va boshqalar. */
export const PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;

/**
 * Raqamni xalqaro ko'rinishga keltiradi: bo'shliq/chiziqlar olib tashlanadi; Koreya mahalliy raqami
 * (010-1234-5678) +821012345678 ga aylanadi; +82 (0)10… dagi ortiqcha 0 olib tashlanadi.
 */
export function normalizePhone(input: string): string {
  const compact = input.replace(/[\s().-]/g, "");
  if (/^00[1-9]/.test(compact)) return `+${compact.slice(2)}`;
  if (/^01\d{8,9}$/.test(compact)) return `+82${compact.slice(1)}`;
  return compact.replace(/^\+820(?=1)/, "+82");
}

/** Telegram: `@nom`, `nom` yoki t.me/nom havolasi → `nom` (5–32 belgi). Bo'sh — ko'rsatilmagan. */
export function normalizeTelegram(input: string): string {
  return input.trim().replace(/^https?:\/\/(www\.)?(t|telegram)\.me\//i, "").replace(/^@/, "").replace(/[/?#].*$/, "");
}
export const TELEGRAM_PATTERN = /^[A-Za-z0-9_]{5,32}$/;
/** Mijoz yaratadigan buyurtma raqami (idempotentlik kaliti). */
export const ORDER_ID_PATTERN = /^BI-[A-Z0-9]{6,32}$/;

const bookId = z.string().trim().min(1).max(96);

export const cartSchema = z.object({
  items: z
    .array(z.object({ bookId, qty: z.number().int().min(1).max(STORE_LIMITS.maxQty) }))
    .max(STORE_LIMITS.maxCartLines)
    .refine((items) => new Set(items.map((i) => i.bookId)).size === items.length, "Kitob takrorlanmasin."),
});
export type CartInput = z.infer<typeof cartSchema>;

export const placeOrderSchema = z.object({
  id: z.string().regex(ORDER_ID_PATTERN, "Buyurtma raqami noto‘g‘ri."),
  name: z.string().trim().min(2, "Ismingizni yozing.").max(STORE_LIMITS.name),
  phone: z
    .string()
    .transform(normalizePhone)
    .pipe(z.string().regex(PHONE_PATTERN, "Telefon +998… yoki +82… ko‘rinishida bo‘lsin.")),
  /** Ixtiyoriy: admin chatdan tashqarida ham bog'lana olishi uchun. */
  telegram: z
    .string()
    .transform(normalizeTelegram)
    .pipe(z.string().refine((v) => v === "" || TELEGRAM_PATTERN.test(v), "Telegram nomi: @nom (5–32 belgi: harf, raqam, _)."))
    .default(""),
  address: z.string().trim().min(8, "Manzilni to‘liqroq yozing.").max(STORE_LIMITS.address),
  note: z.string().trim().max(STORE_LIMITS.note).default(""),
  // To'lov ilovada emas: hisob raqamni admin chatda yuboradi. Eski mijozlar boshqa qiymat yuborishi mumkin.
  payment: z.enum(PAYMENT_METHODS).default("chat"),
});
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;

/** Do'kon hisobining yetkazib berish ma'lumotlari (buyurtma formasi oldindan to'ldiriladi). Bo'sh maydon — ko'rsatilmagan. */
export const storeProfileSchema = z.object({
  name: z.string().trim().max(STORE_LIMITS.name),
  phone: z
    .string()
    .trim()
    .transform((v) => (v ? normalizePhone(v) : ""))
    .pipe(z.string().refine((v) => v === "" || PHONE_PATTERN.test(v), "Telefon +998… yoki +82… ko‘rinishida bo‘lsin.")),
  telegram: z
    .string()
    .transform(normalizeTelegram)
    .pipe(z.string().refine((v) => v === "" || TELEGRAM_PATTERN.test(v), "Telegram nomi: @nom (5–32 belgi: harf, raqam, _).")),
  address: z.string().trim().max(STORE_LIMITS.address),
});
export type StoreProfile = z.infer<typeof storeProfileSchema>;

export const orderStatusSchema = z.object({ status: z.enum(ORDER_STATUSES) });
export type OrderStatusInput = z.infer<typeof orderStatusSchema>;

export const reviewSchema = z.object({
  rating: z.number().int().min(1, "Baho 1–5.").max(5, "Baho 1–5."),
  body: z.string().trim().max(STORE_LIMITS.reviewBody).default(""),
});
export type ReviewInput = z.infer<typeof reviewSchema>;

export const storeAiSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("chat"),
    messages: z
      .array(z.object({ role: z.enum(["user", "model"]), text: z.string().trim().min(1).max(STORE_LIMITS.aiText) }))
      .min(1)
      .max(STORE_LIMITS.aiTurns)
      .refine((t) => t[0].role === "user" && t[t.length - 1].role === "user", "Suhbat foydalanuvchidan boshlanadi va tugaydi."),
  }),
  z.object({ mode: z.literal("summary"), bookId }),
]);
export type StoreAiInput = z.infer<typeof storeAiSchema>;

/** Do'kon vitrinasidagi kitob. */
export type StoreBook = {
  id: string;
  title: string;
  author: string;
  summary: string;
  color: string;
  coverUrl: string | null;
  pages: number;
  price: number;
  category: string;
  /** Audiokitob ham bormi (Javonda tinglash mumkin). */
  hasAudio: boolean;
  rating: number;
  reviews: number;
  /** Elektron shakli: hamma boshlang'ich qismini o'qiy oladi; null — qo'yilmagan. */
  ebook: EbookInfo | null;
};

export type CartLine = { bookId: string; qty: number };

export type OrderLine = { bookId: string; title: string; qty: number; price: number };

export type StoreOrder = {
  id: string;
  /** Buyurtma egasi (xaridor). */
  userId: string;
  name: string;
  phone: string;
  /** Telegram nomi (@siz), bo'sh bo'lishi mumkin. */
  telegram: string;
  address: string;
  note: string;
  payment: PaymentMethod;
  status: OrderStatus;
  total: number;
  createdAt: string;
  lines: OrderLine[];
  /** Admin: o'qilmagan xaridor xabarlari (buyurtma yozishmasi). */
  adminUnread: number;
  /** Xaridor: o'qilmagan admin xabarlari va holat o'zgarishlari (buyurtma yozishmasi). */
  userUnread: number;
};

/** Xaridorning o'z bahosi (Hisobim → Savat → Baholar). */
export type MyReview = {
  bookId: string;
  title: string;
  author: string;
  coverUrl: string | null;
  rating: number;
  body: string;
  updatedAt: string;
};

export type BookReview = {
  id: number;
  userId: string;
  name: string;
  rating: number;
  body: string;
  updatedAt: string;
  mine: boolean;
};

export type ReviewSummary = { average: number; count: number; items: BookReview[] };

/** Narxlar Koreya wonida (₩), butun son: ₩59,000. */
export const formatPrice = (value: number) => `₩${Math.round(value).toLocaleString("en-US")}`;

// ── Do'kon chati ────────────────────────────────────────────────────

export const storeMessageSchema = z.object({
  body: z.string().trim().min(1, "Xabar bo‘sh bo‘lmasin.").max(STORE_LIMITS.chatBody, "Xabar 1000 belgidan oshmasin."),
  /** Savol qaysi kitob haqida (ixtiyoriy). Buyurtma yozishmasida bo'sh. */
  bookId: bookId.optional(),
  /** Buyurtma yozishmasi (ixtiyoriy): bo'lsa, xabar shu buyurtmaning o'z chatiga tushadi. */
  orderId: z.string().trim().min(1).max(64).optional(),
});
export type StoreMessageInput = z.infer<typeof storeMessageSchema>;

export const STORE_CHAT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type StoreMessage = {
  id: number;
  sender: "user" | "admin";
  /** `status` — buyurtma holati o'zgarganda tizim xabari. */
  kind: "text" | "order" | "image" | "status";
  body: string;
  orderId: string | null;
  bookId: string | null;
  bookTitle: string | null;
  imageUrl: string | null;
  createdAt: string;
};

/** Xaridorning yozishmasi. `unread` — o'qilmagan admin javoblari (ochilganda nolga tushadi). */
export type StoreChat = { messages: StoreMessage[]; unread: number; /** Buyurtma yozishmasi bo'lsa — buyurtmaning joriy holati. */ order: StoreOrder | null };

/**
 * Xaridorning barcha yozishmalari: «Umumiy savollar» (`kind: "general"`) va har bir buyurtma alohida (`kind: "order"`).
 * `unread` — shu yozishmadagi o'qilmagan admin javoblari va holat xabarlari.
 */
export type StoreInboxItem = {
  key: string;
  kind: "general" | "order";
  order: StoreOrder | null;
  preview: string;
  lastAt: string | null;
  unread: number;
};
export type StoreInbox = { items: StoreInboxItem[]; unread: number };

/** Admin ro'yxati: har xaridorga bitta qator. */
export type StoreThread = {
  userId: string;
  name: string;
  lastMessageAt: string;
  lastPreview: string;
  unread: number;
};

export type AdminStoreChat = { thread: StoreThread; messages: StoreMessage[]; order: StoreOrder | null };
