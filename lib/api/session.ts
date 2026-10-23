"use client";

import { nativeAuth } from "./native-auth";

/** Hisobdan chiqadi: sessiya o'chadi va bosh sahifaga qaytadi. Profil va Hisobim bir xil amaldan foydalanadi. */
export async function signOutViewer(): Promise<void> {
  if (!window.confirm("Hisobdan chiqasizmi? Qayta kirish uchun email va parol, Google yoki Telegram kerak bo‘ladi.")) return;
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
  await nativeAuth()?.logout();
  window.location.assign("/");
}
