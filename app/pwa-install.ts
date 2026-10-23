"use client";

/**
 * Ilovani bosh ekranga o'rnatish holati (PWA).
 *
 * Chrome/Edge (Android, kompyuter) o'rnatishga tayyor bo'lganda `beforeinstallprompt` yuboradi — uni ushlab turamiz va
 * o'zimizning tugmadan chaqiramiz. Safari (iPhone/iPad) bunday hodisa bermaydi: qo'lda qo'shish yo'li ko'rsatiladi.
 * Hodisa kelmagan brauzerda (yoki ilova allaqachon o'rnatilgan bo'lsa) tugma ko'rinmaydi.
 */
import { useSyncExternalStore } from "react";

type InstallChoice = { outcome: "accepted" | "dismissed"; platform: string };
type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<InstallChoice> };

/** `prompt` — brauzer o'zi o'rnatadi; `ios` — Safari'da qo'lda; `installed` — ilova sifatida ochilgan; `unavailable` — hozir taklif yo'q. */
export type InstallState = "prompt" | "ios" | "installed" | "unavailable";

const DISMISS_KEY = "bir-install-dismissed";
/** Kartani yopgandan keyin necha kun ko'rsatilmaydi. */
const DISMISS_DAYS = 7;

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
let helpOpen = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

const standaloneQueries = ["standalone", "fullscreen", "minimal-ui"].map((mode) => `(display-mode: ${mode})`);

function isStandalone(): boolean {
  return standaloneQueries.some((query) => window.matchMedia(query).matches) || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function dismissedRecently(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return at > 0 && Date.now() - at < DISMISS_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

function currentState(): InstallState {
  if (installed || isStandalone()) return "installed";
  if (deferred) return "prompt";
  return isIos() ? "ios" : "unavailable";
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Brauzerning o'z kichik taklifi o'rniga o'zimizning tugma ko'rsatiladi.
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    deferred = null;
    helpOpen = false;
    emit();
  });
  // Ilova o'rnatilib, shu oynaning o'zida ochilganda ham holat yangilansin.
  for (const query of standaloneQueries) window.matchMedia(query).addEventListener("change", emit);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** O'rnatish taklif qilinadigan holatmi (menyu bandi uchun). */
export function useInstallAvailable(): boolean {
  return useSyncExternalStore(subscribe, () => ["prompt", "ios"].includes(currentState()), () => false);
}

/** Bosh sahifadagi karta: taklif bor va foydalanuvchi yaqinda yopmagan. */
export function useInstallCardVisible(): boolean {
  return useSyncExternalStore(subscribe, () => ["prompt", "ios"].includes(currentState()) && !dismissedRecently(), () => false);
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(subscribe, currentState, () => "unavailable");
}

/** iPhone/iPad ko'rsatmasi oynasi ochiqmi. */
export function useInstallHelpOpen(): boolean {
  return useSyncExternalStore(subscribe, () => helpOpen, () => false);
}

export function setInstallHelpOpen(open: boolean) {
  helpOpen = open;
  emit();
}

export function dismissInstallCard() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // Xususiy rejim: karta shu sessiya davomida yopilmaydi, boshqa narsa buzilmaydi.
  }
  emit();
}

/** Tugma bosilganda: Chrome — o'rnatish oynasini ochadi; Safari — qo'lda qo'shish ko'rsatmasini. */
export async function requestInstall(): Promise<void> {
  if (deferred) {
    // Hodisa faqat bir marta ishlatiladi; rad etilsa brauzer keyinroq yangisini yuboradi.
    const event = deferred;
    deferred = null;
    emit();
    await event.prompt();
    await event.userChoice;
    return;
  }
  if (currentState() === "ios") setInstallHelpOpen(true);
}
