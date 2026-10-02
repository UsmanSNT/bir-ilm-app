"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronDown, Crown, Hand, LogOut, MessageCircle, Mic, Radio, Send, Users } from "lucide-react";
import { toast } from "sonner";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useAuth } from "./auth";
import { uzDateTimeTashkent } from "./uz-date";
import { TALK_REACTIONS, type TalkMessage, type TalkParticipant, type TalkState } from "./talk-types";

const MAX_MESSAGES = 300;
const statusLabel = { scheduled: "Rejalashtirilgan", live: "Jonli", ended: "Yakunlandi" } as const;
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

function countdown(target: number, now: number) {
  const s = Math.max(0, Math.floor((target - now) / 1000));
  const d = Math.floor(s / 86400), h = Math.floor(s / 3600) % 24, m = Math.floor(s / 60) % 60;
  return d ? `${d} kun ${h} soat` : h ? `${h} soat ${m} daqiqa` : `${m} daqiqa`;
}

function systemText(m: TalkMessage) {
  return ({ joined: `${m.name} qo‘shildi`, left: `${m.name} chiqdi`, started: `${m.name} muhokamani boshladi`, ended: "Muhokama yakunlandi" } as Record<string, string>)[m.body] ?? m.body;
}

/**
 * Haftalik jonli muhokama xonasi: sahna (moderator va ma'ruzachilar), tinglovchilar, jonli chat,
 * reaksiyalar va qo'l ko'tarish. Holat serverda; mijoz har 3 soniyada yangilaydi (xona ochiq bo'lsa).
 */
