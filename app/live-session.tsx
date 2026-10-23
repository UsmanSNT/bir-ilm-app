"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  Camera,
  CameraOff,
  ChevronLeft,
  ChevronRight,
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
} from "lucide-react";
import type { Track } from "livekit-client";
import { useLiveMedia } from "@/lib/api/live-media";
import {
  LiveClient,
  fetchLiveSessions,
  type LiveConnectionState,
} from "@/lib/api/live-client";
import { useViewer } from "@/lib/api/roles-client";
import { RoomRecorder, recordingSupported, saveRecordingFile } from "@/lib/api/live-recorder";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { LoginDialog } from "./login-dialog";
import { Avatar } from "./live-avatar";
import TalkComments from "./talk-comments";
import TalksBoard from "./talks-board";
import { TALKS_CHANGED } from "./talk-format";
import {
  LIMITS_LIVE,
  type LiveSession as LiveSessionType,
  type LiveParticipant,
  type LiveMessage,
  type LiveMedia,
} from "@/shared/contract/live";
import { canModerate, type UserRole } from "@/shared/contract/roles";

/** Efirda bir vaqtda ko'rinadigan izohlar: eskilari tepada yo'qoladi, xona to'lib ketmaydi. */
const FLOAT_MAX = 6;

/**
 * Efirdagi izohlar (Instagram/TikTok live kabi): pastdan chiqadi, eskilari tepaga suriladi. Izohlar uchun
 * ko'rinmas, balandligi belgilangan joy ajratilgan: unga sig'magan eng eski izoh chegaradan chiqishi bilan
 * yo'qoladi (yarim kesilgan izoh ko'rinmaydi). Har izohning umri ham cheklangan — CSS animatsiyasi tugaganda
 * ro'yxatdan olinadi. Moderator izoh ustiga borsa oqim to'xtab turadi va izohni o'chira oladi.
 */
