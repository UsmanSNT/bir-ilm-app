import { env } from "cloudflare:workers";

/** Email yuborish (Resend API). Sozlanmagan bo'lsa false. */
export async function sendEmail(to: string, subject: string, text: string, html: string) {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, text, html }),
      signal: AbortSignal.timeout(10000),
    });
    return res.ok;
  } catch { return false; }
}

/** Telegram bot orqali xabar (foydalanuvchi widgetda botga yozishga ruxsat bergan bo'lishi kerak). */
export async function sendTelegram(chatId: string, text: string) {
  if (!env.TELEGRAM_BOT_TOKEN || !/^\d{1,20}$/.test(chatId)) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10000),
    });
    return res.ok;
  } catch { return false; }
}

export const canEmail = () => !!(env.RESEND_API_KEY && env.MAIL_FROM);
export const canTelegram = () => !!env.TELEGRAM_BOT_TOKEN;
