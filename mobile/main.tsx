/**
 * Android / iOS qobig'ining kirish nuqtasi.
 *
 * MUHIM: bu yerda UI qayta yozilmaydi. `app/page.tsx` — webdagi AYNAN o'sha
 * sahifa — to'g'ridan-to'g'ri render qilinadi. Shu sababli mobil ko'rinish
 * ilovaga hech qanday o'zgarishsiz chiqadi, va UI'ga kiritilgan har qanday
 * tuzatish ikkala platformaga birdan tegadi.
 *
 * Bu fayl faqat uchta narsani qiladi:
 *   1. `app/layout.tsx` qiladigan ishni takrorlaydi (CSS va ildiz element).
 *   2. Tarmoq so'rovlarini serverga yo'naltiradi va token bilan imzolaydi.
 *   3. Native qobiqni sozlaydi (status bar, orqaga tugmasi, splash).
 */
import { createRoot } from "react-dom/client";

import "./entry.css";

import Page from "@/app/page";
import { configureApiClient } from "@/lib/api";
import { installApiBridge } from "./api-bridge";
import { capacitorStorage } from "./native-storage";
import { isNative, setupNativeShell } from "./native-shell";

const container = document.getElementById("root");
if (!container) throw new Error("#root elementi topilmadi.");

if (isNative()) {
  // Umumiy API klientini tokenni xavfsiz saqlovga yozadigan qilib sozlaymiz.
  // Bu birinchi bo'lishi kerak: ko'prik ham, UI ham shu nusxadan foydalanadi.
  configureApiClient({ storage: capacitorStorage() });

  // Ko'prikni render'dan OLDIN o'rnatamiz, aks holda komponentlar
  // ulanishida yuboriladigan birinchi so'rovlar ushlanmay qoladi.
  installApiBridge();
}

createRoot(container).render(<Page />);

// Render boshlangandan keyin qobiqni sozlaymiz, shunda splash ekran
// bo'sh sahifa ustida emas, tayyor UI ustida yopiladi.
void setupNativeShell();
