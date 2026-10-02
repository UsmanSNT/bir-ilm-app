"use client";

import { createContext, FormEvent, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Eye, EyeOff, LogIn, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export type AuthUser = { id: string; login: string; name: string };
type Mode = "login" | "register";
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
  const pending = useRef<(() => void) | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/auth", { signal: ctrl.signal, cache: "no-store" })
      .then(r => (r.ok ? r.json() : { user: null }))
      .then((d: unknown) => setUser((d as { user?: AuthUser | null }).user ?? null))
      .catch(() => {})
      .finally(() => { if (!ctrl.signal.aborted) setReady(true); });
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
        {mode && <AuthForm key={mode} mode={mode} onSwitch={setMode} onDone={signedIn} />}
      </DialogContent>
    </Dialog>
  </AuthContext.Provider>;
}

function AuthForm({ mode, onSwitch, onDone }: { mode: Mode; onSwitch: (m: Mode) => void; onDone: (u: AuthUser) => void }) {
  const [name, setName] = useState("");
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
      const res = await fetch("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: mode, name, login, password }) });
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
    <form className="auth-form" onSubmit={e => void submit(e)}>
      {register && <label>Ismingiz<input autoComplete="name" required minLength={2} maxLength={40} value={name} onChange={e => setName(e.target.value)} placeholder="Masalan: Aziza" /></label>}
      <label>Login<input autoComplete="username" required autoCapitalize="none" spellCheck={false} pattern="[A-Za-z0-9_.]{3,32}" title="3–32 belgi: lotin harflari, raqam, _ yoki ." maxLength={32} value={login} onChange={e => setLogin(e.target.value)} placeholder="kitobxon_01" /></label>
      <label>Parol
        <span className="auth-password">
          <input type={show ? "text" : "password"} autoComplete={register ? "new-password" : "current-password"} required minLength={8} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} />
          <button type="button" aria-label={show ? "Parolni yashirish" : "Parolni ko‘rsatish"} onClick={() => setShow(v => !v)}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
        </span>
      </label>
      {register && <label>Parolni takrorlang<input type={show ? "text" : "password"} autoComplete="new-password" required minLength={8} maxLength={128} value={confirm} onChange={e => setConfirm(e.target.value)} /></label>}
      {error && <p className="auth-error" role="alert">{error}</p>}
      <button className="button full" disabled={busy}>{busy ? "Kutilmoqda..." : register ? "Hisob ochish" : "Kirish"}</button>
    </form>
    <p className="auth-switch">{register ? "Hisobingiz bormi?" : "Hisobingiz yo‘qmi?"} <button type="button" className="text-btn" onClick={() => onSwitch(register ? "login" : "register")}>{register ? "Kirish" : "Hisob ochish"}</button></p>
  </>;
}
