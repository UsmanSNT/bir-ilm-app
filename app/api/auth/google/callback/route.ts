/** Google'dan qaytish: `state`ni tekshiradi, kodni profilga almashtiradi va kiritadi. */
import { OAUTH_STATE_COOKIE, backToApp, finishLogin, readCookie } from "@/server/auth/login-flow";
import { LoginError, googleProfile, loginConfig } from "@/server/auth/providers";

export async function GET(request: Request) {
  const config = loginConfig(request);
  const url = new URL(request.url);
  if (url.searchParams.get("error")) return backToApp(request, "error", "Google orqali kirish bekor qilindi.");
  if (!config.google) return backToApp(request, "error", "Google orqali kirish hali sozlanmagan.");

  return finishLogin(request, async () => {
    const state = url.searchParams.get("state");
    // Boshqa sayt foydalanuvchini o'z Google hisobi bilan "kiritib qo'yishi"ning oldini oladi.
    if (!state || state !== readCookie(request, OAUTH_STATE_COOKIE)) {
      throw new LoginError("Kirish so'rovi eskirgan. Qayta urinib ko'ring.");
    }
    const code = url.searchParams.get("code");
    if (!code) throw new LoginError("Google kod yubormadi.");
    return googleProfile(config.google!, code, `${config.publicUrl}/api/auth/google/callback`);
  });
}
