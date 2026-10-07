/**
 * Adminlarga xabar: yangi buyurtma. Admin Telegram bilan kirgan bo'lsa — bot orqali, emaili bo'lsa —
 * email orqali (sozlangan kanallar bo'yicha; sozlanmagani jim o'tkazib yuboriladi). Ilova ichida esa
 * admin ekranidagi nishon va xabar ishlaydi (lib/api/admin-attention.ts).
 */
import { eq, inArray } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { formatPrice, PAYMENT_LABELS, type StoreOrder } from "@/shared/contract";
import { canSendEmail, canSendTelegram, sendEmail, sendTelegram } from "./notify";

const { users, authAccounts } = schema;

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function orderAlertText(order: StoreOrder): string {
  const lines = order.lines.map((l) => `• ${l.title} ×${l.qty}`).join("\n");
  const contact = [order.phone, order.telegram ? `@${order.telegram}` : ""].filter(Boolean).join(" · ");
  return `🛒 Yangi buyurtma № ${order.id}\n${order.name} — ${contact}\n${order.address}\n\n${lines}\n\nJami: ${formatPrice(order.total)} · ${PAYMENT_LABELS[order.payment]}`;
}

/** Barcha adminlarga yuboradi. Xato bo'lsa buyurtmaga ta'sir qilmaydi; nechta kanalga ketgani qaytadi. */
export async function alertAdminsOfOrder(db: Database, order: StoreOrder): Promise<number> {
  if (!canSendEmail() && !canSendTelegram()) return 0;
  const admins = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
  if (!admins.length) return 0;
  const accounts = await db
    .select({ provider: authAccounts.provider, subject: authAccounts.subject, email: authAccounts.email })
    .from(authAccounts)
    .where(inArray(authAccounts.userId, admins.map((a) => a.id)));

  const text = orderAlertText(order);
  const html = `<p>${escapeHtml(text).replace(/\n/g, "<br>")}</p>`;
  const telegramIds = new Set(accounts.filter((a) => a.provider === "telegram").map((a) => a.subject));
  const emails = new Set(accounts.map((a) => a.email).filter((e): e is string => Boolean(e)));
  const results = await Promise.all([
    ...[...telegramIds].map((chat) => sendTelegram(chat, text)),
    ...[...emails].map((to) => sendEmail(to, `Bir Ilm: yangi buyurtma ${order.id}`, text, html)),
  ]);
  return results.filter(Boolean).length;
}
