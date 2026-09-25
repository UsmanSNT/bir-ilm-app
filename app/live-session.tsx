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
  Plus,
  Radio,
  Send,
  Users,
  X,
} from "lucide-react";
import {
  LiveClient,
  fetchLiveSessions,
  createLiveSession,
  type LiveConnectionState,
} from "@/lib/api/live-client";
import type {
  LiveSession as LiveSessionType,
  LiveParticipant,
  LiveMessage,
} from "@/shared/contract/live";

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

type View = "video" | "screen" | "audio";

// ── Main Component ──────────────────────────────────────────────────

export default function LiveSession({
  name,
}: {
  name: string;
  date: number;
  onComments: () => void;
}) {
  const [sessions, setSessions] = useState<LiveSessionType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [connState, setConnState] = useState<LiveConnectionState>("idle");
  const [sessionData, setSessionData] = useState<LiveSessionType | null>(null);
  const [participants, setParticipants] = useState<LiveParticipant[]>([]);
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [participantCount, setParticipantCount] = useState(0);
  const [handRaised, setHandRaised] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [view, setView] = useState<View>("video");
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [draft, setDraft] = useState("");

  const clientRef = useRef<LiveClient | null>(null);
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

  function joinSession(sessionId: string) {
    clientRef.current?.dispose();
    const client = new LiveClient();
    clientRef.current = client;

    setActiveSessionId(sessionId);
    setMessages([]);
    setParticipants([]);
    setCommentsOpen(false);
    setView("video");
    setHandRaised(false);
    setMicOn(true);
    setCameraOn(true);

    client.on("state", setConnState);

    client.on("joined", (data) => {
      setSessionData(data.session);
      setParticipants(data.participants);
      setMessages(data.recentMessages);
      setParticipantCount(data.session.participantCount);
    });

    client.on("chat", (msg) => {
      setMessages((prev) => [...prev, msg]);
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
            ? { ...p, role: role as LiveParticipant["role"] }
            : p,
        ),
      );
    });

    client.on("session_started", ({ startedAt }) => {
      setSessionData((prev) =>
        prev ? { ...prev, status: "live", startedAt } : prev,
      );
    });

    client.on("session_ended", ({ endedAt }) => {
      setSessionData((prev) =>
        prev ? { ...prev, status: "ended", endedAt } : prev,
      );
    });

    client.on("error", (msg) => {
      console.error("[live]", msg);
    });

    client.join(sessionId);
  }

  function leaveSession() {
    clientRef.current?.leave();
    setActiveSessionId(null);
    setSessionData(null);
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

  const allParticipants = participants;
  const speakers = allParticipants.filter((p) => p.role !== "listener");
  const listenersList = allParticipants.filter((p) => p.role === "listener");

  const controls = [
    { label: "Mikrofon", icon: micOn ? Mic : MicOff, active: micOn, action: () => setMicOn(!micOn) },
    { label: "Kamera", icon: cameraOn ? Camera : CameraOff, active: cameraOn, action: () => setCameraOn(!cameraOn) },
    { label: "Ekran ulashish", icon: MonitorUp, active: view === "screen", action: () => setView(view === "screen" ? "video" : "screen") },
    { label: "Qo'l ko'tarish", icon: Hand, active: handRaised, action: toggleHand },
    { label: "Izohlar", icon: MessageCircle, active: commentsOpen, action: () => setCommentsOpen(!commentsOpen) },
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
            {sessionData?.status === "live" && (
              <span className="live-indicator"><i /> LIVE</span>
            )}
            <span className="live-count"><Users size={14} /> {participantCount}</span>
            <time>{timeStr(new Date().toISOString())}</time>
          </header>

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
                  {allParticipants.slice(0, 4).map((p) => (
                    <div
                      key={p.userId}
                      className={`live-video-tile${p.role === "moderator" ? " speaking" : ""}`}
                    >
                      <div className="live-tile-avatar" style={{ background: avatarColor(p.name) }}>
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="live-video-label">
                        <strong>{p.name}</strong>
                        {p.handRaised ? (
                          <Hand size={14} color="#ffb800" />
                        ) : p.role === "moderator" ? (
                          <span className="live-level">▂▅▃</span>
                        ) : (
                          <MicOff size={15} />
                        )}
                      </div>
                    </div>
                  ))}
                  {Array.from({ length: Math.max(0, 4 - allParticipants.length) }).map((_, i) => (
                    <div key={`empty-${i}`} className="live-video-tile" />
                  ))}
                </div>
                <div className="live-avatar-strip">
                  {allParticipants.slice(4, 9).map((p) => (
                    <Avatar key={p.userId} name={p.name} />
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
                  {speakers.length > 0 && <Avatar name={speakers[0].name} />}
                  {speakers.length > 0 ? `${speakers[0].name} ekranini ulashmoqda` : "Ekran ulashish"}
                </div>
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
                <div className="live-speaker-strip">
                  {allParticipants.slice(0, 4).map((p) => (
                    <div key={p.userId}>
                      <div className="live-tile-avatar" style={{ background: avatarColor(p.name), width: "100%", height: "100%", borderRadius: 5, fontSize: 24 }}>
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                      <span>{p.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Ovozli ko'rinish ── */}
            {connState === "joined" && view === "audio" && (
              <div className="live-audio-view">
                <h3>Gapirayotganlar ({speakers.length})</h3>
                <div className="live-speakers">
                  {speakers.map((p) => (
                    <div key={p.userId}>
                      <Avatar name={p.name} />
                      <strong>{p.name}</strong>
                      {p.role === "moderator" && <small>Boshlovchi</small>}
                    </div>
                  ))}
                  {speakers.length === 0 && (
                    <p className="muted" style={{ fontSize: 12 }}>Hali so'zlovchi yo'q</p>
                  )}
                </div>
                <h3>Tinglovchilar ({listenersList.length})</h3>
                <div className="live-listeners">
                  {listenersList.map((p) => (
                    <div key={p.userId}>
                      <Avatar name={p.name} />
                      <strong>{p.name}</strong>
                      {p.handRaised ? <Hand size={13} /> : <MicOff size={13} />}
                    </div>
                  ))}
                </div>
                <span className="live-queue">
                  <Hand size={16} /> {handRaised ? "Navbatdasiz" : "Qo'l ko'tarib navbatga turing"}
                </span>
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
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
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
              </aside>
            )}
          </div>

          {/* ── Boshqaruv paneli ── */}
          <footer className="live-controls">
            <div className="live-view-switch" role="group" aria-label="Suhbat ko'rinishi">
              <button className={view === "video" ? "selected" : ""} onClick={() => setView("video")}>Video</button>
              <button className={view === "audio" ? "selected" : ""} onClick={() => setView("audio")}>Ovozli</button>
            </div>
            <div className="live-control-actions">
              {controls.map(({ label, icon: Icon, active, action }) => (
                <button className={active ? "active" : ""} key={label} onClick={action} aria-label={label} title={label}>
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
          <p className="live-demo-note">Ko'rinish sinovi: ovoz va video uzatilmaydi.</p>
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
        <p className="session-status">Kitob haqida jonli fikr almashing — real vaqtda chat.</p>
        <button className="button" onClick={() => setShowCreate(true)}>
          <Plus size={16} /> Yangi suhbat yaratish
        </button>
      </section>

      {loading && <p className="muted">Yuklanmoqda...</p>}

      {!loading && sessions.length === 0 && (
        <p className="muted">Hozircha suhbatlar yo'q. Yangisini yarating!</p>
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
            {s.status === "ended" ? "Tugagan" : "Qo'shilish"}
          </button>
        </section>
      ))}

      {showCreate && (
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

// ── Yangi suhbat yaratish dialogi ────────────────────────────────────

function CreateSessionDialog({
  name,
  onClose,
  onCreated,
}: {
  name: string;
  onClose: () => void;
  onCreated: (s: LiveSessionType) => void;
}) {
  const [bookTitle, setBookTitle] = useState("");
  const [title, setTitle] = useState("");
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
      scheduledAt: new Date().toISOString(),
    });

    setSubmitting(false);

    if (session) {
      onCreated(session);
    } else {
      setError("Suhbat yaratib bo'lmadi. Qayta urinib ko'ring.");
    }
  }

  return (
    <div className="live-overlay" role="dialog" aria-modal="true">
      <div className="live-window" style={{ maxWidth: 420 }}>
        <header className="live-topbar">
          <button className="live-plain-btn" onClick={onClose}>
            <ArrowLeft size={22} />
          </button>
          <div className="live-room-title">
            <strong>Yangi suhbat</strong>
          </div>
        </header>
        <form
          onSubmit={handleSubmit}
          style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}
        >
          <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>Kitob nomi</span>
            <input
              value={bookTitle}
              onChange={(e) => setBookTitle(e.target.value)}
              placeholder="Atom odatlar"
              maxLength={160}
              required
              style={{ padding: "0.5rem 0.75rem", borderRadius: 8, border: "1px solid var(--border)", fontSize: "0.9rem" }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>Suhbat sarlavhasi</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Birga tahlil qilamiz"
              maxLength={200}
              required
              style={{ padding: "0.5rem 0.75rem", borderRadius: 8, border: "1px solid var(--border)", fontSize: "0.9rem" }}
            />
          </label>
          {error && <p style={{ color: "#e5484d", fontSize: "0.85rem" }}>{error}</p>}
          <button className="button" type="submit" disabled={submitting}>
            {submitting ? "Yaratilmoqda..." : "Yaratish"}
          </button>
        </form>
      </div>
    </div>
  );
}
