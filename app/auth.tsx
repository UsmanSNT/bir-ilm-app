"use client";

import { createContext, FormEvent, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Eye, EyeOff, KeyRound, LogIn, MailCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export type AuthUser = { id: string; login: string | null; name: string; email?: string | null; providers?: string[] };
type Providers = { google: boolean; telegram: string | null };
type Mode = "login" | "register" | "forgot" | "reset";
type FormMode = "login" | "register";
type AuthApi = {
  user: AuthUser | null;
  ready: boolean;
  /** Kirgan bo'lsa `action`ni bajaradi; aks holda login oynasini ochadi va kirgach bajaradi. */
  requireAuth: (action?: () => void) => boolean;
  openAuth: (mode?: Mode) => void;
  logout: () => Promise<void>;
  rename: (name: string) => void;
};

const AuthContext = createContext<AuthApi | null>(null);
export const AUTH_CHANGED = "bir-auth-changed";
export const AUTH_REQUIRED = "bir-auth-required";

/** Server 401 qaytarsa login oynasini ochish uchun. */
export function signalAuthRequired() {
  window.dispatchEvent(new Event(AUTH_REQUIRED));
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw Error("useAuth AuthProvider ichida ishlatilishi kerak");
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode | null>(null);
  const [resetToken, setResetToken] = useState("");
  const [providers, setProviders] = useState<Providers>({ google: false, telegram: null });
  const pending = useRef<(() => void) | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/auth", { signal: ctrl.signal, cache: "no-store" })
      .then(r => (r.ok ? r.json() : { user: null }))
      .then((d: unknown) => {
        const data = d as { user?: AuthUser | null; providers?: Providers };
        setUser(data.user ?? null);
        if (data.providers) setProviders(data.providers);
      })
      .catch(() => {})
      .finally(() => { if (!ctrl.signal.aborted) setReady(true); });
    // Google/Telegram'dan qaytganda natija ?auth= parametrida keladi.
    const url = new URL(window.location.href);
    const result = url.searchParams.get("auth");
    if (result) {
      const messages: Record<string, [boolean, string]> = {
        google: [true, "Google orqali kirdingiz"], telegram: [true, "Telegram orqali kirdingiz"],
        cancelled: [false, "Kirish bekor qilindi"], unverified: [false, "Google email manzili tasdiqlanmagan"],
        google_off: [false, "Google orqali kirish hali sozlanmagan"], telegram_off: [false, "Telegram orqali kirish hali sozlanmagan"],
      };
      const [ok, text] = messages[result] ?? [false, "Kirib bo‘lmadi. Qayta urinib ko‘ring."];
      queueMicrotask(() => (ok ? toast.success(text) : toast.error(text)));
      url.searchParams.delete("auth");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
    // Parolni tiklash havolasi: /?reset=<token>. Token URL'dan darhol olib tashlanadi.
    const reset = url.searchParams.get("reset");
    if (reset && /^[a-f0-9]{64}$/.test(reset)) {
      queueMicrotask(() => { setResetToken(reset); setMode("reset"); });
      url.searchParams.delete("reset");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
    const onRequired = () => setMode("login");
    window.addEventListener(AUTH_REQUIRED, onRequired);
    return () => { ctrl.abort(); window.removeEventListener(AUTH_REQUIRED, onRequired); };
  }, []);

  const signedIn = useCallback((next: AuthUser) => {
    setUser(next);
    setMode(null);
    window.dispatchEvent(new Event(AUTH_CHANGED));
    const action = pending.current;
    pending.current = null;
    if (action) setTimeout(action, 0);
  }, []);

  const api = useMemo<AuthApi>(() => ({
    user, ready,
    requireAuth: action => {
      if (user) { action?.(); return true; }
      pending.current = action ?? null;
      setMode("login");
      return false;
    },
    openAuth: (m = "login") => { pending.current = null; setMode(m); },
    logout: async () => {
      await fetch("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "logout" }) }).catch(() => {});
      setUser(null);
      window.dispatchEvent(new Event(AUTH_CHANGED));
      toast.success("Hisobdan chiqdingiz");
    },
    rename: name => setUser(u => (u ? { ...u, name } : u)),
  }), [user, ready]);

  return <AuthContext.Provider value={api}>
    {children}
    <Dialog open={mode !== null} onOpenChange={open => { if (!open) { setMode(null); pending.current = null; } }}>
      <DialogContent className="app-dialog auth-dialog">
        {mode === "forgot" && <ForgotForm onBack={() => setMode("login")} />}
        {mode === "reset" && <ResetForm token={resetToken} onDone={signedIn} onRestart={() => setMode("forgot")} />}
        {(mode === "login" || mode === "register") && <AuthForm key={mode} mode={mode} providers={providers} onSwitch={setMode} onDone={signedIn} />}
      </DialogContent>
    </Dialog>
  </AuthContext.Provider>;
}

function AuthForm({ mode, providers, onSwitch, onDone }: { mode: FormMode; providers: Providers; onSwitch: (m: Mode) => void; onDone: (u: AuthUser) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const register = mode === "register";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (register && password !== confirm) return setError("Parollar bir xil emas.");
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: mode, name, login, password, email }) });
      const data = (await res.json().catch(() => ({}))) as { user?: AuthUser; error?: string };
      if (!res.ok || !data.user) throw Error(data.error ?? "Xatolik. Qayta urinib ko‘ring.");
      toast.success(register ? `Xush kelibsiz, ${data.user.name}!` : `Assalomu alaykum, ${data.user.name}!`);
      onDone(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Xatolik");
    } finally { setBusy(false); }
  };

  return <>
    <span className="auth-mark" aria-hidden="true">{register ? <UserPlus size={26} /> : <LogIn size={26} />}</span>
    <DialogTitle>{register ? "Hisob ochish" : "Kirish"}</DialogTitle>
    <DialogDescription>{register ? "Post yozish, kitob olish va suhbatlarda qatnashish uchun hisob oching." : "Davom etish uchun hisobingizga kiring."}</DialogDescription>
    {(providers.google || providers.telegram) && <>
      <div className="auth-providers">
        {providers.google && <a className="auth-provider auth-google" href="/api/auth/google"><GoogleMark />Google bilan {register ? "ro‘yxatdan o‘tish" : "kirish"}</a>}
        {providers.telegram && <TelegramButton bot={providers.telegram} />}
      </div>
      <p className="auth-or"><span>yoki login bilan</span></p>
    </>}
    <form className="auth-form" onSubmit={e => void submit(e)}>
      {register && <label>Ismingiz<input autoComplete="name" required minLength={2} maxLength={40} value={name} onChange={e => setName(e.target.value)} placeholder="Masalan: Aziza" /></label>}
      <label>Login<input autoComplete="username" required autoCapitalize="none" spellCheck={false} pattern="[A-Za-z0-9_.]{3,32}" title="3–32 belgi: lotin harflari, raqam, _ yoki ." maxLength={32} value={login} onChange={e => setLogin(e.target.value)} placeholder="kitobxon_01" /></label>
      {register && <label>Email <small className="auth-hint">(ixtiyoriy — parolni tiklash uchun)</small><input type="email" autoComplete="email" maxLength={254} value={email} onChange={e => setEmail(e.target.value)} placeholder="siz@misol.uz" /></label>}
      <label>Parol
        <span className="auth-password">
          <input type={show ? "text" : "password"} autoComplete={register ? "new-password" : "current-password"} required minLength={8} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} />
          <button type="button" aria-label={show ? "Parolni yashirish" : "Parolni ko‘rsatish"} onClick={() => setShow(v => !v)}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
        </span>
      </label>
      {!register && <button type="button" className="text-btn auth-forgot" onClick={() => onSwitch("forgot")}>Parolni unutdingizmi?</button>}
      {register && <label>Parolni takrorlang<input type={show ? "text" : "password"} autoComplete="new-password" required minLength={8} maxLength={128} value={confirm} onChange={e => setConfirm(e.target.value)} /></label>}
      {error && <p className="auth-error" role="alert">{error}</p>}
      <button className="button full" disabled={busy}>{busy ? "Kutilmoqda..." : register ? "Hisob ochish" : "Kirish"}</button>
    </form>
    <p className="auth-switch">{register ? "Hisobingiz bormi?" : "Hisobingiz yo‘qmi?"} <button type="button" className="text-btn" onClick={() => onSwitch(register ? "login" : "register")}>{register ? "Kirish" : "Hisob ochish"}</button></p>
  </>;
}

