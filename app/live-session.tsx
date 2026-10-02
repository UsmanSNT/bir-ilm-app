"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronDown, Circle, Crown, Gauge, Hand, LogOut, MessageCircle, Mic, MicOff, MonitorUp, Pause, Play, Radio, Save, Send, Square, Trash2, Users, Video, VideoOff } from "lucide-react";
import { toast } from "sonner";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useAuth } from "./auth";
import { uzDateTimeTashkent } from "./uz-date";
import { TALK_REACTIONS, type TalkMessage, type TalkParticipant, type TalkState } from "./talk-types";
import { useTalkMedia } from "./talk-media";

const MAX_MESSAGES = 300;
const statusLabel = { scheduled: "Rejalashtirilgan", live: "Jonli", ended: "Yakunlandi" } as const;
const clock = (ms: number) => { const t = Math.floor(ms / 1000); const h = Math.floor(t / 3600); return `${h ? `${h}:` : ""}${String(Math.floor(t / 60) % 60).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

function countdown(target: number, now: number) {
  const s = Math.max(0, Math.floor((target - now) / 1000));
  const d = Math.floor(s / 86400), h = Math.floor(s / 3600) % 24, m = Math.floor(s / 60) % 60;
  return d ? `${d} kun ${h} soat` : h ? `${h} soat ${m} daqiqa` : `${m} daqiqa`;
}

function systemText(m: TalkMessage) {
  return ({ joined: `${m.name} qo‘shildi`, left: `${m.name} chiqdi`, started: `${m.name} efirni boshladi`, ended: "Efir yakunlandi", rec_on: "● Efir yozib olinmoqda", rec_off: "Yozib olish to‘xtatildi" } as Record<string, string>)[m.body] ?? m.body;
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

  const media = useTalkMedia({ state, act });
  const [saveName, setSaveName] = useState("");

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

  const leave = async () => {
    if (media.rec !== "idle") await media.recStop();
    const ok = await act("leave");
    if (ok) setOpen(false);
  };
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

  const person = (p: TalkParticipant, big: boolean) => <div key={p.userId} className={`tr-person ${big ? "is-big" : ""} ${p.userId === me?.userId ? "is-me" : ""} ${media.speaking.has(p.userId) ? "is-speaking" : ""}`}>
    <span className="tr-avatar">{p.name.slice(0, 1).toUpperCase()}
      {p.hand && <span className="tr-hand" aria-label="Qo'l ko'targan"><Hand size={14} /></span>}
      {p.role !== "listener" && (!p.audio || !p.mic) && <span className="tr-muted" aria-label="Mikrofon o'chiq"><MicOff size={12} /></span>}
    </span>
    <strong>{p.userId === me?.userId ? "Siz" : p.name}</strong>
    <small>{p.role === "host" ? <><Crown size={12} />Admin</> : p.role === "speaker" ? <><Mic size={12} />Ma’ruzachi</> : p.hand ? "So‘z so‘radi" : "Tinglovchi"}</small>
    {isHost && p.userId !== me?.userId && <button className="tr-mod" disabled={busy} onClick={() => void act("role", { target: p.userId, role: p.role === "listener" ? "speaker" : "listener" })}>{p.role === "listener" ? "So‘z berish" : "So‘zni olish"}</button>}
  </div>;

  // Video maydoni: kimdir kamera yoki ekran yoqsa ochiladi; qolganlar ovozli holatda qoladi.
  const nameOf = (id: string) => people.find(p => p.userId === id)?.name ?? "";
  const tiles = [
    ...(media.local.screen ? [{ key: "me:screen", stream: media.local.screen, label: "Ekraningiz", screen: true, mine: true }] : []),
    ...media.remote.filter(r => r.kind === "screen").map(r => ({ key: `${r.userId}:screen`, stream: r.stream, label: `${nameOf(r.userId)} · ekran`, screen: true, mine: false })),
    ...(media.local.video ? [{ key: "me:video", stream: media.local.video, label: "Siz", screen: false, mine: true }] : []),
    ...media.remote.filter(r => r.kind === "video").map(r => ({ key: `${r.userId}:video`, stream: r.stream, label: nameOf(r.userId), screen: false, mine: false })),
  ];
  const hiddenVideo = media.saver && people.some(p => p.userId !== me?.userId && (p.video || p.screen));
  const canSpeak = me?.role === "host" || me?.role === "speaker";

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
      <p className="talk-note"><Mic size={15} />{state?.media ? "Ovozli efir: avval ovoz, xohlagan kamera yoqadi, admin ekranini ulashadi. Tejamkor rejimda faqat ovoz." : "Ovoz serveri hali sozlanmagan — hozircha jonli matnli muhokama."}</p>
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
              <span className="tr-chips"><span className={`tr-chip status-${room?.status}`}><i />{room ? statusLabel[room.status] : ""}</span>
                {!!room?.recording && <span className={`tr-chip tr-rec ${room.recording === 2 ? "is-paused" : ""}`}><i />{room.recording === 2 ? "Yozuv pauzada" : "Yozilmoqda"}</span>}</span>
              <DialogPrimitive.Title asChild><strong>{room?.book ?? "Muhokama"}</strong></DialogPrimitive.Title>
              <small><Users size={13} />{people.length} ishtirokchi</small>
            </div>
            {joined ? <button className="tr-leave" onClick={() => void leave()}><LogOut size={16} />Chiqish</button>
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
                {joined && me?.canStart && <button className="btn-gold" disabled={busy} onClick={() => void act("start")}><Radio size={17} />Efirni boshlash</button>}
                {joined && !me?.canStart && room?.status !== "ended" && <span className="tr-wait">Efirni admin boshlaydi. Boshlanganda shu yerda ovoz eshitiladi.</span>}
              </div>}
              {tiles.length > 0 && <div className={`tr-media ${tiles.some(t => t.screen) ? "has-screen" : ""}`} data-count={tiles.length}>
                {tiles.map(t => <figure key={t.key} className={`tr-tile ${t.screen ? "is-screen" : ""}`}>
                  <VideoView stream={t.stream} mirrored={t.mine && !t.screen} />
                  <figcaption>{t.label}</figcaption>
                </figure>)}
              </div>}
              {hiddenVideo && <p className="tr-saver-note"><Gauge size={15} />Tejamkor rejim: video va ekran yuklanmayapti.</p>}
              {joined && room?.status === "live" && !state?.media && <p className="tr-saver-note"><MicOff size={15} />Ovoz serveri hali sozlanmagan — hozircha matnli rejim.</p>}
              {joined && room?.status === "live" && state?.media && media.status === "connecting" && <p className="tr-saver-note">Ovozga ulanmoqda...</p>}
              <h4>Sahna</h4>
              <div className="tr-speakers">{stage.length ? stage.map(p => person(p, true)) : <p className="tr-empty">Hali hech kim sahnada emas.</p>}</div>
              <h4>Tinglovchilar · {listeners.length}</h4>
              <div className="tr-listeners">{listeners.length ? listeners.map(p => person(p, false)) : <p className="tr-empty">Tinglovchilar shu yerda ko‘rinadi.</p>}</div>
              <div className="tr-floating" aria-hidden="true">{floating.map(f => <span key={f.key} style={{ left: `${f.x}%` }}>{f.emoji}</span>)}</div>
              {joined && <div className="tr-controls">
                {canSpeak && room?.status === "live" && state?.media && <>
                  <button className={`tr-ctl ${media.micOn ? "is-on" : "is-off"}`} aria-pressed={media.micOn} disabled={media.status !== "on"} onClick={() => void media.toggleMic()}>{media.micOn ? <Mic size={20} /> : <MicOff size={20} />}<span>{media.micOn ? "Mikrofon" : "Ovozsiz"}</span></button>
                  <button className={`tr-ctl ${media.local.video ? "is-on" : ""}`} aria-pressed={!!media.local.video} disabled={media.status !== "on"} onClick={() => void media.toggleCam()}>{media.local.video ? <Video size={20} /> : <VideoOff size={20} />}<span>Kamera</span></button>
                  {me?.role === "host" && <button className={`tr-ctl ${media.local.screen ? "is-on" : ""}`} aria-pressed={!!media.local.screen} disabled={media.status !== "on" || !navigator.mediaDevices?.getDisplayMedia} onClick={() => void media.toggleScreen()}><MonitorUp size={20} /><span>Ekran</span></button>}
                </>}
                {me?.role === "listener" && room?.status === "live" && <button className={`tr-ctl ${me.hand ? "is-on" : ""}`} aria-pressed={me.hand} disabled={busy} onClick={() => void act("hand", { raised: !me.hand })}><Hand size={20} /><span>{me.hand ? "Tushirish" : "So‘z so‘rash"}</span></button>}
                <button className={`tr-ctl ${media.saver ? "is-on" : ""}`} aria-pressed={media.saver} onClick={() => media.setSaver(!media.saver)} title="Video yuklanmaydi — internet tejaladi"><Gauge size={20} /><span>Tejamkor</span></button>
                <div className="tr-reactions">{TALK_REACTIONS.map(e => <button key={e} aria-label={`Reaksiya ${e}`} onClick={() => void act("react", { emoji: e })}>{e}</button>)}</div>
                {isHost && <div className="tr-admin">
                  {media.rec === "idle"
                    ? <button className="tr-ctl tr-recbtn" onClick={() => void media.recStart()}><Circle size={18} fill="currentColor" /><span>Yozib olish</span></button>
                    : <span className="tr-recbox"><i className={media.rec === "paused" ? "is-paused" : ""} />{clock(media.recElapsed)}
                        {media.rec === "recording"
                          ? <button aria-label="Yozuvni pauza qilish" onClick={media.recPause}><Pause size={16} /></button>
                          : <button aria-label="Yozuvni davom ettirish" onClick={media.recResume}><Play size={16} /></button>}
                        <button aria-label="Yozuvni tugatish va saqlash" onClick={() => void media.recStop()}><Square size={15} /></button>
                      </span>}
                  <button className="tr-end" disabled={busy} onClick={() => void (media.rec !== "idle" ? media.recStop() : Promise.resolve()).then(() => act("end"))}>Yakunlash</button>
                </div>}
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
          <div hidden>{media.remote.filter(r => r.kind === "audio").map(r => <AudioSink key={`${r.userId}:audio`} stream={r.stream} />)}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>

    <DialogPrimitive.Root open={!!media.pending} onOpenChange={o => { if (!o && media.pending && window.confirm("Yozuv saqlanmasdan o'chirilsinmi?")) media.discardPending(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="tr-overlay tr-overlay-top" />
        <DialogPrimitive.Content className="app-dialog tr-save" aria-describedby={undefined}>
          <DialogPrimitive.Title>Yozuvni saqlash</DialogPrimitive.Title>
          <p>Fayl nomini kiriting. Keyingi oynada saqlash joyini (papkani) tanlaysiz.{media.pending && ` Hajmi: ${(media.pending.blob.size / 1024 / 1024).toFixed(1)} MB.`}</p>
          <label>Fayl nomi<input autoFocus value={saveName || `Bir-Ilm-${room?.book ?? "efir"}-${room?.id ?? ""}`.replace(/[^\p{L}\p{N}_-]+/gu, "-")} onChange={e => setSaveName(e.target.value)} /></label>
          <div className="tr-save-actions">
            <button className="button" onClick={() => void media.savePending(saveName || `Bir-Ilm-${room?.book ?? "efir"}-${room?.id ?? ""}`.replace(/[^\p{L}\p{N}_-]+/gu, "-")).then(() => setSaveName(""))}><Save size={17} />Saqlash</button>
            <button className="button secondary" onClick={() => { if (window.confirm("Yozuv saqlanmasdan o'chirilsinmi?")) media.discardPending(); }}><Trash2 size={17} />O‘chirish</button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  </>;
}

function VideoView({ stream, mirrored }: { stream: MediaStream; mirrored: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream; }, [stream]);
  return <video ref={ref} autoPlay playsInline muted className={mirrored ? "is-mirrored" : ""} />;
}

/** Boshqalarning ovozi (WebRTC ovozi brauzerda media element orqali ijro etilishi kerak). */
function AudioSink({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => { if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream; }, [stream]);
  return <audio ref={ref} autoPlay />;
}
