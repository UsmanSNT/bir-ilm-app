"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { LOGIN_RESULT_EVENT, nativeAuth } from "@/lib/api/native-auth";
import type { Viewer } from "@/shared/contract";
import PasswordAuth from "./password-auth";

function TelegramButton({ bot }: { bot: string }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    // Telegram'ning rasmiy vidjeti: bosilganda Telegram tasdiqlaydi va /api/auth/telegram/callback ga qaytaradi.
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", bot);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "10");
    script.setAttribute("data-auth-url", `${location.origin}/api/auth/telegram/callback`);
    el.appendChild(script);
    return () => {
      el.innerHTML = "";
    };
  }, [bot]);
  return <div ref={host} className="login-telegram" />;
}

function LoginOptions({ viewer }: { viewer: Viewer }) {
  const { google, telegramBot } = viewer.loginProviders;
  const available = google || telegramBot;
  const native = nativeAuth();
  const [busy, setBusy] = useState(false);

  // Ilovada kirish brauzerda tugaydi; xato bo'lsa ilova shu hodisani yuboradi.
  useEffect(() => {
    const onResult = (event: Event) => {
      setBusy(false);
      toast.error(String((event as CustomEvent<string>).detail));
    };
    window.addEventListener(LOGIN_RESULT_EVENT, onResult);
    return () => window.removeEventListener(LOGIN_RESULT_EVENT, onResult);
  }, []);

  const startNative = async (provider: "google" | "telegram") => {
    if (!native) return;
    setBusy(true);
    try {
      await native.login(provider);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kirishni boshlab bo'lmadi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {available && (
        <div className="login-buttons">
          {google && (
            <a
              className="login-google"
              href="/api/auth/google"
              aria-disabled={busy}
              onClick={native ? (e) => { e.preventDefault(); void startNative("google"); } : undefined}
            >
              <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.6 13.2l7.8 6.1C12.3 13.6 17.7 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z" />
                <path fill="#FBBC05" d="M10.4 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6.1C1 16.5 0 20.1 0 24s1 7.5 2.6 10.8l7.8-6.1z" />
                <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.7-4.1-13.6-9.8l-7.8 6.1C6.6 42.6 14.6 48 24 48z" />
              </svg>
              Google bilan kirish
            </a>
          )}
          {telegramBot && (native ? (
            <button type="button" className="login-telegram-native" disabled={busy} onClick={() => void startNative("telegram")}>
              <Send size={17} /> Telegram bilan kirish
            </button>
          ) : <TelegramButton bot={telegramBot} />)}
        </div>
      )}
      {available && <p className="login-or"><span>yoki</span></p>}
      <PasswordAuth canReset={viewer.loginProviders.passwordReset} />
    </>
  );
}

/** Kirish oynasi — barcha joylarda yagona. Asosiy sahifa tarkibiga aralashmaydi; ochiladi/yopiladi. */
export function LoginDialog({ viewer, open, onOpenChange }: { viewer: Viewer; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="auth-dialog">
        <DialogTitle className="login-page-title">Kirish</DialogTitle>
        <DialogDescription className="sr-only">Google, Telegram yoki email bilan kiring.</DialogDescription>
        <LoginOptions viewer={viewer} />
      </DialogContent>
    </Dialog>
  );
}