function FloatingComments({ items, myId, canDelete, onGone, onDelete }: {
  items: LiveMessage[];
  myId: string | null;
  canDelete: boolean;
  onGone: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  const areaRef = useRef<HTMLDivElement>(null);
  const stackRef = useRef<HTMLOListElement>(null);
  const onGoneRef = useRef(onGone);
  useLayoutEffect(() => {
    onGoneRef.current = onGone;
  });

  useEffect(() => {
    const area = areaRef.current;
    const stack = stackRef.current;
    if (!area || !stack) return;
    // ResizeObserver chizishdan oldin chaqiriladi: chegaradan chiqqan izoh shu kadrning o'zida yashiriladi.
    const trim = () => {
      const edge = area.getBoundingClientRect().top;
      for (const item of stack.children) {
        if (!(item instanceof HTMLElement)) continue;
        if (item.getBoundingClientRect().top >= edge - 0.5) break;
        if (item.dataset.gone) continue;
        item.dataset.gone = "1";
        onGoneRef.current(Number(item.dataset.id));
      }
    };
    const observer = new ResizeObserver(trim);
    observer.observe(area);
    observer.observe(stack);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={areaRef} className={`live-float${canDelete ? " can-moderate" : ""}`}>
      <ol ref={stackRef} className="live-float-stack" role="log" aria-live="polite" aria-label="Jonli izohlar">
        {items.map((msg) => (
          <li
            key={msg.id}
            data-id={msg.id}
            className={`live-float-item${msg.userId === myId ? " is-mine" : ""}`}
            onAnimationEnd={(e) => { if (e.animationName.startsWith("live-float-life")) onGone(msg.id); }}
          >
            <div className="live-float-bubble">
              <Avatar name={msg.userName} />
              <p><strong>{msg.userName}</strong> {msg.body}</p>
              {canDelete && (
                <button type="button" aria-label={`${msg.userName} izohini o‘chirish`} title="Izohni o‘chirish" onClick={() => onDelete(msg.id)}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
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
}: {
  name: string;
  date: number;
}) {
  const viewer = useViewer();
  const isAdmin = viewer?.role === "admin";
  // Viewer yuklanguncha tugmani bloklamaymiz; server baribir tekshiradi.
  const signedIn = viewer?.signedIn ?? true;
  const [loginOpen, setLoginOpen] = useState(false);

  const [sessions, setSessions] = useState<LiveSessionType[]>([]);
  const [loading, setLoading] = useState(true);
  const [listNotice, setListNotice] = useState("");

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [connState, setConnState] = useState<LiveConnectionState>("idle");
  const [sessionData, setSessionData] = useState<LiveSessionType | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [participants, setParticipants] = useState<LiveParticipant[]>([]);
  /** Hozir efirda suzib turgan izohlar (tarix saqlanmaydi). */
  const [floating, setFloating] = useState<LiveMessage[]>([]);
  const [participantCount, setParticipantCount] = useState(0);
  const [handRaised, setHandRaised] = useState(false);
  /** Qo'l ko'targanlar navbati — ko'tarilgan tartibda (shu qurilma ko'rgan tartib; kirishdan oldingilar boshida). */
  const [handOrder, setHandOrder] = useState<string[]>([]);
  /** Izohlar oqimi va yozish maydoni ko'rinadimi (foydalanuvchi o'zi yashira oladi). */
  const [commentsOn, setCommentsOn] = useState(true);
  /** Admin/moderator: tugagan suhbat izohlari oynasi. */
  const [archiveOpen, setArchiveOpen] = useState(false);
  /** Video yoki taqdimot yoqilganda qatnashchilar yon panelda: ochiq/yopiq. */
  const [peopleOpen, setPeopleOpen] = useState(false);
  /** O'zim yuborgan izohlar vaqti — server chegarasiga yetmasdan oldin yozilgan matn yo'qolmasin. */
  const sentAtRef = useRef<number[]>([]);
  const [draft, setDraft] = useState("");
  // Izoh yozilayotganda (klaviatura ochiq) boshqaruv tugmalari yashiriladi, faqat matn maydoni qoladi.
  const [typing, setTyping] = useState(false);
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
    return () => {
      void recorderRef.current?.stop();
      clientRef.current?.dispose();
    };
  }, []);

  // Yon panel Escape bilan yopiladi.
  useEffect(() => {
    if (!peopleOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setPeopleOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [peopleOpen]);

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
    setFloating([]);
    setArchiveOpen(false);
    setPeopleOpen(false);
    setParticipants([]);
    setHandOrder([]);
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
      setHandOrder(data.participants.filter((p) => p.handRaised).map((p) => p.userId));
      setParticipantCount(data.session.participantCount);
      meRef.current = data.you;
      setMe(data.you);
    });

    client.on("chat", (msg) => {
      setFloating((prev) => [...prev, msg].slice(-FLOAT_MAX));
    });

    client.on("message_deleted", ({ messageId }) => {
      setFloating((prev) => prev.filter((m) => m.id !== messageId));
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
      setHandOrder((prev) => prev.filter((id) => id !== userId));
      setSelected((prev) => (prev?.userId === userId ? null : prev));
      setParticipantCount(count);
    });

    client.on("hand_update", ({ userId, raised }) => {
      setHandOrder((prev) => {
        const rest = prev.filter((id) => id !== userId);
        return raised ? [...rest, userId] : rest;
      });
      setParticipants((prev) =>
        prev.map((p) =>
          p.userId === userId ? { ...p, handRaised: raised } : p,
        ),
      );
    });

    client.on("role_update", ({ userId, role }) => {
      setHandOrder((prev) => prev.filter((id) => id !== userId));
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
    // Server ham tekshiradi; bu yerda — rad etiladigan izoh matni yo'qolib ketmasligi uchun.
    const now = Date.now();
    const recent = sentAtRef.current.filter((at) => now - at < LIMITS_LIVE.messageWindowMs);
    if (recent.length >= LIMITS_LIVE.messageBurst) {
      setNotice("Juda tez yozyapsiz — bir oz kuting.");
      return;
    }
    sentAtRef.current = [...recent, now];
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
  // Yuqori qator: boshlovchilar, keyin so'zlovchilar. Pastki qator: qo'l ko'targanlar navbat tartibida, keyin qolganlar.
  const speakers = [
    ...allParticipants.filter((p) => p.role === "moderator"),
    ...allParticipants.filter((p) => p.role === "speaker"),
  ];
  const listenersList = allParticipants.filter((p) => p.role === "listener");
  const handRank = new Map(handOrder.map((id, index) => [id, index]));
  const handQueue = listenersList
    .filter((p) => p.handRaised)
    .sort((a, b) => (handRank.get(a.userId) ?? -1) - (handRank.get(b.userId) ?? -1));
  const quietListeners = listenersList.filter((p) => !p.handRaised);
  const hall = [...handQueue, ...quietListeners];
  // Yon panelda mikrofoni yoqiqlar birinchi (tartib barqaror: qolganlari o'z o'rnida).
  const micFirst = [...speakers].sort((a, b) => Number(av.byUser(b.userId).micOn) - Number(av.byUser(a.userId).micOn));
  const myRole = participants.find((p) => p.userId === me?.userId)?.role;
  const myQueuePlace = handQueue.findIndex((p) => p.userId === me?.userId) + 1;

  /** Qatnashchi belgisi; `place` — qo'l ko'targanning navbatdagi o'rni. */
  const chip = (p: LiveParticipant, place = 0) => {
    const m = av.byUser(p.userId);
    const host = p.role === "moderator";
    return (
      <div
        key={p.userId}
        role="listitem"
        onClick={() => pick(p)}
        className={`live-chip${p.role !== "listener" ? " is-speaker" : ""}${m.speaking ? " speaking" : ""}${p.handRaised ? " has-hand" : ""}${selectable(p) ? " selectable" : ""}`}
        title={`${p.name}${host ? " · boshlovchi" : p.role === "speaker" ? " · so'zlovchi" : ""}${place ? ` · ${place}-navbat` : ""}`}
      >
        <span className="live-chip-avatar">
          <Avatar name={p.name} />
          {p.handRaised && <i className="live-hand-badge" aria-label="Qo'l ko'targan"><Hand size={11} /></i>}
          {m.camera && <i className="live-cam-badge" aria-label="Kamera yoqiq"><Camera size={9} /></i>}
          {!m.micOn && p.role !== "listener" && <i className="live-mic-badge" aria-label="Mikrofon o'chiq"><MicOff size={10} /></i>}
        </span>
        <strong>{p.userId === me?.userId ? "Siz" : p.name}</strong>
        {host && <small>Boshlovchi</small>}
        {place > 0 && (canMod
          ? <button type="button" className="live-chip-grant" aria-label={`${p.name}ga so'z berish`} title="So'z berish" onClick={(e) => { e.stopPropagation(); modAction("grant", p); }}>Ruxsat</button>
          : <small>{place}-navbat</small>)}
      </div>
    );
  };

  // Faqat moderator boshqa qatnashchini tanlay oladi (o'zini emas).
  const selectable = (p: LiveParticipant) => canMod && p.userId !== me?.userId;
  const pick = (p: LiveParticipant) => selectable(p) && setSelected(p);

  // Tinglovchi so'z berilmaguncha mikrofon, kamera va ekranni yoqa olmaydi (ruxsat LiveKit serverida).
  const publishLocked = av.status !== "connected" || !av.canPublish;
  const lockedHint = av.status !== "connected" ? "Ovoz/video serveriga ulanilmagan" : "So'z berilganda yoqiladi";
  const recording = Boolean(sessionData?.recording);
  const controls: Array<{ label: string; icon: typeof Mic; active: boolean; disabled: boolean; pending: boolean; action: () => unknown; hint?: string }> = [
    { label: "Mikrofon", icon: av.micOn ? Mic : MicOff, active: av.micOn, disabled: publishLocked, pending: av.busy === "mic", action: av.toggleMic },
    { label: "Kamera", icon: av.cameraOn ? Camera : CameraOff, active: av.cameraOn, disabled: publishLocked, pending: av.busy === "camera", action: av.toggleCamera },
    { label: "Ekran ulashish", icon: MonitorUp, active: av.screenOn, disabled: publishLocked, pending: av.busy === "screen", action: av.toggleScreen },
    ...(canMod
      ? []
      : [{ label: "Qo'l ko'tarish", icon: Hand, active: handRaised, disabled: false, pending: false, action: toggleHand }]),
    // Tugagan suhbatda izohlar oqimi yopiladi; admin/moderator bu tugma bilan izohlar oynasini ochadi.
    {
      label: "Izohlar",
      icon: MessageCircle,
      active: status !== "ended" && commentsOn,
      disabled: status === "ended" && !canMod,
      pending: false,
      action: () => (status === "ended" ? setArchiveOpen(true) : setCommentsOn(!commentsOn)),
      hint: "Suhbat tugagan — izohlar yopildi",
    },
  ];

  // Yozib olish (faqat admin) — sarlavha qatorida, «Tugatish» yonida.
  const recLocked = status === "planned" || av.status !== "connected";
  const recHint = status === "planned" ? "Suhbat boshlangach yozib olinadi" : "Ovoz serveriga ulanilmagan";

  // Admin ekranida yozuv vaqti (pauzalarsiz).
  useEffect(() => {
    if (!recording || !ownRecording) return;
    const timer = setInterval(() => setRecElapsed(recorderRef.current?.elapsed() ?? 0), 500);
    return () => clearInterval(timer);
  }, [recording, ownRecording]);

  // ── Active session overlay ─────────────────────────────────────────

  const roomOpen = Boolean(activeSessionId && connState !== "idle");
  // Xona ochiq turganda orqadagi sahifa aylanmaydi: aks holda g'ildirak/barmoq harakati xona ostidagi
  // sahifaga o'tadi va o'ng chetda uning aylantirish chizig'i bir lahza ko'rinib qoladi.
  const overlayShown = roomOpen && !minimized;
  useEffect(() => {
    if (!overlayShown) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, [overlayShown]);
  let overlay: React.ReactNode = null;
  if (overlayShown) {
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
            <div className={`live-status-row${roomAdmin && status === "live" ? " has-admin-tools" : ""}`}>
              {status === "live" && (
                <span className="live-indicator"><i /> LIVE</span>
              )}
              {status === "ended" && <span className="live-ended-chip">Tugagan</span>}
              {recording && !roomAdmin && (
                <span className={`live-rec${recPaused ? " paused" : ""}`} title={recPaused ? "Yozuv pauzada" : "Suhbat yozib olinmoqda"}>
                  <i /> {recPaused ? "PAUZA" : "REC"}
                </span>
              )}
              <span
                className={`live-media-pill media-${media ? av.status : "none"}`}
                title={!media ? "Ovoz va video serveri sozlanmagan — faqat izohlar ishlaydi." : av.status === "connected" ? (av.canPublish ? "Ovoz/video ulangan." : "Ovoz/video ulangan. Gapirish uchun qo'l ko'taring.") : av.status === "error" ? "Ovoz/video serveriga ulanib bo'lmadi." : "Ovoz/video ulanmoqda…"}
              >
                <i /><span className="live-media-label">{!media ? "Faqat izohlar" : av.status === "connected" ? "Ovoz ulangan" : av.status === "error" ? "Ovoz uzildi" : "Ulanmoqda…"}</span>
              </span>
              <span className="live-status-spacer" />
              {roomAdmin && (status === "live" || recording) && (
                <span className={`live-rec-ctl${recording ? " on" : ""}${recPaused ? " paused" : ""}`} role="group" aria-label="Yozib olish">
                  {recording ? (
                    <>
                      <span className="live-rec-time" title={recPaused ? "Yozuv pauzada" : "Suhbat yozib olinmoqda"}>
                        <i /> {ownRecording ? clockOf(recElapsed) : "REC"}
                      </span>
                      {ownRecording && (
                        <button type="button" disabled={recBusy} onClick={toggleRecordingPause} aria-label={recPaused ? "Yozuvni davom ettirish" : "Yozuvni pauza qilish"} title={recPaused ? "Davom ettirish" : "Pauza"}>
                          {recPaused ? <Play size={13} /> : <Pause size={13} />}
                        </button>
                      )}
                      <button type="button" disabled={recBusy} onClick={() => void finishRecording()} aria-label="Yozuvni to‘xtatish" title="Yozuvni to‘xtatish">
                        <Square size={11} />
                      </button>
                    </>
                  ) : (
                    <button type="button" className="live-rec-start" disabled={recLocked || recBusy} aria-busy={recBusy} onClick={() => void startRecording()} title={recLocked ? recHint : "Yozib olish"}>
                      <CircleDot size={13} /> Yozib olish
                    </button>
                  )}
                </span>
              )}
              {roomAdmin && status === "live" && (
                <button className="live-admin-btn end" onClick={() => void endTalk()}>
                  <Square size={12} /> Tugatish
                </button>
              )}
            </div>
          </header>

          {connState === "joined" && status === "ended" && (
            <div className="live-status-banner ended">
              {canMod ? "Suhbat tugadi." : "Suhbat tugadi. Qatnashganingiz uchun rahmat!"}
              {canMod && (
                <button type="button" className="live-banner-btn" onClick={() => setArchiveOpen(true)}>
                  <MessageCircle size={14} /> Suhbat izohlari
                </button>
              )}
            </div>
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
                  <section className={`live-stage live-cams n${Math.min(cameraPeople.length, 3)}`} aria-label="Video yoqqanlar">
                    {cameraPeople.map(cameraTile)}
                  </section>
                )}

                {/* Faqat ovoz: ikki qator. Video/taqdimot yoqilganda ro'yxat yon panelga o'tadi (pastda). */}
                {!stage && (<>
                <section className="live-tier live-tier-speak" aria-label="So'z berilganlar">
                  <h3 title="So‘z berilganlar"><Mic size={14} aria-hidden="true" /><span className="sr-only">So‘z berilganlar:</span> <b>{speakers.length}</b></h3>
                  <div className="live-strip" role="list">
                    {speakers.map((p) => chip(p))}
                  </div>
                </section>

                <section className="live-tier live-tier-hall" aria-label="Tinglovchilar">
                  <h3 title="Tinglovchilar">
                    <Users size={14} aria-hidden="true" /><span className="sr-only">Tinglovchilar:</span> <b>{listenersList.length}</b>
                    {handQueue.length > 0 && <em title="Qo‘l ko‘targanlar"><Hand size={13} aria-hidden="true" /><span className="sr-only">Qo‘l ko‘targanlar:</span> {handQueue.length}</em>}
                  </h3>
                  {hall.length === 0 ? (
                    <p className="live-empty">Hozircha tinglovchi yo&apos;q</p>
                  ) : (
                    <div className="live-strip" role="list">
                      {hall.map((p, index) => chip(p, p.handRaised ? index + 1 : 0))}
                    </div>
                  )}
                  {myRole === "listener" && (
                    <p className={`live-tier-note${handRaised ? " is-queued" : ""}`}>
                      {handRaised
                        ? `Navbatdasiz${myQueuePlace ? `: ${myQueuePlace}-o‘rin` : ""} — boshlovchi so‘z beradi.`
                        : "Gapirish uchun «Qo‘l ko‘tarish»ni bosing."}
                    </p>
                  )}
                </section>
                </>)}
              </div>
            )}

            {/* ── Video/taqdimot paytida qatnashchilar: o'ng chetdagi tugma bilan ochiladigan, ustidan yopuvchi panel ── */}
            {connState === "joined" && stage && (
              <>
                {peopleOpen && <div className="live-people-scrim" aria-hidden="true" onClick={() => setPeopleOpen(false)} />}
                <div className={`live-people-dock${peopleOpen ? " is-open" : ""}`}>
                  <button
                    type="button"
                    className="live-people-tab"
                    aria-expanded={peopleOpen}
                    aria-controls="live-people"
                    aria-label={peopleOpen ? "Qatnashchilar ro‘yxatini yopish" : `Qatnashchilar ro‘yxatini ochish: ${allParticipants.length} kishi${handQueue.length ? `, ${handQueue.length} kishi qo‘l ko‘targan` : ""}`}
                    onClick={() => setPeopleOpen(!peopleOpen)}
                  >
                    {peopleOpen ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
                    <Users size={15} />
                    <span>{allParticipants.length}</span>
                    {handQueue.length > 0 && <b><Hand size={11} />{handQueue.length}</b>}
                  </button>
                  <aside id="live-people" className="live-people" aria-label="Qatnashchilar" inert={!peopleOpen}>
                    <section>
                      <h3 title="So‘z berilganlar"><Mic size={14} aria-hidden="true" /><span className="sr-only">So‘z berilganlar:</span> <b>{speakers.length}</b></h3>
                      <div role="list">{micFirst.map((p) => chip(p))}</div>
                    </section>
                    {handQueue.length > 0 && (
                      <section className="is-hands">
                        <h3 title="Qo‘l ko‘targanlar"><Hand size={14} aria-hidden="true" /><span className="sr-only">Qo‘l ko‘targanlar:</span> <b>{handQueue.length}</b></h3>
                        <div role="list">{handQueue.map((p, index) => chip(p, index + 1))}</div>
                      </section>
                    )}
                    <section>
                      <h3 title="Tinglovchilar"><Users size={14} aria-hidden="true" /><span className="sr-only">Tinglovchilar:</span> <b>{quietListeners.length}</b></h3>
                      {quietListeners.length
                        ? <div role="list">{quietListeners.map((p) => chip(p))}</div>
                        : <p className="live-empty">Boshqa tinglovchi yo&apos;q</p>}
                    </section>
                  </aside>
                </div>
              </>
            )}

            {/* ── Efirdagi izohlar: xona ustida suzib o'tadi, alohida panel yo'q ── */}
            {connState === "joined" && status === "live" && commentsOn && (
              <>
                <FloatingComments
                  items={floating}
                  myId={me?.userId ?? null}
                  canDelete={canMod}
                  onGone={(id) => setFloating((prev) => prev.filter((m) => m.id !== id))}
                  onDelete={(id) => clientRef.current?.deleteMessage(id)}
                />
              </>
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
          <footer className={`live-controls${typing ? " is-typing" : ""}`}>
            {connState === "joined" && status === "live" && commentsOn && (
              <form className="live-float-form" onSubmit={(e) => { e.preventDefault(); sendComment(); }}>
                <input
                  aria-label="Izoh yozing"
                  placeholder="Izoh yozing…"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onFocus={() => setTyping(true)}
                  onBlur={() => setTyping(false)}
                  maxLength={LIMITS_LIVE.messageBody}
                  enterKeyHint="send"
                />
                <button aria-label="Izoh yuborish" disabled={!draft.trim()}>
                  <Send size={17} />
                </button>
              </form>
            )}
            <div className="live-control-actions">
              {controls.map(({ label, icon: Icon, active, disabled, pending, action, hint }) => (
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
        onLogin={() => setLoginOpen(true)}
      />
      {viewer && <LoginDialog viewer={viewer} open={loginOpen} onOpenChange={setLoginOpen} />}

      {overlay}
      {miniBar}
      {recFile && <SaveRecordingDialog file={recFile} onClose={() => setRecFile(null)} />}
      {archiveOpen && sessionData && canMod && <TalkComments talk={sessionData} onClose={() => setArchiveOpen(false)} />}
    </>
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
