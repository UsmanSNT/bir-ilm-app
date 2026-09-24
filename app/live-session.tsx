"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Hand,
  LogOut,
  MessageCircle,
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

  // Active session state
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [connState, setConnState] = useState<LiveConnectionState>("idle");
  const [sessionData, setSessionData] = useState<LiveSessionType | null>(null);
  const [participants, setParticipants] = useState<LiveParticipant[]>([]);
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [participantCount, setParticipantCount] = useState(0);
  const [handRaised, setHandRaised] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(true);
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

  // Cleanup on unmount
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
    setCommentsOpen(true);

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
        prev.map((p) => (p.userId === userId ? { ...p, handRaised: raised } : p)),
      );
    });

    client.on("role_update", ({ userId, role }) => {
      setParticipants((prev) =>
        prev.map((p) =>
          p.userId === userId ? { ...p, role: role as LiveParticipant["role"] } : p,
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

  function sendChat() {
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

  // ── Active session overlay ──────────────────────────────────────────

  if (activeSessionId && connState !== "idle") {
    return (
      <div className="live-overlay" role="dialog" aria-modal="true">
        <div className="live-window">
          <header className="live-topbar">
            <button
              className="live-plain-btn"
              aria-label="Suhbatdan chiqish"
              onClick={leaveSession}
            >
              <ArrowLeft size={22} />
            </button>
            <div className="live-room-title">
              <strong>{sessionData?.title ?? "Yuklanmoqda..."}</strong>
              <span>{sessionData?.bookTitle}</span>
            </div>
            {sessionData?.status === "live" && (
              <span className="live-indicator">
                <i /> LIVE
              </span>
            )}
            <span className="live-count">
              <Users size={14} /> {participantCount}
            </span>
          </header>

          <div className="live-main">
            {/* Participants list */}
            <div className="live-audio-view">
              {connState === "connecting" && (
                <p className="muted" style={{ textAlign: "center", padding: "2rem" }}>
                  Ulanmoqda...
                </p>
              )}
              {connState === "error" && (
                <p className="muted" style={{ textAlign: "center", padding: "2rem", color: "var(--red-9, #e5484d)" }}>
                  Ulanish uzildi. Qayta ulanmoqda...
                </p>
              )}
              {connState === "joined" && (
                <>
                  {participants.filter((p) => p.role !== "listener").length > 0 && (
                    <>
                      <h3>
                        So'zlovchilar (
                        {participants.filter((p) => p.role !== "listener").length})
                      </h3>
                      <div className="live-speakers">
                        {participants
                          .filter((p) => p.role !== "listener")
                          .map((p) => (
                            <div key={p.userId}>
                              <span className="live-avatar-circle">
                                {p.name.charAt(0).toUpperCase()}
                              </span>
                              <strong>{p.name}</strong>
                              {p.role === "moderator" && <small>Boshlovchi</small>}
                            </div>
                          ))}
                      </div>
                    </>
                  )}
                  <h3>
                    Tinglovchilar (
                    {participants.filter((p) => p.role === "listener").length})
                  </h3>
                  <div className="live-listeners">
                    {participants
                      .filter((p) => p.role === "listener")
                      .map((p) => (
                        <div key={p.userId}>
                          <span className="live-avatar-circle">
                            {p.name.charAt(0).toUpperCase()}
                          </span>
                          <strong>{p.name}</strong>
                          {p.handRaised && <Hand size={14} />}
                        </div>
                      ))}
                  </div>
                </>
              )}
            </div>

            {/* Chat panel */}
            {commentsOpen && (
              <aside className="live-comments">
                <div className="live-comments-head">
                  <strong>Jonli chat</strong>
                  <button
                    className="live-plain-btn"
                    aria-label="Chatni yopish"
                    onClick={() => setCommentsOpen(false)}
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className="live-comment-list">
                  {messages.map((msg) => (
                    <div className="live-comment" key={msg.id}>
                      <span className="live-avatar-circle">
                        {msg.userName.charAt(0).toUpperCase()}
                      </span>
                      <div>
                        <strong>{msg.userName}</strong>
                        <time>{timeStr(msg.createdAt)}</time>
                        <p>{msg.body}</p>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
                <form
                  className="live-comment-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    sendChat();
                  }}
                >
                  <input
                    aria-label="Xabar yozing"
                    placeholder="Xabar yozing..."
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    maxLength={500}
                  />
                  <button aria-label="Xabar yuborish" disabled={!draft.trim()}>
                    <Send size={18} />
                  </button>
                </form>
              </aside>
            )}
          </div>

          <footer className="live-controls">
            <div className="live-control-actions">
              <button
                className={handRaised ? "active" : ""}
                onClick={toggleHand}
                aria-label="Qo'l ko'tarish"
                title="Qo'l ko'tarish"
              >
                <span>
                  <Hand size={20} />
                </span>
                <small>Qo'l</small>
              </button>
              <button
                className={commentsOpen ? "active" : ""}
                onClick={() => setCommentsOpen(!commentsOpen)}
                aria-label="Chat"
                title="Chat"
              >
                <span>
                  <MessageCircle size={20} />
                </span>
                <small>Chat</small>
              </button>
              <button
                className="live-hangup"
                onClick={leaveSession}
                aria-label="Chiqish"
                title="Chiqish"
              >
                <span>
                  <LogOut size={20} />
                </span>
                <small>Chiqish</small>
              </button>
            </div>
          </footer>
        </div>
      </div>
    );
  }

  // ── Session list ────────────────────────────────────────────────────

  return (
    <>
      <section className="live-card">
        <div className="live-heading">
          <span className="live-icon">
            <Radio size={24} />
          </span>
          <div>
            <span className="eyebrow">JONLI SUHBATLAR</span>
            <h3>Kitob muhokamalariga qo'shiling</h3>
          </div>
        </div>
        <p className="session-status">
          Kitob haqida jonli fikr almashing — real vaqtda chat.
        </p>
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
              <span className="live-indicator">
                <i /> LIVE
              </span>
            )}
            <div>
              <span className="eyebrow">{s.bookTitle}</span>
              <h3>{s.title}</h3>
            </div>
          </div>
          <p className="session-date">
            {dateStr(s.scheduledAt)} · {timeStr(s.scheduledAt)}
          </p>
          <p className="session-status">
            {STATUS_LABELS[s.status] ?? s.status}
            {s.participantCount > 0 && ` · ${s.participantCount} qatnashchi`}
          </p>
          <button
            className="button"
            onClick={() => joinSession(s.id)}
            disabled={s.status === "ended"}
          >
            {s.status === "ended" ? "Tugagan" : "Qo'shilish"}
          </button>
        </section>
      ))}

      {/* Create session dialog */}
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

// ── Create session dialog ─────────────────────────────────────────────

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
              style={{
                padding: "0.5rem 0.75rem",
                borderRadius: 8,
                border: "1px solid var(--border)",
                fontSize: "0.9rem",
              }}
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
              style={{
                padding: "0.5rem 0.75rem",
                borderRadius: 8,
                border: "1px solid var(--border)",
                fontSize: "0.9rem",
              }}
            />
          </label>
          {error && (
            <p style={{ color: "var(--red-9, #e5484d)", fontSize: "0.85rem" }}>{error}</p>
          )}
          <button className="button" type="submit" disabled={submitting}>
            {submitting ? "Yaratilmoqda..." : "Yaratish"}
          </button>
        </form>
      </div>
    </div>
  );
}
