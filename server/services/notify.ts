/**
 * Tashqi xabar kanallari (parolni tiklash havolasi uchun).
 *   RESEND_API_KEY, MAIL_FROM  — email (resend.com); MAIL_FROM masalan "Bir Ilm <noreply@birilm.uz>"
 *   TELEGRAM_BOT_TOKEN         — foydalanuvchi Telegram bilan kirgan bo'lsa, bot orqali ham yuboriladi
 * Sozlanmagan kanal jim o'tkazib yuboriladi (false).
 */
const TIMEOUT_MS = 10_000;

export const canSendEmail = () => Boolean(process.env.RESEND_API_KEY?.trim() && process.env.MAIL_FROM?.trim());
export const canSendTelegram = () => Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim());

export async function sendEmail(to: string, subject: string, text: string, html: string): Promise<boolean> {
  if (!canSendEmail()) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.MAIL_FROM!.trim(), to: [to], subject, text, html }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) console.error("[notify] email yuborilmadi:", res.status);
    return res.ok;
  } catch (error) {
    console.error("[notify] email xatosi:", (error as Error).message);
    return false;
  }
}

export async function sendTelegram(chatId: string, text: string): Promise<boolean> {
  if (!canSendTelegram() || !/^\d{1,20}$/.test(chatId)) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN!.trim()}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Tiklash havolasini mavjud kanallar orqali yuboradi. Kamida bittasi ketgan bo'lsa true. */
export async function sendPasswordReset(target: { email: string; name: string; telegramChatId: string | null }, link: string, minutes: number): Promise<boolean> {
  const text = `Assalomu alaykum, ${target.name || "kitobxon"}!\n\nBir Ilm parolini tiklash uchun havola (${minutes} daqiqa amal qiladi):\n${link}\n\nAgar buni siz so'ramagan bo'lsangiz, xabarni e'tiborsiz qoldiring — parolingiz o'zgarmaydi.`;
  const html = `<p>Assalomu alaykum, ${escapeHtml(target.name || "kitobxon")}!</p><p>Bir Ilm parolini tiklash uchun quyidagi tugmani bosing (${minutes} daqiqa amal qiladi):</p><p><a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 22px;border-radius:999px;background:#1e2f6e;color:#fff;text-decoration:none;font-weight:700">Yangi parol o‘rnatish</a></p><p style="color:#7b7789">Agar buni siz so‘ramagan bo‘lsangiz, xabarni e’tiborsiz qoldiring — parolingiz o‘zgarmaydi.</p>`;
  const [mail, telegram] = await Promise.all([
    sendEmail(target.email, "Bir Ilm: parolni tiklash", text, html),
    target.telegramChatId ? sendTelegram(target.telegramChatId, text) : Promise.resolve(false),
  ]);
  return mail || telegram;
}
