/** Telegram Login Widget'dan qaytish: imzoni bot tokeni bilan tekshiradi va kiritadi. */
import { backToApp, finishLogin } from "@/server/auth/login-flow";
import { loginConfig, telegramProfile } from "@/server/auth/providers";

export async function GET(request: Request) {
  const config = loginConfig(request);
  if (!config.telegram) return backToApp(request, "error", "Telegram orqali kirish hali sozlanmagan.");
  const params = new URL(request.url).searchParams;
  return finishLogin(request, () => telegramProfile(config.telegram!.token, params));
}