export default function LiveSession({ name }: { name: string }) {
  const { user, requireAuth } = useAuth();
  const [state, setState] = useState<TalkState | null>(null);
  const [messages, setMessages] = useState<TalkMessage[]>([]);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"stage" | "chat">("stage");
  const [unread, setUnread] = useState(0);
  const [floating, setFloating] = useState<{ key: number; emoji: string; x: number }[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const lastId = useRef(0);
  const roomId = useRef("");
  const seen = useRef({ open, tab });
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => { seen.current = { open, tab }; }, [open, tab]);

  const apply = useCallback((next: TalkState) => {
    if (roomId.current !== next.room.id) { roomId.current = next.room.id; lastId.current = 0; setMessages([]); }
    const fresh = next.messages.filter(m => m.id > lastId.current);
    const initial = lastId.current === 0;
    if (fresh.length) {
      lastId.current = fresh[fresh.length - 1].id;
      setMessages(old => [...old, ...fresh].slice(-MAX_MESSAGES));
      if (!initial) {
        const reactions = fresh.filter(m => m.kind === "reaction");
        if (reactions.length) {
          const items = reactions.slice(-8).map(m => ({ key: m.id, emoji: m.body, x: 10 + Math.random() * 80 }));
          setFloating(f => [...f, ...items]);
          setTimeout(() => setFloating(f => f.filter(x => !items.some(i => i.key === x.key))), 2600);
        }
        const texts = fresh.filter(m => m.kind === "text" && m.userId !== next.me.userId).length;
        if (texts && !(seen.current.open && (seen.current.tab === "chat" || window.matchMedia("(min-width: 981px)").matches))) setUnread(u => u + texts);
      }
    }
    setState(next);
  }, []);

  const load = useCallback(async () => {
    const res = await fetch(`/api/talk?after=${lastId.current}`, { cache: "no-store" });
    if (res.ok) apply(await res.json() as TalkState);
  }, [apply]);

  const joined = !!state?.me.joined;
  // Xona ochiq yoki ishtirokchi bo'lsa tez-tez, aks holda kamroq yangilanadi; yashirin tabda to'xtaydi.
  useEffect(() => {
    queueMicrotask(() => { void load().catch(() => {}); });
    const every = open || joined ? 3000 : 20000;
    const timer = setInterval(() => { if (document.visibilityState === "visible") void load().catch(() => {}); setNow(Date.now()); }, every);
    return () => clearInterval(timer);
  }, [load, open, joined]);

  const act = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(true);
    try {
      const res = await fetch("/api/talk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, after: lastId.current, ...extra }) });
      const data = await res.json().catch(() => ({})) as TalkState & { error?: string };
      if (!res.ok) throw Error(data.error ?? "Saqlanmadi.");
      apply(data);
      return true;
    } catch (e) { toast.error(e instanceof Error ? e.message : "Saqlanmadi."); return false; }
    finally { setBusy(false); }
  }, [apply]);

  // Ishtirokchi "onlayn" turishi uchun har 15 soniyada belgi beriladi.
  useEffect(() => {
    if (!joined) return;
    const t = setInterval(() => { if (document.visibilityState === "visible") void fetch("/api/talk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ping" }) }).catch(() => {}); }, 15000);
    return () => clearInterval(t);
  }, [joined]);

  useEffect(() => {
    const el = listRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 160) el.scrollTop = el.scrollHeight;
  }, [messages, tab, open]);

  const join = () => requireAuth(() => { void act("join").then(ok => { if (ok) setOpen(true); }); });
  const send = (e: FormEvent) => { e.preventDefault(); const body = draft.trim(); if (!body || busy) return; void act("message", { body }).then(ok => { if (ok) setDraft(""); }); };

  const room = state?.room;
  const people = useMemo(() => state?.participants ?? [], [state]);
  const stage = people.filter(p => p.role !== "listener");
  const listeners = people.filter(p => p.role === "listener");
  const me = state?.me;
  const isHost = me?.role === "host" && room?.status === "live";
  const startsAt = room ? new Date(room.startsAt).getTime() : 0;
  const chatItems = messages.filter(m => m.kind !== "reaction");

  const person = (p: TalkParticipant, big: boolean) => <div key={p.userId} className={`tr-person ${big ? "is-big" : ""} ${p.userId === me?.userId ? "is-me" : ""}`}>
    <span className="tr-avatar">{p.name.slice(0, 1).toUpperCase()}{p.hand && <span className="tr-hand" aria-label="Qo'l ko'targan"><Hand size={14} /></span>}</span>
    <strong>{p.userId === me?.userId ? "Siz" : p.name}</strong>
    <small>{p.role === "host" ? <><Crown size={12} />Moderator</> : p.role === "speaker" ? <><Mic size={12} />Ma’ruzachi</> : p.hand ? "So‘z so‘radi" : "Tinglovchi"}</small>
    {isHost && p.userId !== me?.userId && <button className="tr-mod" disabled={busy} onClick={() => void act("role", { target: p.userId, role: p.role === "listener" ? "speaker" : "listener" })}>{p.role === "listener" ? "So‘z berish" : "Tinglovchiga"}</button>}
  </div>;

  return <>
    <section className={`talk-card status-${room?.status ?? "scheduled"}`}>
      <div className="talk-card-top">
        <span className="talk-status"><i />{room ? statusLabel[room.status] : "Yuklanmoqda"}</span>
        {people.length > 0 && <span className="talk-stack" aria-label={`${people.length} ishtirokchi`}>
          {people.slice(0, 4).map(p => <span key={p.userId}>{p.name.slice(0, 1).toUpperCase()}</span>)}
          <b>{people.length}</b>
        </span>}
      </div>
      <span className="eyebrow">Haftalik muhokama</span>
      <h3>{room?.title ?? "Atom odatlar — birga tahlil qilamiz"}</h3>
      <p className="talk-when"><CalendarDays size={17} />{startsAt ? `${uzDateTimeTashkent(startsAt)} (Toshkent)` : "Yakshanba · 18:00"}
        {room?.status === "scheduled" && startsAt > now && <small>· {countdown(startsAt, now)} qoldi</small>}</p>
      <div className="talk-actions">
        <button className="btn-gold" onClick={() => (joined ? setOpen(true) : join())}><Radio size={18} />{joined ? "Xonaga qaytish" : room?.status === "live" ? "Muhokamaga qo‘shilish" : "Xonaga kirish"}</button>
        {!joined && <button className="btn-glass" onClick={() => setOpen(true)}>Tomosha qilish</button>}
      </div>
      <p className="talk-note"><Mic size={15} />Ovozli aloqa tez orada qo‘shiladi. Hozircha muhokama jonli matnli chat orqali.</p>
    </section>

    {joined && !open && <div className="live-dock">
      <button onClick={() => { setOpen(true); setUnread(0); }}><span className="tr-pulse" /><span><strong>{room?.status === "live" ? "Jonli muhokama" : "Muhokama xonasi"}</strong><small>{room?.book} · {people.length} ishtirokchi{unread ? ` · ${unread} yangi xabar` : ""}</small></span></button>
      <button aria-label="Xonadan chiqish" onClick={() => void act("leave")}><LogOut size={20} /></button>
    </div>}

    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="tr-overlay" />
        <DialogPrimitive.Content className="talk-room" aria-describedby={undefined}>
          <header className="tr-head">
            <button className="tr-icon" aria-label="Xonani kichraytirish" onClick={() => setOpen(false)}><ChevronDown size={22} /></button>
            <div className="tr-title">
              <span className={`tr-chip status-${room?.status}`}><i />{room ? statusLabel[room.status] : ""}</span>
              <DialogPrimitive.Title asChild><strong>{room?.book ?? "Muhokama"}</strong></DialogPrimitive.Title>
              <small><Users size={13} />{people.length} ishtirokchi</small>
            </div>
            {joined ? <button className="tr-leave" onClick={() => void act("leave").then(ok => { if (ok) setOpen(false); })}><LogOut size={16} />Chiqish</button>
              : <button className="tr-join" onClick={join}>Qo‘shilish</button>}
          </header>

          <div className="tr-tabs" role="tablist">
            <button role="tab" aria-selected={tab === "stage"} onClick={() => setTab("stage")}><Users size={16} />Sahna</button>
            <button role="tab" aria-selected={tab === "chat"} onClick={() => { setTab("chat"); setUnread(0); }}><MessageCircle size={16} />Chat{unread > 0 && <b>{unread}</b>}</button>
          </div>

          <div className="tr-body" data-tab={tab}>
            <section className="tr-stage" aria-label="Sahna">
              {room?.status !== "live" && <div className="tr-banner">
                <strong>{room?.status === "ended" ? "Muhokama yakunlandi" : "Muhokama hali boshlanmadi"}</strong>
                <span>{room?.status === "ended" ? "Keyingi yakshanba yana uchrashamiz. Chat tarixi saqlanadi." : startsAt > now ? `Boshlanishiga ${countdown(startsAt, now)} qoldi. Shu vaqtgacha chatda fikr almashishingiz mumkin.` : "Moderator boshlashini kutyapmiz."}</span>
                {joined && <button className="btn-gold" disabled={busy} onClick={() => void act("start")}><Radio size={17} />Boshlash — moderator bo‘lasiz</button>}
              </div>}
              <h4>Sahna</h4>
              <div className="tr-speakers">{stage.length ? stage.map(p => person(p, true)) : <p className="tr-empty">Hali hech kim sahnada emas.</p>}</div>
              <h4>Tinglovchilar · {listeners.length}</h4>
              <div className="tr-listeners">{listeners.length ? listeners.map(p => person(p, false)) : <p className="tr-empty">Tinglovchilar shu yerda ko‘rinadi.</p>}</div>
              <div className="tr-floating" aria-hidden="true">{floating.map(f => <span key={f.key} style={{ left: `${f.x}%` }}>{f.emoji}</span>)}</div>
              {joined && <div className="tr-controls">
                {me?.role === "listener" && <button className={`tr-handbtn ${me.hand ? "is-on" : ""}`} aria-pressed={me.hand} disabled={busy} onClick={() => void act("hand", { raised: !me.hand })}><Hand size={18} />{me.hand ? "Qo‘lni tushirish" : "So‘z so‘rash"}</button>}
                <div className="tr-reactions">{TALK_REACTIONS.map(e => <button key={e} aria-label={`Reaksiya ${e}`} onClick={() => void act("react", { emoji: e })}>{e}</button>)}</div>
                {isHost && <button className="tr-end" disabled={busy} onClick={() => void act("end")}>Yakunlash</button>}
              </div>}
            </section>

            <section className="tr-chat" aria-label="Chat">
              <div className="tr-messages" ref={listRef} aria-live="polite">
                {!chatItems.length && <p className="tr-empty">Hali xabar yo‘q. Birinchi fikrni siz yozing.</p>}
                {chatItems.map((m, i) => {
                  if (m.kind === "system") return <p key={m.id} className="tr-system">{systemText(m)}</p>;
                  const mine = m.userId === me?.userId;
                  const prev = chatItems[i - 1];
                  const head = !prev || prev.kind !== "text" || prev.userId !== m.userId;
                  return <div key={m.id} className={`tr-msg ${mine ? "is-mine" : ""} ${head ? "is-head" : ""}`}>
                    {!mine && head && <span className="tr-msg-avatar">{m.name.slice(0, 1).toUpperCase()}</span>}
                    <div className="tr-bubble">{!mine && head && <b>{m.name}</b>}<p>{m.body}</p><time>{timeOf(m.createdAt)}</time></div>
                  </div>;
                })}
              </div>
              {joined
                ? <form className="tr-compose" onSubmit={send}>
                    <input aria-label="Xabar" maxLength={500} placeholder={`${name}, fikringizni yozing...`} value={draft} onChange={e => setDraft(e.target.value)} />
                    <button aria-label="Yuborish" disabled={busy || !draft.trim()}><Send size={18} /></button>
                  </form>
                : <button className="tr-compose-join" onClick={join}>{user ? "Yozish uchun xonaga qo‘shiling" : "Yozish uchun hisobingizga kiring"}</button>}
            </section>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  </>;
}