function GoogleMark() {
  return <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>;
}

/** Rasmiy Telegram Login Widget: tasdiqlangach /api/auth/telegram manziliga imzolangan ma'lumot bilan qaytaradi. */
function TelegramButton({ bot }: { bot: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el || !/^[A-Za-z0-9_]{5,32}$/.test(bot)) return;
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", bot);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "999");
    script.setAttribute("data-request-access", "write");
    script.setAttribute("data-auth-url", new URL("/api/auth/telegram", window.location.origin).toString());
    script.onerror = () => setFailed(true);
    el.appendChild(script);
    return () => { el.replaceChildren(); };
  }, [bot]);
  return <>
    <div className="auth-provider auth-telegram" ref={box} aria-label="Telegram orqali kirish" hidden={failed} />
    {failed && <p className="auth-provider-error">Telegram tugmasi yuklanmadi. Internetni tekshirib, oynani qayta oching.</p>}
  </>;
}

function ForgotForm({ onBack }: { onBack: () => void }) {
  const [identifier, setIdentifier] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState("");
  const [error, setError] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "forgot", identifier }) });
      const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      if (!res.ok) throw Error(data.error ?? "Xatolik. Qayta urinib ko‘ring.");
      setSent(data.message ?? "Havola yuborildi.");
    } catch (err) { setError(err instanceof Error ? err.message : "Xatolik"); }
    finally { setBusy(false); }
  };
  return <>
    <span className="auth-mark" aria-hidden="true"><KeyRound size={26} /></span>
    <DialogTitle>Parolni tiklash</DialogTitle>
    <DialogDescription>Login yoki emailingizni kiriting. Tiklash havolasi hisobingizga bog‘langan email yoki Telegram’ga yuboriladi.</DialogDescription>
    {sent
      ? <p className="auth-success" role="status"><MailCheck size={18} />{sent}</p>
      : <form className="auth-form" onSubmit={e => void submit(e)}>
          <label>Login yoki email<input autoComplete="username" required maxLength={254} autoCapitalize="none" spellCheck={false} value={identifier} onChange={e => setIdentifier(e.target.value)} /></label>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="button full" disabled={busy || !identifier.trim()}>{busy ? "Yuborilmoqda..." : "Havola yuborish"}</button>
        </form>}
    <p className="auth-hint-box">Email ham, Telegram ham bog‘lanmagan bo‘lsa, parolni tiklab bo‘lmaydi. Hisobga kirgach, Sozlamalarda email qo‘shib qo‘ying.</p>
    <p className="auth-switch"><button type="button" className="text-btn" onClick={onBack}><ArrowLeft size={16} />Kirishga qaytish</button></p>
  </>;
}

