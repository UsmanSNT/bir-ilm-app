/**
 * Native tokenni saqlash.
 *
 * `localStorage` WebView tozalanganda yo'qoladi. Capacitor Preferences esa
 * iOS'da UserDefaults, Android'da SharedPreferences ga yozadi — ya'ni token
 * ilova qayta ishga tushganda ham saqlanib qoladi.
 *
 * Eslatma: Preferences ma'lumotni SHIFRLAMAYDI. Bu mehmon sessiyasi tokeni
 * uchun yetarli, lekin keyinchalik haqiqiy hisob qo'shilsa, uni Keychain /
 * EncryptedSharedPreferences plaginiga o'tkazish kerak — `TokenStorage`
 * interfeysi o'zgarmaydi.
 */
import { Preferences } from "@capacitor/preferences";
import { TOKEN_STORAGE_KEY, type TokenStorage } from "@/lib/api/config";

export function capacitorStorage(): TokenStorage {
  return {
    get: async () => {
      const { value } = await Preferences.get({ key: TOKEN_STORAGE_KEY });
      return value ?? null;
    },
    set: async (token) => {
      await Preferences.set({ key: TOKEN_STORAGE_KEY, value: token });
    },
    clear: async () => {
      await Preferences.remove({ key: TOKEN_STORAGE_KEY });
    },
  };
}
