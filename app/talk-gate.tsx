"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Mic, Radio } from "lucide-react";
import { fetchLiveSessionState, startLiveSessionRest } from "@/lib/api/live-client";
import type { LiveSession } from "@/shared/contract/live";
import TalkWaiting from "./talk-waiting";

const POLL_MS = 5000;

/**
 * Boshlanmagan suhbat uchun oldingi oyna: timer, hamma uchun «Orqaga», admin uchun «Suhbatni boshlash».
 * Suhbat boshlanmaguncha xona ochilmaydi (server ham qo'shilishni rad etadi).
 */
export default function TalkGate({ session, isAdmin, onBack, onEnter, onChange }: {
  session: LiveSession;
  isAdmin: boolean;
  onBack: () => void;
  onEnter: (id: string) => void;
  onChange: (session: LiveSession) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const backRef = useRef<HTMLButtonElement>(null);
  // Ota komponent har renderda yangi funksiya beradi; effektlar qayta ishga tushmasin.
  const handlers = useRef({ onBack, onChange });
  useEffect(() => { handlers.current = { onBack, onChange }; });
  const live = session.status === "live";
  const ended = session.status === "ended";

  useEffect(() => {
    backRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handlers.current.onBack(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Admin boshlaguncha holatni kuzatamiz — boshlangach «Kirish» chiqadi.
  useEffect(() => {
    if (live || ended) return;
    let alive = true;
    const timer = setInterval(async () => {
      const next = await fetchLiveSessionState(session.id);
      if (alive && next && next.status !== "planned") handlers.current.onChange(next);
    }, POLL_MS);
    return () => { alive = false; clearInterval(timer); };
  }, [session.id, live, ended]);

  async function start() {
    if (busy) return;
    setBusy(true);
    setError("");
    const result = await startLiveSessionRest(session.id);
    setBusy(false);
    if (typeof result === "string") {
      setError(result);
      return;
    }
    onChange(result);
    onEnter(result.id);
  }

  return createPortal(
    <div className="talk-gate" onClick={(e) => { if (e.target === e.currentTarget) onBack(); }}>
      <div className="talk-gate-card" role="dialog" aria-modal="true" aria-label={`${session.bookTitle} suhbati`}>
        {live ? (
          <section className="live-waiting talk-gate-live" aria-live="polite">
            <p className="live-waiting-state"><Radio size={16} aria-hidden="true" />Suhbat boshlandi</p>
            <p className="live-waiting-title">{session.bookTitle}{session.title ? ` — ${session.title}` : ""}</p>
            <button type="button" className="live-waiting-start" onClick={() => onEnter(session.id)}><Mic size={16} aria-hidden="true" />Kirish</button>
          </section>
        ) : ended ? (
          <section className="live-waiting" aria-live="polite">
            <p className="live-waiting-state">Suhbat tugagan</p>
            <p className="live-waiting-title">{session.bookTitle}</p>
          </section>
        ) : (
          <TalkWaiting scheduledAt={session.scheduledAt} bookTitle={session.bookTitle} title={session.title} canStart={isAdmin} busy={busy} onStart={() => void start()} />
        )}
        {error && <p className="talk-gate-error" role="alert">{error}</p>}
        <button ref={backRef} type="button" className="talk-gate-back" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" />Orqaga</button>
      </div>
    </div>,
    document.body,
  );
}
