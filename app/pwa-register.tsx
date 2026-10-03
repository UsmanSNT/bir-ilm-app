"use client";

import { useEffect } from "react";

/** Veb-ilova sifatida o'rnatish uchun service worker'ni ro'yxatdan o'tkazadi (keshlamaydi). */
export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}
