"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Timer, Check, X, Settings } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogPortal, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Dialog as DialogPrimitive } from "radix-ui";

import { finishPhase, type Session, type TimerState } from "./focus-state";
const KEY = "bir-ilm-focus-v1";
const blank = (): TimerState => ({ minutes: 25, remaining: 1500, endAt: null, sessionId: "", pending: [] });

export default function FocusTimer({ onComplete }: { onComplete: (session: Session) => Promise<void> }) {
  const [state, setState] = useState<TimerState>(blank);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState(false);
  const [open, setOpen] = useState(false);
  const current = useRef(state);
  const callback = useRef(onComplete);
  useEffect(() => { callback.current = onComplete; }, [onComplete]);

  function save(next: TimerState) {
    current.current = next;
    setState(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); }
    catch { toast.error("Taymer qurilma xotirasiga saqlanmadi."); }
  }

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const stored = JSON.parse(localStorage.getItem(KEY) || "null") as TimerState | null;
        if (stored && ([15,25,45,60].includes(stored.minutes) || (stored.phase === "break" && stored.minutes === 5 && [15,25,45,60].includes(stored.workMinutes ?? 0))) && Number.isFinite(stored.remaining) && stored.remaining >= 0 && stored.remaining <= stored.minutes * 60 && (stored.endAt === null || Number.isFinite(stored.endAt)) && typeof stored.sessionId === "string" && Array.isArray(stored.pending)) {
          current.current = stored;
          setState(stored);
        }
      } catch { /* Ignore invalid local state and start a fresh timer. */ }
      setReady(true);
    });
    const tick = setInterval(() => {
      const s = current.current;
      if (!s.endAt) return;
      const remaining = Math.max(0, Math.ceil((s.endAt - Date.now()) / 1000));
      if (!remaining) {
        const { next, completed } = finishPhase(s);
        save(next);
        if (!completed) {
          toast.success("Tanaffus tugadi. Mutolaaga tayyormisiz?");
          return;
        }
        toast.success("Barakalla! Mutolaa seansi yakunlandi.");
        void callback.current(completed).then(() => {
          const latest = current.current;
          save({ ...latest, pending: latest.pending.filter(p => p.sessionId !== completed.sessionId) });
        }).catch(() => toast.error("Seans qurilmada saqlandi. Internet tiklangach qayta saqlang."));
      } else {
        const next = { ...s, remaining };
        current.current = next;
        setState(next);
      }
    }, 500);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    const openTimer = () => setOpen(true);
    window.addEventListener("bir-open-pomodoro", openTimer);
    return () => window.removeEventListener("bir-open-pomodoro", openTimer);
  }, []);

  function toggle() {
    const s = current.current;
    if (s.endAt) save({ ...s, endAt: null, remaining: Math.max(0, Math.ceil((s.endAt - Date.now()) / 1000)) });
    else {
      const remaining = s.remaining || s.minutes * 60;
      save({ ...s, remaining, sessionId: s.remaining && s.sessionId ? s.sessionId : crypto.randomUUID(), endAt: Date.now() + remaining * 1000 });
    }
  }

  async function retry() {
    setSaving(true);
    try {
      for (const session of [...current.current.pending]) {
        await callback.current(session);
        save({ ...current.current, pending: current.current.pending.filter(p => p.sessionId !== session.sessionId) });
      }
      toast.success("Seanslar saqlandi.");
    } catch { toast.error("Saqlanmadi. Qayta urinib ko'ring."); }
    finally { setSaving(false); }
  }

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild>
      <button className="focus-launcher" disabled={!ready}>
        <Timer size={20} />
        <span><strong>Pomodoro</strong><small>{state.phase === "break" ? "5 daqiqa tanaffus" : state.endAt ? "Seans davom etmoqda" : "Diqqat vaqti"}</small></span>
      </button>
    </DialogTrigger>
    <DialogPortal>
    <DialogPrimitive.Overlay className="pomodoro-backdrop" />
    <DialogPrimitive.Content className="pomodoro-fullscreen" aria-describedby={undefined}>
      <div className="pomodoro-toolbar">
        <DialogClose asChild><button title="Qaytish" aria-label="Pomodoro oynasini yopish"><X size={20} /></button></DialogClose>
        <span />
        <button title="Taymerni qaytarish" aria-label="Taymerni qaytarish" disabled={!ready} onClick={() => save({ ...state, endAt: null, sessionId: "", remaining: state.minutes*60 })}><RotateCcw size={19}/></button>
        <button title="Davomiylik" aria-label="Davomiylik sozlamalari" aria-expanded={settings} onClick={() => setSettings(v => !v)}><Settings size={19}/></button>
      </div>
      <DialogTitle className="sr-only">BIR ILM taymeri</DialogTitle>
      <section className="pomodoro-surface" aria-label="BIR ILM taymeri">
    <p className="pomodoro-phase" aria-live="polite">{state.phase === "break" ? "Tanaffus" : "Mutolaa"}{state.endAt ? "" : " · Pauza"}</p>
    {settings && <Tabs className="pomodoro-settings" value={String(state.minutes)} onValueChange={v => { save({ ...blank(), minutes: Number(v), remaining: Number(v)*60, pending: state.pending }); setSettings(false); }}>
      <TabsList className="duration-tabs" aria-label="Seans davomiyligi">
        {[15,25,45,60].map(m => <TabsTrigger key={m} value={String(m)} disabled={!!state.endAt}>{m} daq</TabsTrigger>)}
      </TabsList>
    </Tabs>}
    <div className="flip-clock" role="timer" aria-label={`${Math.floor(state.remaining/60)} daqiqa ${state.remaining%60} soniya`}>
      {[String(Math.floor(state.remaining/60)).padStart(2,"0"), String(state.remaining%60).padStart(2,"0")].map((pair, row) => <div className="flip-pair" key={row} aria-hidden="true">{pair.split("").map((digit, col) => <div className="flip-digit" key={col}><span>{digit}</span></div>)}</div>)}
    </div>
    <div className="pomodoro-controls"><button disabled={!ready} title={state.endAt ? "Pauza" : "Boshlash / davom etish"} aria-label={state.endAt ? "Pauza" : "Boshlash yoki davom etish"} onClick={toggle}>{state.endAt ? <Pause size={26}/> : <Play size={26}/>}</button></div>
    {!!state.pending.length && <button className="text-btn" disabled={saving} onClick={() => void retry()}><Check size={16} />{saving ? "Saqlanmoqda..." : `${state.pending.length} seansni saqlash`}</button>}
      </section>
    </DialogPrimitive.Content>
    </DialogPortal>
  </Dialog>;
}
