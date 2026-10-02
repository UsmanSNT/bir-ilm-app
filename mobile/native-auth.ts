/**
 * Ilovada Google/Telegram bilan kirish.
 *
 * 1. Tasodifiy `verifier` yaratiladi va telefon xotirasida saqlanadi (ilova brauzer
 *    ochiq turganda yopilib qolsa ham yo'qolmasin).
 * 2. Serverga faqat uning SHA-256 xeshi yuboriladi, javobdagi havola ilova ichidagi
 *    brauzer oynasida (Chrome Custom Tabs / Safari) ochiladi.
 * 3. Kirish tugagach sahifa `uz.birilm.app://auth?code=…` ni ochadi — Android/iOS
 *    ilovani qaytaradi, biz `code` + `verifier` bilan tokenni olamiz.
 */
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Preferences } from "@capacitor/preferences";
import { LOGIN_RESULT_EVENT, registerNativeAuth } from "@/lib/api/native-auth";
import type { TokenStorage } from "@/lib/api/config";

const VERIFIER_KEY = "bir_ilm_login_verifier";
const RETURN_PREFIX = "uz.birilm.app://auth";

type Envelope<T> = { data?: T; error?: { message?: string } };

async function post<T>(path: string, body: unknown): Promise<T> {
  // `fetch` api-bridge orqali serverga Bearer token bilan ketadi.
  const res = await fetch(`/api/v1${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await res.json().catch(() => ({}))) as Envelope<T>;
  if (!res.ok || payload.data === undefined) throw new Error(payload.error?.message ?? "So'rov bajarilmadi.");
  return payload.data;
}

const hex = (bytes: ArrayBuffer | Uint8Array) =>
  Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");

async function sha256(text: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

function announce(message: string) {
  window.dispatchEvent(new CustomEvent(LOGIN_RESULT_EVENT, { detail: message }));
}

export function setupNativeAuth(storage: TokenStorage): void {
  const adoptToken = async (token: string) => {
    await storage.set(token);
    // Hamma bo'lim yangi akkaunt bilan qayta yuklansin.
    window.location.replace("/?login=ok");
  };

  async function handleReturn(url: string) {
    if (!url.startsWith(RETURN_PREFIX)) return;
    void Browser.close().catch(() => {});
    const params = new URL(url.replace(RETURN_PREFIX, "https://return.local/")).searchParams;
    const error = params.get("error");
    const code = params.get("code");
    const { value: verifier } = await Preferences.get({ key: VERIFIER_KEY });
    await Preferences.remove({ key: VERIFIER_KEY });
    if (error || !code || !verifier) {
      announce(error ?? "Kirish tugallanmadi. Qayta urinib ko'ring.");
      return;
    }
    try {
      const session = await post<{ token: string | null }>("/auth/app-login/redeem", { code, verifier });
      if (!session.token) throw new Error("Token kelmadi.");
      await adoptToken(session.token);
    } catch (e) {
      announce(e instanceof Error ? e.message : "Kirib bo'lmadi.");
    }
  }

  // Ilova ochiq turganda qaytish (asosiy holat) va ilova yopilib qolgan bo'lsa — ochilish havolasi.
  void App.addListener("appUrlOpen", ({ url }) => void handleReturn(url));
  void App.getLaunchUrl().then((launch) => { if (launch?.url) void handleReturn(launch.url); }).catch(() => {});

  registerNativeAuth({
    async login(provider) {
      const verifier = hex(crypto.getRandomValues(new Uint8Array(32)));
      await Preferences.set({ key: VERIFIER_KEY, value: verifier });
      const { url } = await post<{ url: string }>("/auth/app-login", { provider, challenge: await sha256(verifier) });
      await Browser.open({ url, presentationStyle: "popover" });
    },
    adoptToken,
    async logout() {
      await storage.clear();
    },
  });
}
