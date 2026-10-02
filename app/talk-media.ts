"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CAM_CONSTRAINTS, MIC_CONSTRAINTS, RtcError, TalkRtc, type RemoteTrack } from "./talk-rtc";
import { saveRecording, TalkRecorder } from "./talk-recorder";
import type { MediaKind, TalkParticipant, TalkState } from "./talk-types";

type Act = (action: string, extra?: Record<string, unknown>) => Promise<boolean>;
type Local = Partial<Record<MediaKind, MediaStream>>;
export type RecState = "idle" | "recording" | "paused";
const SAVER_KEY = "bir-talk-saver";

/**
 * Efir media holati: SFU ulanishi, o'z mikrofon/kamera/ekrani, boshqalarning treklari,
 * kim gapirayotgani va moderator yozuvi. Ovoz har doim birinchi; video/ekran faqat kimdir yoqsa paydo bo'ladi.
 */
export function useTalkMedia({ state, act }: { state: TalkState | null; act: Act }) {
  const live = state?.room.status === "live";
  const joined = !!state?.me.joined;
  const role = state?.me.role ?? null;
  const enabled = !!state?.media && live && joined;
  const [status, setStatus] = useState<"off" | "connecting" | "on" | "error">("off");
  const [local, setLocal] = useState<Local>({});
  const [remote, setRemote] = useState<RemoteTrack[]>([]);
  const [micOn, setMicOn] = useState(false);
  const [saver, setSaverState] = useState(false);
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());
  const [rec, setRec] = useState<RecState>("idle");
  const [recElapsed, setRecElapsed] = useState(0);
  const [pending, setPending] = useState<{ blob: Blob; ext: string } | null>(null);
  const rtc = useRef<TalkRtc | null>(null);
  const recorder = useRef<TalkRecorder | null>(null);
  const recOnlyMic = useRef<MediaStream | null>(null);
  const lastSync = useRef("");

  useEffect(() => { try { queueMicrotask(() => setSaverState(localStorage.getItem(SAVER_KEY) === "1")); } catch { /* xotira yopiq */ } }, []);
  const setSaver = useCallback((on: boolean) => { setSaverState(on); try { localStorage.setItem(SAVER_KEY, on ? "1" : "0"); } catch { /* xotira yopiq */ } }, []);

  const stopLocal = useCallback(() => {
    setLocal(l => { for (const s of Object.values(l)) s?.getTracks().forEach(t => t.stop()); return {}; });
    setMicOn(false);
  }, []);

  // Ulanish: efir jonli va foydalanuvchi xonada bo'lsa. Chiqsa yoki efir tugasa — hammasi yopiladi.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) setStatus("connecting"); });
    TalkRtc.connect(tracks => setRemote(tracks))
      .then(conn => { if (cancelled) conn.close(); else { rtc.current = conn; lastSync.current = ""; setStatus("on"); } })
      .catch(e => { if (!cancelled) { setStatus("error"); toast.error(e instanceof RtcError ? e.message : "Ovoz serveriga ulanib bo'lmadi."); } });
    return () => {
      cancelled = true;
      rtc.current?.close();
      rtc.current = null;
      setStatus("off");
      setRemote([]);
      stopLocal();
    };
  }, [enabled, stopLocal]);

  // Kerakli treklar: gapirish huquqi borlarning ovozi; tejamkor rejimda video va ekran olinmaydi.
  const wanted = useMemo(() => {
    const list: { userId: string; kind: MediaKind }[] = [];
    for (const p of state?.participants ?? []) {
      if (p.userId === state?.me.userId) continue;
      if (p.audio && p.role !== "listener") list.push({ userId: p.userId, kind: "audio" });
      if (!saver && p.video && p.role !== "listener") list.push({ userId: p.userId, kind: "video" });
      if (!saver && p.screen && p.role === "host") list.push({ userId: p.userId, kind: "screen" });
    }
    return list;
  }, [state, saver]);

  useEffect(() => {
    const key = JSON.stringify(wanted);
    if (status !== "on" || !rtc.current || key === lastSync.current) return;
    lastSync.current = key;
    rtc.current.sync(wanted).catch(() => { lastSync.current = ""; });
  }, [wanted, status]);

  const unpublish = useCallback(async (kind: MediaKind) => {
    setLocal(l => { l[kind]?.getTracks().forEach(t => t.stop()); const n = { ...l }; delete n[kind]; return n; });
    if (kind === "audio") setMicOn(false);
    await rtc.current?.unpublish(kind).catch(() => {});
  }, []);

  // So'z olib qo'yilsa (tinglovchiga qaytarilsa) — mikrofon va kamera darhol to'xtaydi.
  useEffect(() => {
    if (role === "listener" && (local.audio || local.video)) {
      queueMicrotask(() => { void unpublish("audio"); void unpublish("video"); });
    }
  }, [role, local.audio, local.video, unpublish]);

  const publish = useCallback(async (kind: MediaKind, getStream: () => Promise<MediaStream>) => {
    if (!rtc.current) throw Error("Ovoz serveriga ulanmagan.");
    const stream = await getStream();
    const track = kind === "audio" ? stream.getAudioTracks()[0] : stream.getVideoTracks()[0];
    if (!track) throw Error("Qurilma topilmadi.");
    try {
      await rtc.current.publish(kind, track);
    } catch (e) { stream.getTracks().forEach(t => t.stop()); throw e; }
    setLocal(l => ({ ...l, [kind]: stream }));
    if (kind === "screen") track.onended = () => void unpublish("screen");
    return stream;
  }, [unpublish]);

  const guard = useCallback(async (fn: () => Promise<unknown>) => {
    try { await fn(); }
    catch (e) {
      const msg = e instanceof DOMException && e.name === "NotAllowedError" ? "Ruxsat berilmadi. Brauzer sozlamalaridan ruxsat bering." : e instanceof Error ? e.message : "Xatolik";
      toast.error(msg);
    }
  }, []);

  const toggleMic = useCallback(() => guard(async () => {
    if (!local.audio) {
      await publish("audio", () => navigator.mediaDevices.getUserMedia({ audio: MIC_CONSTRAINTS }));
      setMicOn(true);
      return;
    }
    const next = !micOn;
    rtc.current?.mute("audio", !next);
    setMicOn(next);
    await act("mic", { on: next });
  }), [guard, local.audio, micOn, publish, act]);

  const toggleCam = useCallback(() => guard(async () => {
    if (local.video) return unpublish("video");
    await publish("video", () => navigator.mediaDevices.getUserMedia({ video: CAM_CONSTRAINTS }));
  }), [guard, local.video, publish, unpublish]);

  const toggleScreen = useCallback(() => guard(async () => {
    if (local.screen) return unpublish("screen");
    await publish("screen", () => navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 8, max: 10 }, width: { max: 1280 }, height: { max: 720 } }, audio: false }));
  }), [guard, local.screen, publish, unpublish]);

  // Kim gapiryapti: har bir ovoz oqimi uchun tovush darajasi (300 ms da bir).
  const audioStreams = useMemo(() => {
    const list: { userId: string; stream: MediaStream }[] = remote.filter(r => r.kind === "audio").map(r => ({ userId: r.userId, stream: r.stream }));
    if (local.audio && micOn && state) list.push({ userId: state.me.userId, stream: local.audio });
    return list;
  }, [remote, local.audio, micOn, state]);

  useEffect(() => {
    if (!audioStreams.length) { queueMicrotask(() => setSpeaking(s => (s.size ? new Set() : s))); return; }
    const ctx = new AudioContext();
    const meters = audioStreams.map(({ userId, stream }) => {
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(analyser);
      return { userId, analyser, data: new Uint8Array(analyser.fftSize) };
    });
    const timer = setInterval(() => {
      const next = new Set<string>();
      for (const m of meters) {
        m.analyser.getByteTimeDomainData(m.data);
        let sum = 0;
        for (const v of m.data) sum += (v - 128) * (v - 128);
        if (Math.sqrt(sum / m.data.length) > 6) next.add(m.userId);
      }
      setSpeaking(prev => (prev.size === next.size && [...next].every(id => prev.has(id)) ? prev : next));
    }, 300);
    return () => { clearInterval(timer); void ctx.close(); };
  }, [audioStreams]);

  // Yozuv: barcha ovozlar (va moderatorning o'z mikrofoni) bitta faylga.
  const recStreams = useMemo(() => [...remote.filter(r => r.kind === "audio").map(r => r.stream), ...(local.audio ? [local.audio] : [])], [remote, local.audio]);
  useEffect(() => {
    const r = recorder.current;
    if (r) r.setStreams([...recStreams, ...(recOnlyMic.current && !local.audio ? [recOnlyMic.current] : [])]);
  }, [recStreams, local.audio, rec]);
  useEffect(() => {
    if (rec === "idle") return;
    const t = setInterval(() => setRecElapsed(recorder.current?.elapsed() ?? 0), 500);
    return () => clearInterval(t);
  }, [rec]);

  const recStart = useCallback(() => guard(async () => {
    if (typeof MediaRecorder === "undefined") throw Error("Bu brauzer yozib olishni qo'llamaydi.");
    // Ovoz serveri bo'lmasa ham moderator o'z ovozini yozib oladi.
    if (!local.audio && !recOnlyMic.current) recOnlyMic.current = await navigator.mediaDevices.getUserMedia({ audio: MIC_CONSTRAINTS });
    const r = new TalkRecorder();
    r.setStreams([...recStreams, ...(recOnlyMic.current && !local.audio ? [recOnlyMic.current] : [])]);
    r.start();
    recorder.current = r;
    setRec("recording");
    setRecElapsed(0);
    await act("recording", { state: 1 });
  }), [guard, local.audio, recStreams, act]);

  const recPause = useCallback(() => { recorder.current?.pause(); setRec("paused"); void act("recording", { state: 2 }); }, [act]);
  const recResume = useCallback(() => { recorder.current?.resume(); setRec("recording"); void act("recording", { state: 1 }); }, [act]);
  const recStop = useCallback(async () => {
    const r = recorder.current;
    if (!r) return;
    recorder.current = null;
    const blob = await r.stop();
    recOnlyMic.current?.getTracks().forEach(t => t.stop());
    recOnlyMic.current = null;
    setRec("idle");
    void act("recording", { state: 0 });
    setPending({ blob, ext: r.extension });
  }, [act]);

  const savePending = useCallback(async (name: string) => {
    if (!pending) return;
    const ok = await saveRecording(pending.blob, name.trim() || "Bir-Ilm-efir", pending.ext);
    if (ok) { setPending(null); toast.success("Yozuv saqlandi"); }
  }, [pending]);
  const discardPending = useCallback(() => setPending(null), []);

  return {
    status, local, remote, micOn, saver, setSaver, speaking,
    toggleMic, toggleCam, toggleScreen,
    rec, recElapsed, recStart, recPause, recResume, recStop, pending, savePending, discardPending,
  };
}

export const isOnStage = (p: TalkParticipant) => p.role !== "listener";
