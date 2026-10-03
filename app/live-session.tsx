"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  Camera,
  CameraOff,
  CircleDot,
  Hand,
  LogOut,
  MessageCircle,
  Mic,
  MicOff,
  MonitorUp,
  Pause,
  Play,
  Send,
  ShieldCheck,
  Square,
  Trash2,
  UserMinus,
  Users,
  Volume2,
  X,
} from "lucide-react";
import type { Track } from "livekit-client";
import { useLiveMedia } from "@/lib/api/live-media";
import {
  LiveClient,
  fetchLiveSessions,
  createLiveSession,
  type LiveConnectionState,
} from "@/lib/api/live-client";
import { useViewer } from "@/lib/api/roles-client";
import { RoomRecorder, recordingSupported, saveRecordingFile } from "@/lib/api/live-recorder";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import LoginCard from "./login-card";
import TalksBoard from "./talks-board";
import { TALKS_CHANGED, notifyTalksChanged, talkAnnouncement } from "./talk-format";
import { useCatalog } from "@/lib/api/books-client";
import type {
  LiveSession as LiveSessionType,
  LiveParticipant,
  LiveMessage,
  LiveMedia,
} from "@/shared/contract/live";
import { canModerate, type UserRole } from "@/shared/contract/roles";

function timeStr(iso: string) {
  return new Date(iso).toLocaleTimeString("uz-UZ", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Naqsh ranglari: oq harf bilan kontrasti yetarli (WCAG AA), efir foniga mos.
const AVATAR_COLORS = [
  "#2c4398", "#0d7a79", "#b83a2f", "#a8741a",
  "#5b4a8b", "#0b6a68", "#8e3b34", "#3b5bb5",
  "#7a5a0c", "#2f6f8f", "#7d3c98", "#1e2f6e",
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={`live-avatar-circle ${className ?? ""}`}
      style={{ background: avatarColor(name) }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

function VideoTrackView({ track, mirror = false, fit = "cover" }: { track: Track; mirror?: boolean; fit?: "cover" | "contain" }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);
  return (
    <video
      ref={ref}
      className="live-video-el"
      autoPlay
      playsInline
      muted
      style={{ objectFit: fit, transform: mirror ? "scaleX(-1)" : undefined }}
    />
  );
}

type Me = { userId: string; role: UserRole };

// Qaysi suhbatda ekanimiz: sahifa yangilansa yoki yopilib qayta ochilsa, o'sha suhbatga qaytamiz.
const ACTIVE_KEY = "bir-live-active";
function rememberActive(id: string | null) {
  try { if (id) localStorage.setItem(ACTIVE_KEY, id); else localStorage.removeItem(ACTIVE_KEY); } catch { /* shaxsiy rejim */ }
}
function readActive(): string | null {
  try { return localStorage.getItem(ACTIVE_KEY); } catch { return null; }
}

// ── Main Component ──────────────────────────────────────────────────

export default function LiveSession({
  name,
  onComments,
}: {
  name: string;
  date: number;
  onComments: () => void;
}) {
  const viewer = useViewer();
  const isAdmin = viewer?.role === "admin";
  // Viewer yuklanguncha tugmani bloklamaymiz; server baribir tekshiradi.
  const signedIn = viewer?.signedIn ?? true;

  const [sessions, setSessions] = useState<LiveSessionType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [listNotice, setListNotice] = useState("");

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [connState, setConnState] = useState<LiveConnectionState>("idle");
  const [sessionData, setSessionData] = useState<LiveSessionType | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [participants, setParticipants] = useState<LiveParticipant[]>([]);
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [participantCount, setParticipantCount] = useState(0);
  const [handRaised, setHandRaised] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [selected, setSelected] = useState<LiveParticipant | null>(null);
  const [notice, setNotice] = useState("");
  const [media, setMedia] = useState<LiveMedia | null>(null);
  const [minimized, setMinimized] = useState(false);
  const rejoinTried = useRef(false);
  // Yozib olish adminning brauzerida ishlaydi va suhbatdan mustaqil: o'z tugmasi bilan boshlanadi/tugaydi.
  const recorderRef = useRef<RoomRecorder | null>(null);
  // Suhbat tugagan, lekin yozuv hali ketyapti: yozuv tugagach ovoz ulanishi yopiladi.
  const endedRef = useRef(false);
  const [recBusy, setRecBusy] = useState(false);
  const [recPaused, setRecPaused] = useState(false);
  /** Yozuv aynan shu brauzerda ketyaptimi (pauza va vaqt faqat yozayotgan adminda). */
  const [ownRecording, setOwnRecording] = useState(false);
  const [recElapsed, setRecElapsed] = useState(0);
  /** To'xtatilgan yozuvning mahalliy nusxasi — admin uni faylga saqlaydi. */
  const [recFile, setRecFile] = useState<{ blob: Blob; extension: string; name: string } | null>(null);

  const av = useLiveMedia(activeSessionId ? media : null, setNotice);
  const sharerId = av.screenSharer?.userId ?? null;

  const clientRef = useRef<LiveClient | null>(null);
  const meRef = useRef<Me | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    const list = await fetchLiveSessions();
    setSessions(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    queueMicrotask(() => void loadSessions());
    // Kitob oynasidan yoki boshqa joydan suhbat qo'shilsa/o'chirilsa — ro'yxat yangilanadi.
    window.addEventListener(TALKS_CHANGED, loadSessions);
    return () => window.removeEventListener(TALKS_CHANGED, loadSessions);
  }, [loadSessions]);

  useEffect(() => {
    if (loading || !viewer || rejoinTried.current || activeSessionId) return;
    rejoinTried.current = true;
    const saved = readActive();
    const session = saved ? sessions.find((s) => s.id === saved) : null;
    if (session && session.status === "live" && viewer.signedIn) joinSession(session.id);
    else if (saved) rememberActive(null);
    // joinSession barqaror emas, lekin bu effekt faqat bir marta ishlaydi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, viewer, sessions, activeSessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    return () => {
      void recorderRef.current?.stop();
      clientRef.current?.dispose();
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  function joinSession(sessionId: string) {
    clientRef.current?.dispose();
    const client = new LiveClient();
    clientRef.current = client;

    setActiveSessionId(sessionId);
    rememberActive(sessionId);
    setMinimized(false);
    setListNotice("");
    setMessages([]);
    setParticipants([]);
    setCommentsOpen(false);
    endedRef.current = false;
    setSelected(null);
    setHandRaised(false);
    setMedia(null);

    // Server qo'shilishni rad etsa (suhbat yo'q, login kerak), xona ochiq qolib ketmasin.
    let joined = false;
    client.on("state", setConnState);

    client.on("joined", (data) => {
      joined = true;
      setMedia(data.media);
      setSessionData(data.session);
      setParticipants(data.participants);
      setMessages(data.recentMessages);
      setParticipantCount(data.session.participantCount);
      meRef.current = data.you;
      setMe(data.you);
    });

    client.on("chat", (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    client.on("message_deleted", ({ messageId }) => {
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    });

    client.on("participant_joined", ({ participant, count }) => {
      setParticipants((prev) => {
        const exists = prev.some((p) => p.userId === participant.userId);
        return exists ? prev : [...prev, participant];
      });
      setParticipantCount(count);
    });

    client.on("participant_left", ({ userId, count }) => {
      setParticipants((prev) => prev.filter((p) => p.userId !== userId));
      setSelected((prev) => (prev?.userId === userId ? null : prev));
      setParticipantCount(count);
    });

    client.on("hand_update", ({ userId, raised }) => {
      setParticipants((prev) =>
        prev.map((p) =>
          p.userId === userId ? { ...p, handRaised: raised } : p,
        ),
      );
    });

    client.on("role_update", ({ userId, role }) => {
      setParticipants((prev) =>
        prev.map((p) =>
          p.userId === userId
            ? { ...p, role: role as LiveParticipant["role"], handRaised: false }
            : p,
        ),
      );
      if (meRef.current?.userId === userId) {
        setHandRaised(false);
        setNotice(role === "speaker" ? "Sizga so'z berildi" : "So'z navbatingiz tugadi");
      }
    });

    client.on("session_started", ({ startedAt }) => {
      setSessionData((prev) =>
        prev ? { ...prev, status: "live", startedAt } : prev,
      );
      setNotice("Suhbat boshlandi");
    });

    client.on("recording", ({ active, paused }) => {
      setSessionData((prev) => (prev ? { ...prev, recording: active } : prev));
      setRecPaused(active && paused);
      // Boshqa admin to'xtatgan bo'lsa, shu brauzerdagi yozuvni ham yakunlaymiz.
      if (!active && recorderRef.current) void finishRecording(false);
      setNotice(active ? (paused ? "Yozuv pauzada" : "Suhbat yozib olinmoqda") : "Yozib olish to'xtatildi");
    });

    client.on("session_ended", ({ endedAt }) => {
      setSessionData((prev) =>
        prev ? { ...prev, status: "ended", endedAt } : prev,
      );
      // Yozayotgan adminning ovoz ulanishi yozuv tugaguncha saqlanadi.
      endedRef.current = true;
      if (!recorderRef.current) {
        setMedia(null);
        rememberActive(null);
      }
    });

    client.on("kicked", (reason) => {
      if (recorderRef.current) void finishRecording(false);
      rememberActive(null);
      setMinimized(false);
      setActiveSessionId(null);
      setSessionData(null);
      setMedia(null);
      setListNotice(reason === "replaced" ? "Hisobingiz boshqa qurilmadan kirdi — bu qurilmada suhbat yopildi." : "Moderator sizni suhbatdan chiqardi.");
      loadSessions();
    });

    client.on("error", (msg) => {
      if (!joined) {
        leaveSession();
        setListNotice(msg);
        return;
      }
      setNotice(msg);
    });

    client.join(sessionId);
  }

  async function startRecording() {
    if (recorderRef.current || recBusy || !activeSessionId) return;
    if (!av.room || av.status !== "connected") {
      setNotice("Ovoz serveriga ulanilmagan — yozib bo'lmaydi.");
      return;
    }
    if (!recordingSupported()) {
      setNotice("Bu brauzer yozib olishni qo'llab-quvvatlamaydi.");
      return;
    }
    setRecBusy(true);
    const recorder = new RoomRecorder(av.room, activeSessionId, setNotice);
    try {
      await recorder.start();
      recorderRef.current = recorder;
      setOwnRecording(true);
      setRecElapsed(0);
      clientRef.current?.setRecording(true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Yozib olishni boshlab bo'lmadi.");
    } finally {
      setRecBusy(false);
    }
  }

  /** Pauza: yozuv to'xtaydi, lekin fayl yopilmaydi — «Davom ettirish» o'sha faylga qo'shadi. */
  function toggleRecordingPause() {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recorder.paused) recorder.resume();
    else recorder.pause();
    setRecPaused(recorder.paused);
    clientRef.current?.setRecording(true, recorder.paused);
  }

  /** `announce` — boshqalarga «yozuv to'xtadi» deb xabar berish (server orqali). */
  async function finishRecording(announce = true) {
    const recorder = recorderRef.current;
    if (announce) clientRef.current?.setRecording(false);
    if (!recorder) return;
    recorderRef.current = null;
    setOwnRecording(false);
    setRecBusy(true);
    await recorder.stop();
    setRecBusy(false);
    setRecPaused(false);
    if (endedRef.current) { setMedia(null); rememberActive(null); }
    setNotice("Yozuv serverda saqlandi. Nusxasini kompyuteringizga ham saqlashingiz mumkin.");
    const file = recorder.file();
    if (file.blob.size) {
      const day = new Date().toISOString().slice(0, 10);
      const title = (sessionData?.bookTitle ?? "suhbat").replace(/\s+/g, "-");
      setRecFile({ ...file, name: `Bir-Ilm-${title}-${day}` });
    }
  }

  /** Suhbatni tugatish. Yozuv ketayotgan bo'lsa, u ham to'xtashi kerak (xona yopiladi) — avval so'raymiz. */
  async function endTalk() {
    // Yozuv suhbatdan mustaqil: suhbat tugaydi, yozuv esa «Yozuvni to'xtatish» bosilguncha davom etadi.
    if (recorderRef.current && !window.confirm("Suhbat tugaydi, lekin yozuv davom etadi. Yozuvni alohida «Yozuvni to'xtatish» tugmasi bilan to'xtatasiz. Davom etasizmi?")) return;
    clientRef.current?.endSession();
  }

  function leaveSession() {
    if (recorderRef.current) void finishRecording();
    rememberActive(null);
    setMinimized(false);
    clientRef.current?.leave();
    setActiveSessionId(null);
    setSessionData(null);
    setMe(null);
    setMedia(null);
    setConnState("idle");
    loadSessions();
  }

  function sendComment() {
    const body = draft.trim();
    if (!body) return;
    clientRef.current?.sendChat(body);
    setDraft("");
  }

  function toggleHand() {
    const next = !handRaised;
    setHandRaised(next);
    clientRef.current?.toggleHand(next);
  }

  function modAction(action: "grant" | "revoke" | "kick", target: LiveParticipant) {
    const client = clientRef.current;
    if (!client) return;
    if (action === "grant") client.grantSpeaker(target.userId);
    if (action === "revoke") client.revokeSpeaker(target.userId);
    if (action === "kick") client.kick(target.userId);
    setSelected(null);
  }

  const canMod = canModerate(me?.role);
  const roomAdmin = me?.role === "admin";
  const status = sessionData?.status ?? "planned";
  const sharerName = sharerId ? participants.find((p) => p.userId === sharerId)?.name ?? "Qatnashchi" : null;

  const allParticipants = participants;
  // Sahna o'zi paydo bo'ladi: taqdimot bo'lsa ekran, kamera yoqilgan bo'lsa videolar, aks holda faqat ovozli ro'yxat.
  const cameraPeople = participants.filter((p) => av.byUser(p.userId).camera);
  const stage: "screen" | "cameras" | null = sharerId ? "screen" : cameraPeople.length > 0 ? "cameras" : null;
  const cameraTile = (p: LiveParticipant) => {
    const m = av.byUser(p.userId);
    return (
      <div
        key={p.userId}
        className={`live-video-tile${m.speaking ? " speaking" : ""}${selectable(p) ? " selectable" : ""}`}
        onClick={() => pick(p)}
      >
        {m.camera && <VideoTrackView track={m.camera} mirror={p.userId === me?.userId} />}
        <div className="live-video-label">
          <strong>{p.name}{p.userId === me?.userId ? " (siz)" : ""}</strong>
          {m.speaking ? <span className="live-level">▂▅▃</span> : m.micOn ? <Mic size={14} /> : <MicOff size={14} />}
        </div>
      </div>
    );
  };
  const speakers = allParticipants.filter((p) => p.role !== "listener");
  const listenersList = allParticipants.filter((p) => p.role === "listener");
  const handQueue = listenersList.filter((p) => p.handRaised);

  // Faqat moderator boshqa qatnashchini tanlay oladi (o'zini emas).
  const selectable = (p: LiveParticipant) => canMod && p.userId !== me?.userId;
  const pick = (p: LiveParticipant) => selectable(p) && setSelected(p);

  // Tinglovchi so'z berilmaguncha mikrofon, kamera va ekranni yoqa olmaydi (ruxsat LiveKit serverida).
  const publishLocked = av.status !== "connected" || !av.canPublish;
  const lockedHint = av.status !== "connected" ? "Ovoz/video serveriga ulanilmagan" : "So'z berilganda yoqiladi";
  const recording = Boolean(sessionData?.recording);
  const controls: Array<{ label: string; icon: typeof Mic; active: boolean; disabled: boolean; pending: boolean; action: () => unknown; hint?: string; tool?: boolean }> = [
    { label: "Mikrofon", icon: av.micOn ? Mic : MicOff, active: av.micOn, disabled: publishLocked, pending: av.busy === "mic", action: av.toggleMic },
    { label: "Kamera", icon: av.cameraOn ? Camera : CameraOff, active: av.cameraOn, disabled: publishLocked, pending: av.busy === "camera", action: av.toggleCamera },
    { label: "Ekran ulashish", icon: MonitorUp, active: av.screenOn, disabled: publishLocked, pending: av.busy === "screen", action: av.toggleScreen },
    ...(canMod
      ? []
      : [{ label: "Qo'l ko'tarish", icon: Hand, active: handRaised, disabled: false, pending: false, action: toggleHand }]),
    { label: "Izohlar", icon: MessageCircle, active: commentsOpen, disabled: false, pending: false, action: () => setCommentsOpen(!commentsOpen) },
    ...(roomAdmin
      ? [{
          label: recording ? "Yozuvni to'xtatish" : "Yozib olish",
          icon: CircleDot,
          active: recording,
          disabled: status === "planned" || av.status !== "connected",
          pending: recBusy,
          action: () => (recording ? finishRecording() : startRecording()),
          hint: status === "planned" ? "Suhbat boshlangach yozib olinadi" : "Ovoz serveriga ulanilmagan",
          tool: true,
        }]
      : []),
    ...(roomAdmin && recording && ownRecording
      ? [{
          label: recPaused ? "Davom ettirish" : "Pauza",
          icon: recPaused ? Play : Pause,
          active: recPaused,
          disabled: recBusy,
          pending: false,
          action: toggleRecordingPause,
          tool: true,
        }]
      : []),
  ];

  // Admin ekranida yozuv vaqti (pauzalarsiz).
  useEffect(() => {
    if (!recording || !ownRecording) return;
    const timer = setInterval(() => setRecElapsed(recorderRef.current?.elapsed() ?? 0), 500);
    return () => clearInterval(timer);
  }, [recording, ownRecording]);

  // ── Active session overlay ─────────────────────────────────────────

  const roomOpen = Boolean(activeSessionId && connState !== "idle");
  let overlay: React.ReactNode = null;
  if (roomOpen && !minimized) {
    const bookTitle = sessionData?.bookTitle ?? "Yuklanmoqda...";
    const sessionTitle = sessionData?.title ?? "";

    overlay = createPortal(
      <div className="live-overlay" role="dialog" aria-modal="true" aria-label={`${bookTitle} jonli suhbat`}>
        <div className="live-window">
          <header className="live-topbar">
            <div className="live-topbar-main">
              <button className="live-plain-btn" aria-label="Suhbat oynasini kichraytirish" title="Kichraytirish — suhbatda qolasiz" onClick={() => setMinimized(true)}>
                <ArrowLeft size={22} />
              </button>
              <div className="live-room-title">
                <strong>{bookTitle}</strong>
                <span>{sessionTitle}</span>
              </div>
              <span className="live-count" title="Qatnashchilar soni"><Users size={15} /> {participantCount}</span>
            </div>
            <div className="live-status-row">
              {status === "live" && (
                <span className="live-indicator"><i /> LIVE</span>
              )}
              {status === "ended" && <span className="live-ended-chip">Tugagan</span>}
              {recording && (
                <span className={`live-rec${recPaused ? " paused" : ""}`} title={recPaused ? "Yozuv pauzada" : "Suhbat yozib olinmoqda"}>
                  <i /> {recPaused ? "PAUZA" : "REC"}{ownRecording ? ` ${clockOf(recElapsed)}` : ""}
                </span>
              )}
              {handQueue.length > 0 && (
                <span className="live-hand-chip" title="Qo'l ko'targanlar"><Hand size={13} /> {handQueue.length}</span>
              )}
              <span
                className={`live-media-pill media-${media ? av.status : "none"}`}
                title={!media ? "Ovoz va video serveri sozlanmagan — faqat izohlar ishlaydi." : av.status === "connected" ? (av.canPublish ? "Ovoz/video ulangan." : "Ovoz/video ulangan. Gapirish uchun qo'l ko'taring.") : av.status === "error" ? "Ovoz/video serveriga ulanib bo'lmadi." : "Ovoz/video ulanmoqda…"}
              >
                <i />{!media ? "Faqat izohlar" : av.status === "connected" ? "Ovoz ulangan" : av.status === "error" ? "Ovoz uzildi" : "Ulanmoqda…"}
              </span>
              <span className="live-status-spacer" />
              {roomAdmin && status === "live" && (
                <button className="live-admin-btn end" onClick={() => void endTalk()}>
                  <Square size={12} /> Tugatish
                </button>
              )}
            </div>
          </header>

          {connState === "joined" && status === "ended" && (
            <div className="live-status-banner ended">Suhbat tugadi. Izohlarni o&apos;qishingiz mumkin.</div>
          )}
          <div className="live-main">
            {/* Ulanmoqda / Xatolik */}
            {connState === "connecting" && (
              <div className="live-audio-view">
                <p className="muted" style={{ textAlign: "center", padding: "3rem" }}>
                  Ulanmoqda...
                </p>
              </div>
            )}
            {connState === "error" && (
              <div className="live-audio-view">
                <p className="muted" style={{ textAlign: "center", padding: "3rem", color: "#e5484d" }}>
                  Ulanish uzildi. Qayta ulanmoqda...
                </p>
              </div>
            )}

            {/* ── Yagona xona: ovozli asos + kerak bo'lsa video/taqdimot sahnasi ── */}
            {connState === "joined" && (
              <div className={`live-room${stage ? " has-stage" : ""}`}>
                {stage === "screen" && av.screenSharer && (
                  <section className="live-stage live-stage-screen">
                    <div className="live-share-banner">
                      <MonitorUp size={17} />
                      {sharerName && <Avatar name={sharerName} />}
                      {sharerName} ekranini ulashmoqda
                    </div>
                    <div className="live-shared-screen">
                      <VideoTrackView track={av.screenSharer.track} fit="contain" />
                    </div>
                    {cameraPeople.length > 0 && (
                      <div className="live-camera-strip">
                        {cameraPeople.map(cameraTile)}
                      </div>
                    )}
                  </section>
                )}

                {stage === "cameras" && (
                  <section className="live-camera-strip live-camera-row" aria-label="Video yoqqanlar">
                    {cameraPeople.map(cameraTile)}
                  </section>
                )}

                <section className="live-roster">
                  {handQueue.length > 0 && (
                    <div className="live-hands" aria-label="Qo'l ko'targanlar">
                      <h3><Hand size={14} /> Qo&apos;l ko&apos;targanlar ({handQueue.length})</h3>
                      <div className="live-strip">
                        {handQueue.map((p) => (
                          <div key={p.userId} className="live-chip is-hand">
                            <Avatar name={p.name} />
                            <strong>{p.userId === me?.userId ? "Siz" : p.name}</strong>
                            {canMod && <button type="button" onClick={() => modAction("grant", p)}>So&apos;z berish</button>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <h3>Qatnashchilar ({allParticipants.length})</h3>
                  {allParticipants.length === 0 && <p className="live-empty">Hozircha hech kim yo&apos;q</p>}
                  <div className="live-strip" role="list">
                    {[...speakers, ...listenersList].filter((p) => !av.byUser(p.userId).camera).map((p) => {
                      const m = av.byUser(p.userId);
                      const host = p.role === "moderator";
                      return (
                        <div
                          key={p.userId}
                          role="listitem"
                          onClick={() => pick(p)}
                          className={`live-chip${p.role !== "listener" ? " is-speaker" : ""}${m.speaking ? " speaking" : ""}${p.handRaised ? " has-hand" : ""}${selectable(p) ? " selectable" : ""}`}
                          title={`${p.name}${host ? " · boshlovchi" : p.role === "speaker" ? " · so'zlovchi" : ""}${p.handRaised ? " · qo'l ko'targan" : ""}`}
                        >
                          <span className="live-chip-avatar">
                            <Avatar name={p.name} />
                            {p.handRaised && <i className="live-hand-badge" aria-label="Qo'l ko'targan"><Hand size={11} /></i>}
                            {!m.micOn && p.role !== "listener" && <i className="live-mic-badge" aria-label="Mikrofon o'chiq"><MicOff size={10} /></i>}
                          </span>
                          <strong>{p.userId === me?.userId ? "Siz" : p.name}</strong>
                          {host && <small>Boshlovchi</small>}
                        </div>
                      );
                    })}
                  </div>
                  {!canMod && (
                    <span className="live-queue">
                      <Hand size={14} /> {handRaised ? "Navbatdasiz" : "Qo'l ko'tarib navbatga turing"}
                    </span>
                  )}
                </section>
              </div>
            )}

            {/* ── Izohlar paneli ── */}
            {commentsOpen && (
              <aside className="live-comments">
                <div className="live-comments-head">
                  <strong>Jonli izohlar</strong>
                  <button className="live-plain-btn" aria-label="Izohlarni yopish" onClick={() => setCommentsOpen(false)}>
                    <X size={20} />
                  </button>
                </div>
                <div className="live-comment-list">
                  {messages.length === 0 && (
                    <p className="muted" style={{ textAlign: "center", padding: "2rem", fontSize: 13 }}>
                      Hali izohlar yo&apos;q. Birinchi bo&apos;ling!
                    </p>
                  )}
                  {messages.map((msg) => (
                    <div className="live-comment" key={msg.id}>
                      <Avatar name={msg.userName} />
                      <div>
                        <strong>{msg.userName}</strong>
                        <time>{timeStr(msg.createdAt)}</time>
                        <p>{msg.body}</p>
                      </div>
                      {canMod && (
                        <button
                          className="live-comment-delete"
                          aria-label="Izohni o'chirish"
                          title="Izohni o'chirish"
                          onClick={() => clientRef.current?.deleteMessage(msg.id)}
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
                {status === "ended" ? (
                  <p className="live-comments-closed">Suhbat tugagan — izoh yozib bo&apos;lmaydi.</p>
                ) : (
                  <form className="live-comment-form" onSubmit={(e) => { e.preventDefault(); sendComment(); }}>
                    <input
                      aria-label="Izoh yozing"
                      placeholder="Izoh yozing..."
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      maxLength={500}
                    />
                    <button aria-label="Izoh yuborish" disabled={!draft.trim()}>
                      <Send size={18} />
                    </button>
                  </form>
                )}
              </aside>
            )}

            {/* ── Moderator: qatnashchi bilan amallar ── */}
            {selected && (
              <div className="live-sheet-backdrop" onClick={() => setSelected(null)}>
                <div className="live-sheet" role="dialog" aria-label={`${selected.name} bilan amallar`} onClick={(e) => e.stopPropagation()}>
                  <div className="live-sheet-head">
                    <Avatar name={selected.name} />
                    <div>
                      <strong>{selected.name}</strong>
                      <small>
                        {selected.role === "moderator" ? "Boshlovchi" : selected.role === "speaker" ? "So'zlovchi" : "Tinglovchi"}
                        {selected.handRaised ? " · qo'l ko'targan" : ""}
                      </small>
                    </div>
                  </div>
                  {selected.role === "listener" && (
                    <button onClick={() => modAction("grant", selected)}><Mic size={17} /> So&apos;z berish</button>
                  )}
                  {selected.role === "speaker" && (
                    <button onClick={() => modAction("revoke", selected)}><MicOff size={17} /> So&apos;zni olish</button>
                  )}
                  {selected.role !== "moderator" && (
                    <button className="danger" onClick={() => modAction("kick", selected)}><UserMinus size={17} /> Suhbatdan chiqarish</button>
                  )}
                  <button className="ghost" onClick={() => setSelected(null)}>Bekor qilish</button>
                </div>
              </div>
            )}

            {av.audioBlocked && (
              <button className="live-audio-unlock" onClick={av.startAudio}>
                <Volume2 size={16} /> Ovozni eshitish uchun bosing
              </button>
            )}
            {notice && <div className="live-toast" role="status">{notice}</div>}
          </div>

          {/* ── Boshqaruv paneli ── */}
          {controls.some((c) => c.tool) && (
            <div className="live-tools" role="toolbar" aria-label="Qo'shimcha amallar">
              {controls.filter((c) => c.tool).map(({ label, icon: Icon, active, disabled, pending, action, hint }) => (
                <button
                  key={label}
                  type="button"
                  className={`${active ? "active" : ""}${pending ? " pending" : ""}`}
                  onClick={action}
                  disabled={disabled || pending}
                  aria-busy={pending}
                  title={disabled ? hint ?? lockedHint : label}
                >
                  <Icon size={16} />{label}
                </button>
              ))}
            </div>
          )}
          <footer className="live-controls">
            <div className="live-control-actions">
              {controls.filter((c) => !c.tool).map(({ label, icon: Icon, active, disabled, pending, action, hint }) => (
                <button
                  className={`${active ? "active" : ""}${pending ? " pending" : ""}`}
                  key={label}
                  onClick={action}
                  disabled={disabled || pending}
                  aria-label={label}
                  aria-busy={pending}
                  title={disabled ? hint ?? lockedHint : pending ? "Yoqilmoqda…" : label}
                >
                  <span><Icon size={21} /></span>
                  <small>{label}</small>
                </button>
              ))}
              <button className="live-hangup" onClick={leaveSession} aria-label="Suhbatdan chiqish" title="Suhbatdan chiqish">
                <span><LogOut size={21} /></span>
                <small>Chiqish</small>
              </button>
            </div>
          </footer>
        </div>
      </div>
      , document.body);
  }

  const miniBar = roomOpen && minimized ? createPortal(
    <div className="live-minibar" role="status">
      <button type="button" className="live-minibar-open" onClick={() => setMinimized(false)}>
        <span className="live-minibar-dot" aria-hidden="true" />
        <span><strong>{sessionData?.bookTitle ?? "Jonli suhbat"}</strong><small>{av.micOn ? "Mikrofon yoqiq · " : ""}Qaytish uchun bosing</small></span>
      </button>
      <button type="button" className="live-minibar-mic" aria-label={av.micOn ? "Mikrofonni o'chirish" : "Mikrofonni yoqish"} disabled={!av.canPublish} onClick={av.toggleMic}>{av.micOn ? <Mic size={18} /> : <MicOff size={18} />}</button>
      <button type="button" className="live-minibar-leave" aria-label="Suhbatdan chiqish" onClick={leaveSession}><LogOut size={18} /></button>
    </div>,
    document.body,
  ) : null;

  // ── Suhbatlar ro'yxati ─────────────────────────────────────────────

  return (
    <>
      <TalksBoard
        sessions={sessions}
        loading={loading}
        signedIn={signedIn}
        isAdmin={isAdmin}
        userId={viewer?.userId ?? null}
        notice={listNotice}
        staff={canModerate(viewer?.role)}
        onJoin={joinSession}
        onChange={(next) => setSessions((prev) => prev.map((s) => (s.id === next.id ? next : s)))}
        onRemove={(id) => setSessions((prev) => prev.filter((s) => s.id !== id))}
        onCreate={() => setShowCreate(true)}
        onShare={onComments}
        login={viewer && !viewer.signedIn && (
          <LoginCard viewer={viewer} title="Suhbatga qo'shilish uchun kiring" text="Jonli suhbatlarda faqat ro'yxatdan o'tgan kitobxonlar qatnashadi. Email, Google yoki Telegram orqali kiring, yoki boshqa qurilmangizdagi kodni kiriting." />
        )}
      />

      {showCreate && isAdmin && (
        <CreateSessionDialog
          name={name}
          onClose={() => setShowCreate(false)}
          onCreated={(s) => {
            setShowCreate(false);
            setSessions((prev) => [s, ...prev]);
          }}
        />
      )}
      {overlay}
      {miniBar}
      {recFile && <SaveRecordingDialog file={recFile} onClose={() => setRecFile(null)} />}
    </>
  );
}

// ── Yangi suhbat yaratish dialogi (faqat admin) ─────────────────────

function toLocalInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function CreateSessionDialog({
  onClose,
  onCreated,
}: {
  name: string;
  onClose: () => void;
  onCreated: (s: LiveSessionType) => void;
}) {
  const [bookTitle, setBookTitle] = useState("");
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState(() => toLocalInput(new Date()));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [announce, setAnnounce] = useState(true);
  const catalog = useCatalog();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!bookTitle.trim() || !title.trim()) return;

    setSubmitting(true);
    setError("");

    const scheduled = new Date(when);
    const session = await createLiveSession({
      bookTitle: bookTitle.trim(),
      title: title.trim(),
      scheduledAt: scheduled.toISOString(),
      announcement: announce ? talkAnnouncement(bookTitle.trim(), title.trim(), scheduled) : undefined,
    });
    if (session) notifyTalksChanged();

    setSubmitting(false);

    if (session) {
      onCreated(session);
    } else {
      setError("Suhbat yaratib bo'lmadi. Qayta urinib ko'ring.");
    }
  }

  const fieldStyle = { padding: "0.5rem 0.75rem", borderRadius: 8, border: "1px solid var(--border)", fontSize: "0.9rem" };
  const labelStyle = { display: "flex", flexDirection: "column" as const, gap: "0.25rem" };

  return (
    <div className="live-overlay" role="dialog" aria-modal="true">
      <div className="live-window" style={{ maxWidth: 420 }}>
        <header className="live-topbar">
          <button className="live-plain-btn" aria-label="Yopish" onClick={onClose}>
            <ArrowLeft size={22} />
          </button>
          <div className="live-room-title">
            <strong>Yangi suhbat</strong>
            <span>Faqat admin e&apos;lon qiladi</span>
          </div>
        </header>
        <form
          onSubmit={handleSubmit}
          style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}
        >
          <label style={labelStyle}>
            <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>Kitob nomi</span>
            <input value={bookTitle} onChange={(e) => setBookTitle(e.target.value)} placeholder="Kutubxonadan tanlang yoki yozing" list="talk-books" maxLength={160} required style={fieldStyle} />
            <datalist id="talk-books">
              {catalog.items.map((b) => <option key={b.id} value={b.title} />)}
            </datalist>
          </label>
          <label style={labelStyle}>
            <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>Suhbat sarlavhasi</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Birga tahlil qilamiz" maxLength={200} required style={fieldStyle} />
          </label>
          <label style={labelStyle}>
            <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>Qachon</span>
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required style={fieldStyle} />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem" }}>
            <input type="checkbox" checked={announce} onChange={(e) => setAnnounce(e.target.checked)} style={{ width: 18, height: 18 }} />
            Bosh sahifada e&apos;lon qilish (yangiliklar va qo&apos;ng&apos;iroqcha)
          </label>
          {error && <p style={{ color: "#e5484d", fontSize: "0.85rem" }}>{error}</p>}
          <button className="button" type="submit" disabled={submitting}>
            {submitting ? "Yaratilmoqda..." : "E'lon qilish"}
          </button>
        </form>
      </div>
    </div>
  );
}

const clockOf = (ms: number) => {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const sec = String(total % 60).padStart(2, "0");
  return h ? `${h}:${m}:${sec}` : `${m}:${sec}`;
};

/** To'xtatilgan yozuvni faylga saqlash: nomini admin yozadi, papkani tizim oynasida tanlaydi. */
function SaveRecordingDialog({ file, onClose }: { file: { blob: Blob; extension: string; name: string }; onClose: () => void }) {
  const [name, setName] = useState(file.name);
  const [busy, setBusy] = useState(false);
  const mb = (file.blob.size / (1024 * 1024)).toFixed(1);

  async function save() {
    setBusy(true);
    const saved = await saveRecordingFile(file.blob, name, file.extension);
    setBusy(false);
    if (saved) onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent className="app-dialog live-save">
        <DialogTitle>Yozuvni faylga saqlash</DialogTitle>
        <DialogDescription>Yozuv serverda ham saqlandi ({mb} MB). Kompyuteringizga nusxa olish uchun fayl nomini yozing — keyin qaysi papkaga saqlashni tanlaysiz.</DialogDescription>
        <label className="pw-field" htmlFor="rec-name">
          <span>Fayl nomi</span>
          <input id="rec-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </label>
        <small className="pw-hint">Fayl turi: .{file.extension} (Opus audio)</small>
        <div className="live-save-actions">
          <button type="button" className="button secondary" disabled={busy} onClick={onClose}>Keyinroq</button>
          <button type="button" className="button" disabled={busy || !name.trim()} onClick={() => void save()}>{busy ? "Saqlanmoqda…" : "Saqlash"}</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
