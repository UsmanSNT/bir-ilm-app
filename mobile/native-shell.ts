/**
 * Native qobiq bilan bog'lanish.
 *
 * Bu yerda UI o'zgartirilmaydi — faqat telefonning o'ziga xos xatti-harakati
 * to'g'rilanadi: status bar, splash ekran, Android "orqaga" tugmasi va
 * klaviatura. Webda ishga tushirilganda hamma narsa jim o'tkazib yuboriladi.
 */
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Keyboard, KeyboardResize } from "@capacitor/keyboard";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";

/**
 * Android "orqaga" tugmasi bosilganda tarqatiladi.
 *
 * UI shu hodisani tinglab, o'z ichki navigatsiyasini orqaga qaytarishi va
 * `event.preventDefault()` chaqirib, ilovadan chiqishni to'xtatishi mumkin:
 *
 *   window.addEventListener("bir-ilm:back", (event) => {
 *     if (screen !== "home") { event.preventDefault(); setScreen("home"); }
 *   });
 */
export const BACK_EVENT = "bir-ilm:back";

/** Ikkinchi bosishgacha beriladigan vaqt (ms). */
const EXIT_CONFIRM_WINDOW = 2000;

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

export async function setupNativeShell(): Promise<void> {
  if (!isNative()) return;

  await Promise.all([setupStatusBar(), setupKeyboard()]);
  setupBackButton();

  // Splash'ni UI tayyor bo'lgandan keyin yopamiz, aks holda foydalanuvchi
  // bir lahza bo'sh ekranni ko'radi.
  await SplashScreen.hide();
}

async function setupStatusBar(): Promise<void> {
  try {
    // Status bar ilova foni bilan qo'shilib ketsin.
    await StatusBar.setStyle({ style: Style.Light });
    if (Capacitor.getPlatform() === "android") {
      await StatusBar.setBackgroundColor({ color: "#f4f7f5" });
    }
  } catch {
    // Ba'zi qurilmalarda status bar boshqarilmaydi — bu jiddiy emas.
  }
}

async function setupKeyboard(): Promise<void> {
  try {
    // Klaviatura ochilganda sahifani siljitmasin: UI o'zi joylashadi.
    await Keyboard.setResizeMode({ mode: KeyboardResize.Native });
  } catch {
    // iOS'da yoki plagin mavjud bo'lmaganda e'tiborsiz qoldiramiz.
  }
}

function setupBackButton(): void {
  let exitArmed = false;
  let exitTimer: ReturnType<typeof setTimeout> | undefined;

  void App.addListener("backButton", ({ canGoBack }) => {
    // Avval UI ga o'z navigatsiyasini orqaga qaytarish imkonini beramiz.
    const event = new CustomEvent(BACK_EVENT, { cancelable: true });
    const handled = !window.dispatchEvent(event);
    if (handled) {
      exitArmed = false;
      return;
    }

    if (canGoBack) {
      window.history.back();
      return;
    }

    // Bosh ekranda: tasodifan chiqib ketmasligi uchun ikki marta bosish kerak.
    if (exitArmed) {
      void App.exitApp();
      return;
    }

    exitArmed = true;
    clearTimeout(exitTimer);
    exitTimer = setTimeout(() => {
      exitArmed = false;
    }, EXIT_CONFIRM_WINDOW);
  });
}
