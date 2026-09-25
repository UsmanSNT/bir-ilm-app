"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Camera,
  CameraOff,
  Hand,
  LogOut,
  MessageCircle,
  Mic,
  MicOff,
  MonitorUp,
  Play,
  Plus,
  Radio,
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

function dateStr(iso: string) {
  return new Date(iso).toLocaleDateString("uz-UZ", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

const STATUS_LABELS: Record<string, string> = {
  planned: "Rejalashtirilgan",
  live: "JONLI",
  ended: "Tugagan",
};

const AVATAR_COLORS = [
  "#0b6148", "#1a73e8", "#e8710a", "#9334e6",
  "#c5221f", "#0d652d", "#8430ce", "#d93025",
  "#188038", "#1967d2", "#a142f4", "#e37400",
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

type View = "video" | "screen" | "audio";
type Me = { userId: string; role: UserRole };

// ── Main Component ──────────────────────────────────────────────────

export default function LiveSession({
  name,
}: {
  name: string;
  date: number;
  onComments: () => void;
}) {
  const viewer = useViewer();
  const isAdmin = viewer?.role === "admin";

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
  const [view, setView] = useState<View>("video");
  const [draft, setDraft] = useState("");
  const [selected, setSelected] = useState<LiveParticipant | null>(null);
  const [notice, setNotice] = useState("");
  const [media, setMedia] = useState<LiveMedia | null>(null);

  const av = useLiveMedia(activeSessionId ? media : null, setNotice);
  const sharerId = av.screenSharer?.userId ?? null;

  // Kimdir ekran ulasha boshlasa, hamma avtomatik ekran ko'rinishiga o'tadi.
  const [lastSharer, setLastSharer] = useState<string | null>(null);
  if (sharerId !== lastSharer) {
    setLastSharer(sharerId);
    if (sharerId) setView("screen");
    else if (view === "screen") setView("video");
  }

  // Ovozli ko'rinishdagi odam birinchi kamera yonganda videoga o'tadi (ekran ulashilmayotgan bo'lsa).
  const cameraOwner = participants.find((p) => av.byUser(p.userId).camera)?.userId ?? null;
  const [lastCameraOwner, setLastCameraOwner] = useState<string | null>(null);
  if (cameraOwner !== lastCameraOwner) {
    setLastCameraOwner(cameraOwner);
    if (cameraOwner && !lastCameraOwner && view === "audio" && !sharerId) {
      setView("video");
      const who = participants.find((p) => p.userId === cameraOwner)?.name ?? "Qatnashchi";
      setNotice(`${who} kamerasini yoqdi`);
    }
  }

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
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    return () => clientRef.current?.dispose();
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
    setListNotice("");
    setMessages([]);
    setParticipants([]);
    setCommentsOpen(false);
    setSelected(null);
    setView("video");
    setHandRaised(false);
    setMedia(null);

    client.on("state", setConnState);

    client.on("joined", (data) => {
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

    client.on("session_ended", ({ endedAt }) => {
      setSessionData((prev) =>
        prev ? { ...prev, status: "ended", endedAt } : prev,
      );
      setMedia(null);
    });

    client.on("kicked", () => {
      setActiveSessionId(null);
      setSessionData(null);
      setMedia(null);
      setListNotice("Moderator sizni suhbatdan chiqardi.");
      loadSessions();
    });

    client.on("error", (msg) => {
      setNotice(msg);
    });

    client.join(sessionId);
  }

  function leaveSession() {
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
  // Katakchalar 4 ta: kamerasi yoqilganlar, keyin so'zi borlar birinchi ko'rinsin.
  // Gapirish bo'yicha tartiblanmaydi — aks holda katakchalar har gapda sakrab turardi.
  const stageScore = (p: LiveParticipant) =>
    (av.byUser(p.userId).camera ? 2 : 0) + (p.role !== "listener" ? 1 : 0);
  const onStage = [...participants].sort((a, b) => stageScore(b) - stageScore(a));
  const speakers = allParticipants.filter((p) => p.role !== "listener");
  const listenersList = allParticipants.filter((p) => p.role === "listener");
  const handQueue = listenersList.filter((p) => p.handRaised);

  // Faqat moderator boshqa qatnashchini tanlay oladi (o'zini emas).
  const selectable = (p: LiveParticipant) => canMod && p.userId !== me?.userId;
  const pick = (p: LiveParticipant) => selectable(p) && setSelected(p);

  // Tinglovchi so'z berilmaguncha mikrofon, kamera va ekranni yoqa olmaydi (ruxsat LiveKit serverida).
  const publishLocked = av.status !== "connected" || !av.canPublish;
  const lockedHint = av.status !== "connected" ? "Ovoz/video serveriga ulanilmagan" : "So'z berilganda yoqiladi";
  const controls = [
    { label: "Mikrofon", icon: av.micOn ? Mic : MicOff, active: av.micOn, disabled: publishLocked, action: av.toggleMic },
    { label: "Kamera", icon: av.cameraOn ? Camera : CameraOff, active: av.cameraOn, disabled: publishLocked, action: av.toggleCamera },
    { label: "Ekran ulashish", icon: MonitorUp, active: av.screenOn, disabled: publishLocked, action: av.toggleScreen },
    ...(canMod
      ? []
      : [{ label: "Qo'l ko'tarish", icon: Hand, active: handRaised, disabled: false, action: toggleHand }]),
    { label: "Izohlar", icon: MessageCircle, active: commentsOpen, disabled: false, action: () => setCommentsOpen(!commentsOpen) },
  ];

  // ── Active session overlay ─────────────────────────────────────────

  if (activeSessionId && connState !== "idle") {
    const bookTitle = sessionData?.bookTitle ?? "Yuklanmoqda...";
    const sessionTitle = sessionData?.title ?? "";

    return (
      <div className="live-overlay" role="dialog" aria-modal="true" aria-label={`${bookTitle} jonli suhbat`}>
        <div className="live-window">
          <header className="live-topbar">
            <button className="live-plain-btn" aria-label="Suhbat oynasini yopish" onClick={leaveSession}>
              <ArrowLeft size={22} />
            </button>
            <div className="live-room-title">
              <strong>{bookTitle}</strong>
              <span>{sessionTitle}</span>
            </div>
            {status === "live" && (
              <span className="live-indicator"><i /> LIVE</span>
            )}
            {roomAdmin && status === "planned" && (
              <button className="live-admin-btn start" onClick={() => clientRef.current?.startSession()}>
                <Play size={13} /> Boshlash
              </button>
            )}
            {roomAdmin && status === "live" && (
              <button className="live-admin-btn end" onClick={() => clientRef.current?.endSession()}>
                <Square size={12} /> Tugatish
              </button>
            )}
            <span className="live-count"><Users size={14} /> {participantCount}</span>
          </header>

          {connState === "joined" && status !== "live" && (
            <div className={`live-status-banner ${status}`}>
              {status === "planned"
                ? roomAdmin
                  ? "Suhbat hali boshlanmagan. Tayyor bo'lsangiz, \"Boshlash\"ni bosing."
                  : "Suhbat hali boshlanmagan. Admin boshlashini kuting."
                : "Suhbat tugadi. Izohlarni o'qishingiz mumkin."}
            </div>
          )}
          {canMod && connState === "joined" && (
            <div className="live-mod-hint">
              <ShieldCheck size={14} />
              {roomAdmin ? "Admin" : "Moderator"} — qatnashchini bosib, so'z bering yoki chiqaring
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

            {/* ── Video ko'rinishi ── */}
            {connState === "joined" && view === "video" && (
              <div className="live-video-view">
                <div className="live-video-grid">
                  {onStage.slice(0, 4).map((p) => {
                    const m = av.byUser(p.userId);
                    return (
                      <div
                        key={p.userId}
                        className={`live-video-tile${m.speaking ? " speaking" : ""}${selectable(p) ? " selectable" : ""}`}
                        onClick={() => pick(p)}
                      >
                        {m.camera ? (
                          <VideoTrackView track={m.camera} mirror={p.userId === me?.userId} />
                        ) : (
                          <div className="live-tile-avatar" style={{ background: avatarColor(p.name) }}>
                            {p.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="live-video-label">
                          <strong>{p.name}{p.userId === me?.userId ? " (siz)" : ""}</strong>
                          {p.handRaised ? (
                            <Hand size={14} color="#ffb800" />
                          ) : m.speaking ? (
                            <span className="live-level">▂▅▃</span>
                          ) : m.micOn ? (
                            <Mic size={15} />
                          ) : (
                            <MicOff size={15} />
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {Array.from({ length: Math.max(0, 4 - onStage.length) }).map((_, i) => (
                    <div key={`empty-${i}`} className="live-video-tile" />
                  ))}
                </div>
                <div className="live-avatar-strip">
                  {onStage.slice(4, 9).map((p) => (
                    <button key={p.userId} className="live-avatar-btn" onClick={() => pick(p)} disabled={!selectable(p)}>
                      <Avatar name={p.name} />
                    </button>
                  ))}
                  {participantCount > 9 && (
                    <span className="live-more">+{participantCount - 9}</span>
                  )}
                </div>
              </div>
            )}

            {/* ── Ekran ulashish ko'rinishi ── */}
            {connState === "joined" && view === "screen" && (
              <div className="live-screen-view">
                <div className="live-share-banner">
                  <MonitorUp size={17} />
                  {sharerName && <Avatar name={sharerName} />}
                  {sharerName ? `${sharerName} ekranini ulashmoqda` : "Hozir hech kim ekran ulashmayapti"}
                </div>
                {av.screenSharer ? (
                  <div className="live-shared-screen">
                    <VideoTrackView track={av.screenSharer.track} fit="contain" />
                  </div>
                ) : (
                <div className="live-shared-slide">
                  <div className="live-slide-heading">
                    {bookTitle.toUpperCase()}
                    <small>{sessionTitle}</small>
                  </div>
                  <div className="live-slide-body">
                    <div className="live-book-cover">
                      <strong>{bookTitle.split(" ").slice(0, 2).join(" ").toUpperCase()}</strong>
                      <small>{sessionTitle}</small>
                      <span>{bookTitle}</span>
                    </div>
                    <ol>
                      <li><strong>Muhokama</strong><small>Kitob haqida fikr almashish</small></li>
                      <li><strong>Savollar</strong><small>Qatnashchilar savollari</small></li>
                      <li><strong>Xulosa</strong><small>Asosiy xulosalar</small></li>
                    </ol>
                  </div>
                </div>
                )}
                <div className="live-speaker-strip">
                  {onStage.slice(0, 4).map((p) => {
                    const m = av.byUser(p.userId);
                    return (
                      <div key={p.userId} onClick={() => pick(p)} className={m.speaking ? "speaking" : ""}>
                        {m.camera ? (
                          <VideoTrackView track={m.camera} mirror={p.userId === me?.userId} />
                        ) : (
                          <div className="live-tile-avatar" style={{ background: avatarColor(p.name), width: "100%", height: "100%", borderRadius: 5, fontSize: 24 }}>
                            {p.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span>{p.name}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Ovozli ko'rinish ── */}
            {connState === "joined" && view === "audio" && (
              <div className="live-audio-view">
                {canMod && handQueue.length > 0 && (
                  <section className="live-hand-queue">
                    <h3><Hand size={15} /> Navbatda ({handQueue.length})</h3>
                    {handQueue.map((p) => (
                      <div key={p.userId}>
                        <Avatar name={p.name} />
                        <strong>{p.name}</strong>
                        <button onClick={() => modAction("grant", p)}>So'z berish</button>
                      </div>
                    ))}
                  </section>
                )}
                <h3>Gapirayotganlar ({speakers.length})</h3>
                <div className="live-speakers">
                  {speakers.map((p) => (
                    <div key={p.userId} onClick={() => pick(p)} className={`${selectable(p) ? "selectable" : ""}${av.byUser(p.userId).speaking ? " speaking" : ""}`}>
                      <Avatar name={p.name} />
                      <strong>{p.name}</strong>
                      {p.role === "moderator" ? <small>Boshlovchi</small> : !av.byUser(p.userId).micOn && <MicOff size={13} />}
                    </div>
                  ))}
                  {speakers.length === 0 && (
                    <p className="muted" style={{ fontSize: 12 }}>Hali so'zlovchi yo'q</p>
                  )}
                </div>
                <h3>Tinglovchilar ({listenersList.length})</h3>
                <div className="live-listeners">
                  {listenersList.map((p) => (
                    <div key={p.userId} onClick={() => pick(p)} className={selectable(p) ? "selectable" : ""}>
                      <Avatar name={p.name} />
                      <strong>{p.name}</strong>
                      {p.handRaised ? <Hand size={13} /> : <MicOff size={13} />}
                    </div>
                  ))}
                </div>
                {!canMod && (
                  <span className="live-queue">
                    <Hand size={16} /> {handRaised ? "Navbatdasiz" : "Qo'l ko'tarib navbatga turing"}
                  </span>
                )}
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
                      Hali izohlar yo'q. Birinchi bo'ling!
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
                  <p className="live-comments-closed">Suhbat tugagan — izoh yozib bo'lmaydi.</p>
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
                    <button onClick={() => modAction("grant", selected)}><Mic size={17} /> So'z berish</button>
                  )}
                  {selected.role === "speaker" && (
                    <button onClick={() => modAction("revoke", selected)}><MicOff size={17} /> So'zni olish</button>
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
          <footer className="live-controls">
            <div className="live-view-switch" role="group" aria-label="Suhbat ko'rinishi">
              <button className={view === "video" ? "selected" : ""} onClick={() => setView("video")}>Video</button>
              {sharerId && (
                <button className={view === "screen" ? "selected" : ""} onClick={() => setView("screen")}>Ekran</button>
              )}
              <button className={view === "audio" ? "selected" : ""} onClick={() => setView("audio")}>Ovozli</button>
            </div>
            <div className="live-control-actions">
              {controls.map(({ label, icon: Icon, active, disabled, action }) => (
                <button
                  className={active ? "active" : ""}
                  key={label}
                  onClick={action}
                  disabled={disabled}
                  aria-label={label}
                  title={disabled ? lockedHint : label}
                >
                  <span><Icon size={20} /></span>
                  <small>{label}</small>
                </button>
              ))}
              <button className="live-hangup" onClick={leaveSession} aria-label="Suhbatdan chiqish" title="Suhbatdan chiqish">
                <span><LogOut size={20} /></span>
                <small>Chiqish</small>
              </button>
            </div>
          </footer>
          <p className={`live-demo-note media-${media ? av.status : "none"}`}>
            {!media
              ? "Ovoz va video serveri sozlanmagan — faqat izohlar ishlaydi."
              : av.status === "connected"
                ? av.canPublish ? "Ovoz/video ulangan." : "Ovoz/video ulangan. Gapirish uchun qo'l ko'taring."
                : av.status === "error" ? "Ovoz/video serveriga ulanib bo'lmadi." : "Ovoz/video ulanmoqda…"}
          </p>
        </div>
      </div>
    );
  }

  // ── Suhbatlar ro'yxati ─────────────────────────────────────────────

  return (
    <>
      <section className="live-card">
        <div className="live-heading">
          <span className="live-icon"><Radio size={24} /></span>
          <div>
            <span className="eyebrow">JONLI SUHBATLAR</span>
            <h3>Kitob muhokamalariga qo'shiling</h3>
          </div>
        </div>
        <p className="session-status">
          {isAdmin
            ? "Siz adminsiz: yangi suhbat e'lon qiling va uni boshlang."
            : "Suhbatlarni admin e'lon qiladi. Vaqti kelganda qo'shiling."}
        </p>
        {isAdmin && (
          <button className="button" onClick={() => setShowCreate(true)}>
            <Plus size={16} /> Yangi suhbat yaratish
          </button>
        )}
      </section>

      {listNotice && <p className="live-list-notice">{listNotice}</p>}

      {loading && <p className="muted">Yuklanmoqda...</p>}

      {!loading && sessions.length === 0 && (
        <p className="muted">Hozircha rejalashtirilgan suhbat yo'q.</p>
      )}

      {sessions.map((s) => (
        <section className="live-card" key={s.id}>
          <div className="live-heading">
            {s.status === "live" && (
              <span className="live-indicator"><i /> LIVE</span>
            )}
            <div>
              <span className="eyebrow">{s.bookTitle}</span>
              <h3>{s.title}</h3>
            </div>
          </div>
          <p className="session-date">{dateStr(s.scheduledAt)} · {timeStr(s.scheduledAt)}</p>
          <p className="session-status">
            {STATUS_LABELS[s.status] ?? s.status}
            {s.participantCount > 0 && ` · ${s.participantCount} qatnashchi`}
          </p>
          <button className="button" onClick={() => joinSession(s.id)} disabled={s.status === "ended"}>
            {s.status === "ended" ? "Tugagan" : isAdmin && s.status === "planned" ? "Kirish va boshlash" : "Qo'shilish"}
          </button>
        </section>
      ))}

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!bookTitle.trim() || !title.trim()) return;

    setSubmitting(true);
    setError("");

    const session = await createLiveSession({
      bookTitle: bookTitle.trim(),
      title: title.trim(),
      scheduledAt: new Date(when).toISOString(),
    });

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
            <span>Faqat admin e'lon qiladi</span>
          </div>
        </header>
        <form
          onSubmit={handleSubmit}
          style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}
        >
          <label style={labelStyle}>
            <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>Kitob nomi</span>
            <input value={bookTitle} onChange={(e) => setBookTitle(e.target.value)} placeholder="Atom odatlar" maxLength={160} required style={fieldStyle} />
          </label>
          <label style={labelStyle}>
            <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>Suhbat sarlavhasi</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Birga tahlil qilamiz" maxLength={200} required style={fieldStyle} />
          </label>
          <label style={labelStyle}>
            <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>Qachon</span>
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required style={fieldStyle} />
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