function ResetForm({ token, onDone, onRestart }: { token: string; onDone: (u: AuthUser) => void; onRestart: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (password !== confirm) return setError("Parollar bir xil emas.");
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "reset", token, password }) });
      const data = (await res.json().catch(() => ({}))) as { user?: AuthUser; error?: string };
      if (res.status === 410) setExpired(true);
      if (!res.ok || !data.user) throw Error(data.error ?? "Xatolik. Qayta urinib ko‘ring.");
      toast.success("Parol yangilandi. Boshqa qurilmalardagi sessiyalar yopildi.");
      onDone(data.user);
    } catch (err) { setError(err instanceof Error ? err.message : "Xatolik"); }
    finally { setBusy(false); }
  };
  return <>
    <span className="auth-mark" aria-hidden="true"><KeyRound size={26} /></span>
    <DialogTitle>Yangi parol</DialogTitle>
    <DialogDescription>Kamida 8 belgidan iborat yangi parol tanlang.</DialogDescription>
    <form className="auth-form" onSubmit={e => void submit(e)}>
      <label>Yangi parol<input type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} /></label>
      <label>Parolni takrorlang<input type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={confirm} onChange={e => setConfirm(e.target.value)} /></label>
      {error && <p className="auth-error" role="alert">{error}</p>}
      {expired
        ? <button type="button" className="button full" onClick={onRestart}>Yangi havola so‘rash</button>
        : <button className="button full" disabled={busy}>{busy ? "Saqlanmoqda..." : "Parolni saqlash"}</button>}
    </form>
  </>;
}
