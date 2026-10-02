import type { CapacitorConfig } from "@capacitor/cli";
import { KeyboardResize } from "@capacitor/keyboard";

/**
 * Android va iOS qobig'i sozlamasi.
 *
 * Qobiq `mobile/dist` dagi statik fayllarni telefon ichiga joylaydi va
 * `NEXT_PUBLIC_API_BASE_URL` da ko'rsatilgan serverning `/api/v1` iga
 * murojaat qiladi. Ya'ni web, Android va iOS bitta backend va bitta
 * ma'lumotlar bazasi bilan ishlaydi.
 */
const config: CapacitorConfig = {
  appId: "uz.birilm.app",
  appName: "Bir Ilm",
  webDir: "mobile/dist",

  // Ilova ichida fayllar `https://localhost` dan ochiladi. Bu `capacitor://`
  // sxemasidan afzal: `Secure Context` talab qiladigan brauzer API'lari
  // (crypto.subtle, clipboard va h.k.) ishlaydi va CORS oddiyroq bo'ladi.
  android: {
    // Ishlab chiqarishda `false` — faqat HTTPS orqali so'rov yuboriladi.
    allowMixedContent: false,
  },
  ios: {
    contentInset: "always",
  },
  server: {
    androidScheme: "https",
    iosScheme: "https",
  },

  plugins: {
    SplashScreen: {
      // UI tayyor bo'lgach `SplashScreen.hide()` chaqiriladi
      // (mobile/native-shell.ts), shuning uchun avtomatik yopilmaydi.
      launchAutoHide: false,
      backgroundColor: "#f4f7f5",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#f4f7f5",
      // Kontent status bar ostiga chiqmasin — joylashuvni CSS hal qiladi.
      overlaysWebView: false,
    },
    Keyboard: {
      // Klaviatura ochilganda WebView'ni native tarzda kichraytiradi.
      resize: KeyboardResize.Native,
    },
  },
};

export default config;
