"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useSyncExternalStore, useState, type CSSProperties } from "react";
import {
  ArrowRight,
  Bell,
  BookOpen,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Leaf,
  Timer,
  TreePine,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { LIVE_ROOM, quizzes, wisdom, type Quiz } from "./quiz-data";
import { useCatalog } from "@/lib/api/books-client";
import type { Book } from "@/shared/contract";

type Save = {
  joined: boolean;
  scores: Record<string, number>;
};

type Screen = "home" | "news" | "quizzes" | "play";

const SAVE_KEY = "bir-ilm-quiz-v1";
const emptySave: Save = { joined: false, scores: {} };

function parseSave(raw: string): Save {
  if (!raw) return emptySave;
  try {
    const parsed = JSON.parse(raw) as Partial<Save>;
    const scores: Record<string, number> = {};
    if (parsed.scores && typeof parsed.scores === "object") {
      for (const [id, score] of Object.entries(parsed.scores)) {
        if (typeof score === "number" && Number.isFinite(score)) scores[id] = score;
      }
    }
    return { joined: Boolean(parsed.joined), scores };
  } catch {
    return emptySave;
  }
}

function subscribeSave(onChange: () => void) {
  window.addEventListener("bir-quiz-save", onChange);
  return () => window.removeEventListener("bir-quiz-save", onChange);
}

function readSaveSnapshot() {
  try {
    return localStorage.getItem(SAVE_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeSave(next: Save) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(next));
  } catch {
    /* Qurilma xotirasi to‘lgan bo‘lsa natija shu sessiyada qoladi. */
  }
  window.dispatchEvent(new Event("bir-quiz-save"));
}

function BookCover({
  title,
  author,
  tone,
  size = "md",
  live = false,
  image = null,
  color,
}: {
  title: string;
  author: string;
  tone: "cream" | "rose" | "ink";
  size?: "sm" | "md" | "lg";
  live?: boolean;
  image?: string | null;
  color?: string;
}) {
  return (
    <div className={`m-cover m-cover-${tone} m-cover-${size}${image ? " has-image" : ""}`} style={color && !image ? { background: color, color: "#fff" } : undefined}>
      {image && <img src={image} alt="" />}
      {live && <span className="m-live">LIVE</span>}
      <span>BIR ILM</span>
      <strong>{title}</strong>
      <em>{author}</em>
    </div>
  );
}

function CountBoxes({ days, hours }: { days: string; hours: string }) {
  return (
    <div className="m-count" aria-label={`${Number(days)} kun ${Number(hours)} soat`}>
      <div>
        <strong>{days}</strong>
        <span>kun</span>
      </div>
      <div>
        <strong>{hours}</strong>
        <span>soat</span>
      </div>
    </div>
  );
}

function koreaWeekProgress(timestamp: number) {
  const korea = new Date(timestamp + 9 * 60 * 60 * 1000);
  const day = korea.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = Date.UTC(korea.getUTCFullYear(), korea.getUTCMonth(), korea.getUTCDate() + mondayOffset);
  const end = start + (5 * 24 + 22) * 60 * 60 * 1000;
  const current = korea.getTime();
  const elapsed = Math.max(0, Math.min(end - start, current - start));
  const remaining = Math.max(0, end - current);
  const remainingHours = Math.ceil(remaining / 3_600_000);
  return {
    progress: Math.round((elapsed / (end - start)) * 100),
    label: remainingHours >= 24
      ? `${Math.floor(remainingHours / 24)} kun ${remainingHours % 24} soat qoldi`
      : remainingHours > 0 ? `${remainingHours} soat qoldi` : "Suhbat boshlandi",
  };
}

function DiscussionArt({ variant = "talk" }: { variant?: string }) {
  const background = variant === "quiz" ? "#e8e2d1" : variant === "habit" ? "#d7e8e8" : "#d7e4dc";
  const accent = variant === "quiz" ? "#b58b35" : variant === "habit" ? "#367688" : "#1f6b4e";
  return (
    <svg className="m-news-art" viewBox="0 0 160 132" aria-hidden="true">
      <rect width="160" height="132" fill={background} />
      <rect x="18" y="78" width="124" height="14" rx="4" fill="#c4a27a" />
      <rect x="28" y="90" width="10" height="22" fill="#b08968" />
      <rect x="122" y="90" width="10" height="22" fill="#b08968" />
      <circle cx="42" cy="48" r="11" fill="#e7c2a4" />
      <rect x="30" y="60" width="24" height="26" rx="8" fill={accent} />
      <circle cx="78" cy="42" r="11" fill="#f0d0b4" />
      <rect x="66" y="54" width="24" height="28" rx="8" fill="#f4f1ea" />
      <circle cx="112" cy="50" r="11" fill="#d9aa88" />
      <rect x="100" y="62" width="24" height="24" rx="8" fill="#245c68" />
      <rect x="52" y="70" width="18" height="12" rx="2" fill="#f7f4ee" />
      <rect x="96" y="72" width="16" height="10" rx="2" fill="#efe8dc" />
    </svg>
  );
}

export default function MobileScreens({
  name,
  streak,
  page,
  total,
  session,
  now,
  reminderOn,
  onContinue,
  onOpenTimer,
  onOpenNotifications,
  onOpenBook,
  onAddReminder,
}: {
  name: string;
  streak: number;
  page: number;
  total: number;
  session: number;
  now: number;
  reminderOn: boolean;
  onContinue: () => void;
  onOpenTimer: () => void;
  onOpenNotifications: () => void;
  onOpenBook: (book: Book) => void;
  onAddReminder: () => void;
}) {
  const [screen, setScreen] = useState<Screen>("home");
  const [reminder, setReminder] = useState(false);
  const saveRaw = useSyncExternalStore(subscribeSave, readSaveSnapshot, () => "");
  const save = useMemo(() => parseSave(saveRaw), [saveRaw]);
  const [mode, setMode] = useState<"live" | "solo">("live");
  const [code, setCode] = useState("");
  const [showQuizzes, setShowQuizzes] = useState(false);
  const [showLeaders, setShowLeaders] = useState(false);
  const [active, setActive] = useState<Quiz | null>(null);
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState("");
  const [correct, setCorrect] = useState(0);
  const [finished, setFinished] = useState(false);
  const announcements = useAnnouncements();
  const featured = useCatalog().active;

  const secs = Math.max(0, Math.floor((session - now) / 1000));
  const days = String(Math.floor(secs / 86400)).padStart(2, "0");
  const hours = String(Math.floor((secs / 3600) % 24)).padStart(2, "0");
  const percent = Math.round((page / Math.max(1, total)) * 100);
  const dailyMinutes = Math.min(5, Math.max(1, streak));
  const dailyProgress = dailyMinutes * 20;
  const week = koreaWeekProgress(now);
  const quote = wisdom[0];
  const visibleQuizzes = showQuizzes ? quizzes : quizzes.slice(0, 2);

  const leaders = useMemo(() => {
    const mine = Object.values(save.scores);
    const mineScore = mine.length ? Math.max(...mine) : 0;
    const rows = [
      ...(mineScore ? [{ id: "me", name: name || "Siz", score: mineScore }] : []),
    ].sort((a, b) => b.score - a.score);
    return showLeaders ? rows : rows.slice(0, 3);
  }, [name, save.scores, showLeaders]);

  useEffect(() => {
    if (!reminder) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setReminder(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reminder]);

  function openQuizzes() {
    setScreen("quizzes");
    setMode("live");
    window.scrollTo({ top: 0 });
  }

  function goHome() {
    setScreen("home");
    setActive(null);
    window.scrollTo({ top: 0 });
  }

  function startQuiz(quiz: Quiz) {
    setActive(quiz);
    setStep(0);
    setPicked("");
    setCorrect(0);
    setFinished(false);
    setScreen("play");
    window.scrollTo({ top: 0 });
  }

  function submitAnswer() {
    if (!active || !picked) return;
    const question = active.questions[step];
    const nextCorrect = correct + (picked === question.answer ? 1 : 0);
    if (step + 1 >= active.questions.length) {
      setCorrect(nextCorrect);
      setFinished(true);
      const score = Math.round((nextCorrect / active.questions.length) * 100) * 3 + nextCorrect * 4;
      writeSave({
        ...save,
        scores: {
          ...save.scores,
          [active.id]: Math.max(save.scores[active.id] ?? 0, score),
        },
      });
      return;
    }
    setCorrect(nextCorrect);
    setStep((value) => value + 1);
    setPicked("");
  }

  function joinRoom(event: FormEvent) {
    event.preventDefault();
    const value = code.trim();
    if (!/^\d{6}$/.test(value)) {
      toast.error("Xona kodi 6 ta raqamdan iborat bo‘lsin");
      return;
    }
    if (value !== LIVE_ROOM) {
      toast.error("Bunday xona topilmadi");
      return;
    }
    writeSave({ ...save, joined: true });
    setCode("");
    toast.success("Kitob bilimdoni xonasiga qo‘shildingiz");
  }

  function joinLive() {
    writeSave({ ...save, joined: true });
    toast.success("Jonli viktorinaga qo‘shildingiz. Soat 20:00 da boshlanadi.");
  }

  const news = announcements.map((item) => ({ ...item, open: () => { setScreen("news"); window.scrollTo({ top: 0 }); } }));

  return (
    <div className="mobile-home">
      {screen === "home" && (
        <div className="m-screen m-home-screen">
          <header className="m-top">
            <p className="m-wordmark">BIR ILM</p>
            <div className="m-top-actions">
              <span className="m-daily-progress" aria-label={`Bugungi mutolaa ${dailyMinutes} daqiqa, maqsad 5 daqiqa`}>
                <TreePine size={18} />
                <span className="m-daily-ring" style={{ "--daily-progress": `${dailyProgress * 3.6}deg` } as CSSProperties}>
                  <b>{dailyMinutes}</b><small>/5</small>
                </span>
              </span>
              <button className="m-icon" type="button" aria-label="Pomodoro taymeri" onClick={onOpenTimer}>
                <Timer size={21} />
              </button>
              <button className="m-icon" type="button" aria-label="Bildirishnomalar" onClick={onOpenNotifications}>
                <Bell size={22} />
                <span className="m-alert-dot">3</span>
              </button>
            </div>
          </header>

          <div className="m-greeting-row">
            <div><h1 className="m-hello">Salom, {name}!</h1><p className="m-sub">Bugun ham bir sahifa oldinga.</p></div>
          </div>

          <section className="m-card m-week">
            <p className="m-kicker">Hafta kitobi</p>
            <div className="m-week-row">
              {featured ? <button type="button" className="m-week-cover" onClick={() => onOpenBook(featured)} aria-label={`${featured.title} haqida`}><BookCover title={featured.title} author={featured.author} tone="cream" image={featured.coverUrl} color={featured.color} /></button> : <BookCover title="Tez orada" author="Bir Ilm" tone="cream" />}
              <div>
                <h2>{featured?.title ?? "Haftaning kitobi hali tanlanmagan"}</h2>
                <p className="m-author">{featured?.author ?? "Admin tez orada e‘lon qiladi"}</p>
                {featured?.summary && <p className="m-blurb">{featured.summary.slice(0, 90)}{featured.summary.length > 90 ? "…" : ""}</p>}
              </div>
            </div>
            <div className={`m-week-timeline ${week.progress >= 80 ? "is-finishing" : ""}`}>
              <div className="m-week-labels"><span>Dush</span><strong>{week.label}</strong><span>Shan 22:00</span></div>
              <div className="m-week-track" aria-label={`Haftalik vaqtning ${week.progress} foizi o‘tdi`}>
                <span style={{ width: `${week.progress}%` }} />
                <Leaf size={17} style={{ left: `${Math.min(96, week.progress)}%` }} />
              </div>
            </div>
            <div className="m-progress">
              <div className="m-progress-track" aria-hidden="true">
                <span style={{ width: `${percent}%` }} />
              </div>
              <strong>{percent}%</strong>
            </div>
            <button className="m-primary" type="button" onClick={onContinue}>
              Mutolaani davom ettirish <ArrowRight size={18} />
            </button>
          </section>

          <section className="m-card m-wisdom">
            <Image src="/assets/adras.png" alt="" width={720} height={240} />
            <blockquote>{quote}</blockquote>
          </section>

          <div className="m-shortcuts">
            <button className="m-card m-shortcut" type="button" onClick={openQuizzes}>
              <Trophy size={22} />
              <strong>Viktorinalar</strong>
              <small>Bilimingizni sinang</small>
            </button>
          </div>

          <div className="m-section-head">
            <h2>Bir ilm yangiliklari</h2>
            <button type="button" onClick={() => { setScreen("news"); window.scrollTo({ top: 0 }); }}>
              Barchasini ko‘rish <ChevronRight size={16} />
            </button>
          </div>
          <div className="m-news-carousel" aria-label="Bir ilm yangiliklari">
            {!news.length && <p className="m-news-empty">Hozircha e‘lonlar yo‘q.</p>}
            {news.map((item) => <NewsCard key={item.id} item={item} />)}
          </div>
        </div>
      )}

      {screen === "news" && (
        <div className="m-screen">
          <Subhead title="Yangiliklar" onBack={goHome} />
          <div className="m-stack">
            {!news.length && <p className="m-news-empty">Hozircha e‘lonlar yo‘q. Admin e‘lon joylaganda shu yerda ko‘rinadi.</p>}
            {news.map((item) => (
              <NewsCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}

      {screen === "quizzes" && (
        <div className="m-screen">
          <Subhead title="Viktorinalar" onBack={goHome} />
          <div className="m-seg" role="tablist" aria-label="Viktorina turlari">
            <button type="button" role="tab" aria-selected={mode === "live"} className={mode === "live" ? "is-on" : ""} onClick={() => setMode("live")}>
              Jonli
            </button>
            <button type="button" role="tab" aria-selected={mode === "solo"} className={mode === "solo" ? "is-on" : ""} onClick={() => setMode("solo")}>
              Mustaqil
            </button>
          </div>

          {mode === "live" ? (
            <>
              <article className="m-card m-live-card">
                <BookCover title={featured?.title ?? "Bir Ilm"} author={featured?.author ?? ""} tone="cream" image={featured?.coverUrl} color={featured?.color} live />
                <div>
                  <h2>Kitob bilimdoni</h2>
                  <p className="m-author">{featured?.title ?? "Kitob bilimdoni"}</p>
                  <p className="m-quiet">{featured?.author ?? ""}</p>
                  <p className="m-meta">
                    <span><Clock size={14} /> Bugun, 20:00</span>
                    <span><Users size={14} /> {save.joined ? 25 : 24} ishtirokchi</span>
                  </p>
                  <button className="m-join" type="button" onClick={joinLive} disabled={save.joined}>
                    {save.joined ? "Qo‘shildingiz" : "Qo‘shilish"}
                  </button>
                </div>
              </article>

              <form className="m-code-block" onSubmit={joinRoom}>
                <label htmlFor="room-code">Xona kodi bilan qo‘shilish</label>
                <div className="m-code">
                  <input
                    id="room-code"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={6}
                    placeholder="Xona kodini kiriting (masalan, 123456)"
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  />
                  <button type="submit" aria-label="Xonaga qo‘shilish">
                    <ArrowRight size={18} />
                  </button>
                </div>
              </form>
            </>
          ) : (
            <p className="m-note">Mustaqil rejimda savollarni o‘z tezligingizda yechasiz. Natija shu qurilmada saqlanadi.</p>
          )}

          <div className="m-section-head">
            <h2>O‘zingizni sinang</h2>
            <button type="button" onClick={() => setShowQuizzes((value) => !value)}>
              {showQuizzes ? "Yig‘ish" : "Barchasini ko‘rish"} <ChevronRight size={16} />
            </button>
          </div>
          <div className="m-stack">
            {visibleQuizzes.map((quiz) => (
              <button className="m-card m-quiz-row" type="button" key={quiz.id} onClick={() => startQuiz(quiz)}>
                <BookCover title={quiz.title} author={quiz.author} tone={quiz.tone} size="sm" />
                <span>
                  <strong>{quiz.title}</strong>
                  <small>
                    <BookOpen size={13} /> {quiz.questions.length} savol
                    <Clock size={13} /> {quiz.minutes} daqiqa
                  </small>
                  {save.scores[quiz.id] != null && <em>Eng yaxshi: {save.scores[quiz.id]} ball</em>}
                </span>
                <ChevronRight size={18} />
              </button>
            ))}
          </div>

          <div className="m-section-head">
            <h2>Haftaning bilimdonlari</h2>
            <button type="button" onClick={() => setShowLeaders((value) => !value)}>
              {showLeaders ? "Yig‘ish" : "Barchasini ko‘rish"} <ChevronRight size={16} />
            </button>
          </div>
          <ol className="m-card m-leaders">
            {leaders.map((leader, index) => (
              <li key={leader.id}>
                <span className={`m-rank m-rank-${index + 1}`}>{index + 1}</span>
                <span className="m-avatar" aria-hidden="true">{leader.name.slice(0, 1)}</span>
                <strong>{leader.name}</strong>
                <em>{leader.score} ball</em>
              </li>
            ))}
          </ol>
        </div>
      )}

      {screen === "play" && active && (
        <div className="m-screen">
          <Subhead title={active.title} onBack={() => { setScreen("quizzes"); setActive(null); }} />
          {finished ? (
            <section className="m-card m-result">
              <Trophy size={28} />
              <h2>{correct} / {active.questions.length}</h2>
              <p>To‘g‘ri javoblar shu haftalik ballingizga qo‘shildi.</p>
              <button className="m-primary" type="button" onClick={() => startQuiz(active)}>Qayta urinish</button>
              <button className="m-text" type="button" onClick={() => setScreen("quizzes")}>Viktorinalarga qaytish</button>
            </section>
          ) : (
            <section className="m-card m-play">
              <p className="m-kicker">{step + 1} / {active.questions.length} savol</p>
              <h2>{active.questions[step].prompt}</h2>
              <div className="m-options">
                {active.questions[step].choices.map((choice) => (
                  <button
                    key={choice.id}
                    type="button"
                    className={picked === choice.id ? "is-picked" : ""}
                    aria-pressed={picked === choice.id}
                    onClick={() => setPicked(choice.id)}
                  >
                    {choice.text}
                    {picked === choice.id && <Check size={16} />}
                  </button>
                ))}
              </div>
              <button className="m-primary" type="button" disabled={!picked} onClick={submitAnswer}>
                {step + 1 === active.questions.length ? "Yakunlash" : "Keyingisi"}
              </button>
            </section>
          )}
        </div>
      )}

      {reminder && screen === "home" && (
        <div className="m-modal-root">
          <button className="m-modal-backdrop" type="button" aria-label="Eslatmani yopish" onClick={() => setReminder(false)} />
          <div className="m-modal" role="dialog" aria-modal="true" aria-labelledby="talk-reminder-title">
            <button className="m-modal-close" type="button" aria-label="Yopish" onClick={() => setReminder(false)}>
              <X size={18} />
            </button>
            <h2 id="talk-reminder-title">Kitob suhbati yaqin!</h2>
            <BookCover title={featured?.title ?? "Bir Ilm"} author={featured?.author ?? ""} tone="cream" size="lg" image={featured?.coverUrl} color={featured?.color} />
            <p className="m-quote">Bugungi kichik qadam ertangi o‘zgarishning boshlanishi.</p>
            <div className="m-talk-box">
              <p className="m-kicker">Kitob muhokamasi</p>
              <div className="m-talk-row">
                <Calendar size={18} />
                <CountBoxes days={days} hours={hours} />
              </div>
              <p className="m-when">
                <Clock size={16} /> Yakshanba, 18:00
              </p>
            </div>
            <button
              className="m-primary"
              type="button"
              onClick={() => {
                onAddReminder();
                setReminder(false);
              }}
            >
              <Bell size={18} /> {reminderOn ? "Eslatma yoqilgan" : "Eslatma qo‘shish"}
            </button>
            <button
              className="m-text"
              type="button"
              onClick={() => {
                setReminder(false);
                if (featured) onOpenBook(featured);
              }}
            >
              Kitobni ko‘rish
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Subhead({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="m-subhead">
      <button type="button" aria-label="Orqaga" onClick={onBack}>
        <ChevronLeft size={22} />
      </button>
      <h1>{title}</h1>
      <span />
    </header>
  );
}

function NewsCard({
  item,
}: {
  item: { id?: string; title: string; body: string; time: string; open: () => void };
}) {
  return (
    <button className="m-card m-news" type="button" onClick={item.open}>
      <DiscussionArt variant={item.id} />
      <span>
        <span className="m-news-brand">
          <b>BIR ILM</b>
          <em>Admin</em>
        </span>
        <strong>{item.title}</strong>
        <small>{item.body}</small>
        <time>{item.time}</time>
      </span>
    </button>
  );
}

type Announcement = { id: string; title: string; body: string; time: string };
function relativeTime(iso: string): string {
  const when = new Date(iso.replace(" ", "T") + (iso.endsWith("Z") ? "" : "Z")).getTime();
  const minutes = Math.max(0, Math.round((Date.now() - when) / 60000));
  if (minutes < 60) return minutes <= 1 ? "Hozirgina" : `${minutes} daqiqa oldin`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} soat oldin`;
  return new Date(when).toLocaleDateString("uz-UZ", { day: "numeric", month: "short" });
}

// Bosh sahifadagi yangiliklar — admin/moderator joylagan e'lonlar.
export function useAnnouncements(): Announcement[] {
  const [items, setItems] = useState<Announcement[]>([]);
  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/social?scope=announcements", { signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<{ posts?: { id: string; book: string; body: string; createdAt: string }[] }>) : null))
      .then((data) => {
        setItems((data?.posts ?? []).map((p) => ({ id: p.id, title: p.book, body: p.body, time: relativeTime(p.createdAt) })));
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, []);
  return items;
}
