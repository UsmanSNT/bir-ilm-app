/**
 * Ilovadan Telegram bilan kirish sahifasi (telefon brauzerida ochiladi).
 *
 * Telegram Login Widget faqat bot domenidagi (birilm.uz) sahifada ishlaydi, shuning
 * uchun ilova shu sahifani ochadi; widget tasdiqlagach callback ilovaga qaytaradi.
 */
import { authPage, backToApp, beginFlow } from "@/server/auth/login-flow";
import { loginConfig } from "@/server/auth/providers";

export async function GET(request: Request) {
  const config = loginConfig(request);
  if (!config.telegram) return backToApp(request, "error", "Telegram orqali kirish hali sozlanmagan.");

  const headers = new Headers();
  const flowError = await beginFlow(request, headers);
  if (flowError) return authPage("Kirib bo'lmadi", `<p>${flowError}</p>`);

  const widget = `<script async src="https://telegram.org/js/telegram-widget.js?22" data-telegram-login="${config.telegram.username}" data-size="large" data-radius="10" data-auth-url="${config.publicUrl}/api/auth/telegram/callback"></script>`;
  return authPage("Telegram bilan kirish", `<p>Tugmani bosing va Telegram'da tasdiqlang. Keyin Bir Ilm ilovasiga qaytasiz.</p>${widget}`, headers);
}
