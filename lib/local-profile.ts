/**
 * Qurilmada saqlanadigan Bir Ilm holati (localStorage) kalitlari va hisobdan chiqishda shaxsiy ma'lumotni tozalash.
 * Ism va «Muhim fikr» hisobda saqlanadi — qayta kirganda serverdan tiklanadi, shuning uchun chiqishda qurilmadan o'chadi.
 */
export const STATE_KEY = "bir-ilm-v2";
export const LEGACY_STATE_KEY = "bir-ilm-v1";
export const IDENTITY_KEY = "bir-ilm-identity";
/** Hisobga kirmaganlarga ko'rsatiladigan ism. */
export const GUEST_NAME = "Kitobxon";

export function forgetLocalProfile(): void {
  try {
    for (const key of [STATE_KEY, LEGACY_STATE_KEY]) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const state = JSON.parse(raw) as Record<string, unknown>;
      localStorage.setItem(key, JSON.stringify({ ...state, name: GUEST_NAME, note: "" }));
    }
    localStorage.setItem(IDENTITY_KEY, JSON.stringify({ signedIn: false }));
  } catch {
    // Xotira yopiq yoki buzilgan: sahifa baribir mehmonga ism ko'rsatmaydi.
  }
}
