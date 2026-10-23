/**
 * Native qobiq uchun tarmoq ko'prigi.
 *
 * Muammo: UI `fetch("/api/social")` kabi NISBIY manzillarni ishlatadi. Webda
 * bu o'z serveriga ketadi, lekin native qobiqda sahifa `https://localhost`
 * dan ochiladi va u yerda server yo'q. Bundan tashqari, cookie cross-site
 * yuborilmaydi, shuning uchun eski API foydalanuvchini tanimay qolardi.
 *
 * Yechim: `fetch` ni o'rab olamiz va har bir `/api/...` so'rovini
 *   1) `NEXT_PUBLIC_API_BASE_URL` dagi serverga yo'naltiramiz,
 *   2) `Authorization: Bearer <token>` bilan imzolaymiz.
 *
 * Shu tufayli MAVJUD UI kodi bir qator ham o'zgartirilmasdan ilovada ishlaydi.
 * UI keyinchalik `lib/api` klientiga o'tkazilganda bu ko'prik ortiqcha bo'ladi
 * va uni olib tashlash mumkin — klient allaqachon to'liq manzil quradi.
 */
import { Capacitor } from "@capacitor/core";
import { apiClient } from "@/lib/api";
import { resolveBaseUrl } from "@/lib/api/config";
import { CLIENT_PLATFORM_HEADER } from "@/shared/contract";
import { capacitorStorage } from "./native-storage";

export function installApiBridge(): void {
  const baseUrl = resolveBaseUrl();
  const storage = capacitorStorage();
  const platform = Capacitor.getPlatform();
  const originalFetch = globalThis.fetch.bind(globalThis);

  // Bir vaqtda bir nechta so'rov kelsa ham sessiya bir marta ochilsin.
  let sessionPromise: Promise<string | null> | null = null;

  async function currentToken(): Promise<string | null> {
    const stored = await storage.get();
    if (stored) return stored;

    sessionPromise ??= apiClient()
      .ensureSession()
      .then(async (session) => session.token ?? (await storage.get()))
      .catch(() => null);

    return sessionPromise;
  }

  globalThis.fetch = async (input, init) => {
    const request = new Request(input as RequestInfo, init);
    const url = new URL(request.url, globalThis.location.href);

    // Faqat o'z API'imizga ketayotgan so'rovlarni ushlaymiz.
    const isOwnApi = url.origin === globalThis.location.origin && url.pathname.startsWith("/api/");
    if (!isOwnApi) return originalFetch(request);

    const headers = new Headers(request.headers);
    headers.set(CLIENT_PLATFORM_HEADER, platform);

    const token = await currentToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);

    // GET va HEAD da tana bo'lmaydi; qolganlarida uni bir marta o'qib olamiz.
    const body =
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : await request.arrayBuffer();

    return originalFetch(`${baseUrl}${url.pathname}${url.search}`, {
      method: request.method,
      headers,
      body,
      // Cookie cross-site baribir yuborilmaydi — shaxsni token belgilaydi.
      credentials: "omit",
    });
  };
}
