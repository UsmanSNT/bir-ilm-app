/**
 * Ilovadagi kirish ko'prigi.
 *
 * Umumiy UI (`app/`) webda ham, ilovada ham bir xil. Webda kirish cookie va
 * yo'naltirishlar bilan ishlaydi; ilovada esa token telefon xotirasida saqlanadi
 * va Google/Telegram telefon brauzerida ochiladi. Ilova qobig'i (`mobile/`) shu
 * yerga o'z amalga oshirishini ro'yxatdan o'tkazadi; webda bu `null`.
 */
export type NativeAuth = {
  /** Google/Telegram kirishini telefon brauzerida boshlaydi. */
  login(provider: "google" | "telegram"): Promise<void>;
  /** Kod bilan kirishdan keyin olingan tokenni saqlaydi va ilovani yangilaydi. */
  adoptToken(token: string): Promise<void>;
  /** Chiqish: saqlangan tokenni o'chiradi — keyingi ochilishda yangi mehmon. */
  logout(): Promise<void>;
};

/** Ilovada kirish muvaffaqiyatsiz tugasa UI'ga shu hodisa (`detail` — xato matni) keladi. */
export const LOGIN_RESULT_EVENT = "bir-ilm:login-result";

let current: NativeAuth | null = null;

export function registerNativeAuth(auth: NativeAuth): void {
  current = auth;
}

export function nativeAuth(): NativeAuth | null {
  return current;
}
