"use client";

import { useEffect, useState } from "react";
import { KeyRound, Smartphone } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { createLinkCode, redeemLinkCode } from "@/lib/api/roles-client";
import type { LinkCode } from "@/shared/contract";

/** Kirgan qurilmada: boshqa telefon/kompyuterni shu akkauntga ulash uchun kod. */
export function LinkDeviceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return open ? <LinkDeviceContent onClose={onClose} /> : null;
}

function LinkDeviceContent({ onClose }: { onClose: () => void }) {
  const [link, setLink] = useState<LinkCode | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    createLinkCode()
      .then((value) => alive && setLink(value))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : "Kod olinmadi."));
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const left = link ? Math.max(0, Math.floor((Date.parse(link.expiresAt) - now) / 1000)) : 0;
  const expired = Boolean(link) && left === 0;

  return (
    <Dialog open onOpenChange={(value) => { if (!value) onClose(); }}>
      <DialogContent className="device-link">
        <DialogTitle>Boshqa qurilmani ulash</DialogTitle>
        <DialogDescription>
          Ikkinchi qurilmada birilm.uz ni oching → Profil → «Kod bilan kirish» va shu kodni kiriting. U o‘sha akkauntga, rolingiz bilan kiradi.
        </DialogDescription>
        {error ? (
          <p className="device-link-error">{error}</p>
        ) : !link ? (
          <p className="muted">Kod tayyorlanmoqda…</p>
        ) : (
          <>
            <output className={`device-link-code${expired ? " expired" : ""}`} aria-label="Ulash kodi">
              {link.code.slice(0, 3)} {link.code.slice(3)}
            </output>
            <p className="muted">
              {expired ? "Kod muddati tugadi — oynani yopib yangisini oling." : `Amal qiladi: ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")} · bir marta ishlatiladi`}
            </p>
          </>
        )}
        <p className="device-link-warn">Kodni faqat o‘zingizning qurilmangizga kiriting — uni bilgan odam akkauntingizga kiradi.</p>
        <button type="button" className="button" onClick={onClose}>Tayyor</button>
      </DialogContent>
    </Dialog>
  );
}

/** Kirmagan qurilmada: asosiy qurilmadagi 6 xonali kod bilan kirish. */
export function CodeLoginForm() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await redeemLinkCode(code);
      // Yangi sessiya cookie'si bilan hamma bo'limlar qayta yuklansin.
      location.assign("/?login=ok");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kirib bo‘lmadi.");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="login-code-toggle" onClick={() => setOpen(true)}>
        <Smartphone size={16} /> Kod bilan kirish
      </button>
    );
  }

  return (
    <form className="login-code-form" onSubmit={submit}>
      <label>
        <KeyRound size={16} />
        <input
          aria-label="6 xonali kod"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="6 xonali kod"
          maxLength={7}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          autoFocus
        />
      </label>
      <button type="submit" className="button" disabled={busy || code.length !== 6}>{busy ? "Tekshirilmoqda…" : "Kirish"}</button>
      {error && <p className="login-code-error" role="alert">{error}</p>}
      <small>Kodni kirgan qurilmangizdan oling: Profil → «Boshqa qurilmani ulash».</small>
    </form>
  );
}
