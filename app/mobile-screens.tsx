"use client";

import { audioLinkOf } from "./listen-link";
import { FormEvent, useEffect, useMemo, useRef, useSyncExternalStore, useState } from "react";
import {
  ArrowRight,
  Bell,
  BellOff,
  BellRing,
  BookOpen,
  Calendar,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Headphones,
  Leaf,
  Pencil,
  Plus,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { wisdom, type Quiz } from "./quiz-data";
import { joinQuizByCode, saveQuizResult, useQuizzes } from "@/lib/api/quiz-client";
import { QUIZ_SESSION_OPENS_BEFORE_MIN, quizSessionStatus, type Quiz as ServerQuiz, type QuizSession } from "@/shared/contract";
import QuizEditor from "./quiz-editor";
import {
  QuizAddButton,
  QuizCard,
  QuizCardSkeleton,
  QuizCodeForm,
  QuizEmpty,
  QuizEntry,
  QuizHero,
  QuizLeaders,
  QuizLiveCard,
  type QuizLeader,
  type QuizMode,
} from "./quiz-ui";
import QuizPlay, { type SoloResult } from "./quiz-play";
import { useWisdom } from "@/lib/api/site-client";
import { WisdomCard, WisdomDialog, WisdomEditor, useWisdomPrompt } from "./wisdom";
import QuizLive from "./quiz-live";
import { notifyCatalogChanged, updateBook, useCatalog } from "@/lib/api/books-client";
import { useViewer } from "@/lib/api/roles-client";
import { canModerate } from "@/shared/contract/roles";
import BookEditor from "./book-editor";
import { fetchLiveSessions } from "@/lib/api/live-client";
import type { LiveSession } from "@/shared/contract/live";
import { TALKS_CHANGED, WEEKDAYS, clock, countdown, dayMonth, nextTalk, toggleTalkReminder, useTalkReminders } from "./talk-format";
import type { Book, MediaItem } from "@/shared/contract";
import { absoluteUrl } from "@/lib/api/config";
import { dayKey, listenedLabel, useLibrarySave } from "./library-store";
import { PomodoroButton } from "./focus-timer";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

type Save = {
  joined: boolean;
  scores: Record<string, number>;
};

type Screen = "home" | "news" | "quizzes" | "play" | "live";

/** "Bugun, 20:00" / "Ertaga, 20:00" / "12-okt, 20:00" (24 soatlik). */
function whenText(iso: string): string {
  const d = new Date(iso);
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const day = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime()) / 86_400_000);
  const MONTHS = ["yan", "fev", "mar", "apr", "may", "iyun", "iyul", "avg", "sen", "okt", "noy", "dek"];
  return `${day === 0 ? "Bugun" : day === 1 ? "Ertaga" : `${d.getDate()}-${MONTHS[d.getMonth()]}`}, ${hm}`;
}

// v2: ball tizimi o'zgardi (tezlikka qarab 500–1000), eski ballar yangisi bilan solishtirilmasin.
const SAVE_KEY = "bir-ilm-quiz-v2";
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
  image = null,
  color,
}: {
  title: string;
  author: string;
  tone: "cream" | "rose" | "ink";
  size?: "sm" | "md" | "lg";
  image?: string | null;
  color?: string;
}) {
  return (
    <div className={`m-cover m-cover-${tone} m-cover-${size}${image ? " has-image" : ""}`} style={color && !image ? { background: color, color: "#fff" } : undefined}>
      {image && <img src={image} alt="" />}
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

function DiscussionArt({ variant = "talk" }: { variant?: string }) {
  const background = variant === "quiz" ? "#e8e2d1" : variant === "habit" ? "#d7e8e8" : "#d7e4dc";
  const accent = variant === "quiz" ? "#b58b35" : variant === "habit" ? "#367688" : "#1f6b4e";
  return (
    <svg className="m-news-art" viewBox="0 0 160 132" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
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
  session,
  now,
  reminderOn,
  onContinue,
  onOpenNotifications,
  onOpenTalks,
  onOpenBook,
  onAddReminder,
}: {
  name: string;
  session: number;
  now: number;
  reminderOn: boolean;
  /** Hafta kitobi bo'lsa — o'sha kitob audio pleerda ochiladi. */
  onContinue: (book: Book | null) => void;
  onOpenNotifications: () => void;
  /** «Suhbatlar» bo'limiga o'tish. */
  onOpenTalks: () => void;
  onOpenBook: (book: Book) => void;
  onAddReminder: () => void;
}) {
  const [screen, setScreen] = useState<Screen>("home");
  // Hafta suhbati eslatmasi: qo'ng'iroqcha modal oynada so'raydi. «enable» ochilgan paytda belgilanadi —
  // yopilish animatsiyasida savol matni almashib ketmaydi.
  const [reminderAsk, setReminderAsk] = useState({ open: false, enable: true });
  const reminderBell = useRef<HTMLButtonElement>(null);
  const [reminder, setReminder] = useState(false);
  const saveRaw = useSyncExternalStore(subscribeSave, readSaveSnapshot, () => "");
  const save = useMemo(() => parseSave(saveRaw), [saveRaw]);
  const [mode, setMode] = useState<QuizMode>("live");
  const [code, setCode] = useState("");
  const [showQuizzes, setShowQuizzes] = useState(false);
  const [showLeaders, setShowLeaders] = useState(false);
  const [active, setActive] = useState<Quiz | null>(null);
  // Jonli xona: boshlovchi boshqaradigan o'yin (Kahoot uslubida).
  const [room, setRoom] = useState<{ quiz: Quiz; sessionId: string } | null>(null);
  const [joining, setJoining] = useState(false);
  const announcements = useAnnouncements();
  const unread = useUnreadCount(announcements);
  // Yangiliklar ekrani e'lonlarni to'liq ko'rsatadi — ochilgach ular o'qilgan hisoblanadi.
  useEffect(() => {
    if (screen === "news") markAnnouncementsRead(announcements.map((item) => item.id));
  }, [screen, announcements]);
  const catalog = useCatalog();
  const featured = catalog.active;
  const viewer = useViewer();
  const editor = canModerate(viewer?.role);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ book: Book | null } | null>(null);
  const [quizEditing, setQuizEditing] = useState<{ quiz: ServerQuiz | null } | null>(null);
  const serverQuizzes = useQuizzes();

  async function chooseWeekBook(id: string) {
    if (!id) return;
    try {
      await updateBook(id, { active: true });
      notifyCatalogChanged();
      toast.success("Hafta kitobi tanlandi");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Saqlanmadi.");
    }
  }
  const library = useLibrarySave();

  const secs = Math.max(0, Math.floor((session - now) / 1000));
  const days = String(Math.floor(secs / 86400)).padStart(2, "0");
  const hours = String(Math.floor((secs / 3600) % 24)).padStart(2, "0");
  // Tinglash tugmasi faqat hafta kitobiga tegishli: yuklangan audio — pleer, bo'lmasa tashqi havola.
  // Progress chizig'i faqat yuklangan audiosi bor kitobda (tashqi havolada tinglangan joy noma'lum).
  const featuredLink = featured ? audioLinkOf(featured) : null;
  const audioLength = featured?.audioUrl ? featured.audioSeconds : 0;
  const audioAt = featured ? library.progress[featured.id] ?? 0 : 0;
  const percent = audioLength ? Math.min(100, Math.round((audioAt / audioLength) * 100)) : 0;
  const todaySeconds = library.listenedDays[dayKey()] ?? 0;
  const bookSeconds = featured ? library.listenedBooks[featured.id] ?? 0 : 0;
  // Hafta kitobi suhbati: admin kitob oynasida yoki «Suhbatlar»da belgilagan haqiqiy vaqt.
  const [talks, setTalks] = useState<LiveSession[]>([]);
  useEffect(() => {
    const load = () => void fetchLiveSessions().then(setTalks);
    load();
    window.addEventListener(TALKS_CHANGED, load);
    return () => window.removeEventListener(TALKS_CHANGED, load);
  }, []);
  const talk = nextTalk(talks, featured?.title);
  const reminders = useTalkReminders();
  const reminded = talk ? reminders.includes(talk.id) : false;
  const talkAt = talk ? new Date(talk.scheduledAt) : null;
  // Chiziq: e'londan (7 kun oldin) suhbatgacha o'tgan vaqt.
  const talkProgress = talk
    ? talk.status === "live" ? 100 : Math.round(Math.max(0, Math.min(1, 1 - (Date.parse(talk.scheduledAt) - now) / (7 * 86_400_000))) * 100)
    : 0;
  // Kun hikmati serverdan (admin boshqaradi, hamma uchun bir xil). Server javob bermasa — ilovadagi ro'yxat.
  const wisdomData = useWisdom();
  const isAdmin = viewer?.role === "admin";
  const fallbackQuote = wisdom[Math.floor(now / 86_400_000) % wisdom.length] ?? wisdom[0];
  const todayWisdom = wisdomData.value.today ?? { id: "", text: fallbackQuote, author: "Bir Ilm", featuredOn: null, createdAt: "" };
  const [wisdomOpen, setWisdomOpen] = useWisdomPrompt(!wisdomData.loading && Boolean(wisdomData.value.today), screen === "home");
  const [wisdomEditing, setWisdomEditing] = useState(false);
  // Viktorinalar serverdan: admin/moderator qo'shadi va tahrirlaydi, har biri kitobga bog'lanishi mumkin.
  const quizzes = useMemo<Quiz[]>(() => serverQuizzes.items.map((q) => {
    const linked = q.bookId ? catalog.items.find((b) => b.id === q.bookId) : null;
    return {
      id: q.id,
      title: q.title,
      author: linked?.author ?? "",
      minutes: q.minutes,
      tone: "cream",
      image: q.image ?? linked?.coverUrl ?? null,
      color: linked?.color,
      questions: q.questions.map((qq) => ({ prompt: qq.prompt, choices: qq.choices.map((text, i) => ({ id: String(i), text })), answer: String(qq.answer) })),
    };
  }), [serverQuizzes.items, catalog.items]);
  const visibleQuizzes = showQuizzes ? quizzes : quizzes.slice(0, 2);
  // Eng yaqin (yoki hozir ochiq) jonli viktorina vaqti.
  const nextLive = useMemo(() => {
    const rows = serverQuizzes.items.flatMap((q) => q.sessions.map((session) => ({ q, session, status: quizSessionStatus(session.startsAt, now) })))
      .filter((r) => r.status !== "closed")
      .sort((a, b) => a.session.startsAt.localeCompare(b.session.startsAt));
    const row = rows[0];
    const quiz = row ? quizzes.find((x) => x.id === row.q.id) : null;
    return row && quiz ? { quiz, session: row.session as QuizSession, status: row.status } : null;
  }, [serverQuizzes.items, quizzes, now]);

  const leaderRows = useMemo<QuizLeader[]>(() => {
    const mine = Object.values(save.scores);
    const mineScore = mine.length ? Math.max(...mine) : 0;
    return [
      ...(mineScore ? [{ id: "me", name: name || "Siz", score: mineScore, me: true }] : []),
    ].sort((a, b) => b.score - a.score);
  }, [name, save.scores]);
  const leaders = showLeaders ? leaderRows : leaderRows.slice(0, 3);
  // Sahifa boshidagi qisqa statistika: shu qurilmada yechilgan viktorinalar va eng yaxshi ball.
  const quizStats = useMemo(() => {
    const solved = quizzes.map((quiz) => save.scores[quiz.id]).filter((score): score is number => score != null);
    return { count: quizzes.length, solved: solved.length, best: solved.length ? Math.max(...solved) : null };
  }, [quizzes, save.scores]);

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
    setQuizEditing(null);
    setMode("live");
    window.scrollTo({ top: 0 });
  }

  function goHome() {
    setScreen("home");
    setActive(null);
    window.scrollTo({ top: 0 });
  }

  /** Mustaqil rejim (yoki jonli vaqt oynasida, lekin boshlovchisiz — `sessionId` bilan). */
  function startQuiz(quiz: Quiz, sessionId: string | null = null) {
    setActive(quiz);
    setActiveSession(sessionId);
    setScreen("play");
    window.scrollTo({ top: 0 });
  }

  /** Jonli xona: boshlovchi boshqaradi, hamma bir vaqtda javob beradi. */
  function openRoom(quiz: Quiz, sessionId: string) {
    setRoom({ quiz, sessionId });
    setScreen("live");
    window.scrollTo({ top: 0 });
  }

  function finishSolo(result: SoloResult) {
    if (!active) return;
    // Kirgan foydalanuvchining natijasi serverga ham yoziladi (jonli viktorinada ishtirokchilar soni shundan).
    if (viewer?.signedIn) void saveQuizResult({ quizId: active.id, sessionId: activeSession, correct: result.correct, total: result.total, score: result.score }).catch(() => {});
    writeSave({ ...save, scores: { ...save.scores, [active.id]: Math.max(save.scores[active.id] ?? 0, result.score) } });
  }

  async function joinRoom(event: FormEvent) {
    event.preventDefault();
    const value = code.trim();
    if (!/^\d{6}$/.test(value)) {
      toast.error("Xona kodi 6 ta raqamdan iborat bo‘lsin");
      return;
    }
    if (joining) return;
    setJoining(true);
    try {
      const joined = await joinQuizByCode(value);
      const found = quizzes.find((q) => q.id === joined.quizId);
      if (!found) return void toast.error("Viktorina topilmadi");
      if (joined.status === "upcoming") return void toast.error(`Hali boshlanmadi: ${whenText(joined.startsAt)}. Kirish ${QUIZ_SESSION_OPENS_BEFORE_MIN} daqiqa oldin ochiladi.`);
      if (joined.status === "closed") return void toast.error("Bu viktorinaning vaqti o‘tib ketgan");
      setCode("");
      openRoom(found, joined.sessionId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bunday xona topilmadi");
    } finally {
      setJoining(false);
    }
  }

  const news = announcements.map((item) => ({ ...item, open: () => { setScreen("news"); window.scrollTo({ top: 0 }); } }));

  return (
    <div className="mobile-home">
      {screen === "home" && (
        <div className="m-screen m-home-screen">
          <header className="m-top">
            <p className="m-wordmark">BIR ILM</p>
            <div className="m-top-actions">
              <PomodoroButton className="m-icon" />
              <button className="m-icon" type="button" aria-label="Bildirishnomalar" onClick={onOpenNotifications}>
                <Bell size={22} />
                {unread > 0 && <span className="m-alert-dot">{unread > 9 ? "9+" : unread}</span>}
              </button>
            </div>
          </header>

          <div className="m-greeting-row m-hero">
            <div><h1 className="m-hello">Assalomu alaykum, <em>{name}</em></h1><p className="m-sub">Bugun ham bir sahifa oldinga.</p></div>
          </div>

          <section className="m-card m-week">
            <div className="m-week-head">
              <p className="m-kicker">Hafta kitobi</p>
              <div className="m-week-tools">
                {talk && talkAt && talk.status !== "live" && (
                  <button
                    ref={reminderBell}
                    type="button"
                    className={`m-week-edit m-week-edit-icon m-talk-bell${reminded ? " on" : ""}`}
                    aria-pressed={reminded}
                    aria-haspopup="dialog"
                    aria-label={reminded ? "Suhbat eslatmasi yoqilgan" : "Suhbat uchun eslatma qo‘yish"}
                    title={reminded ? "Eslatma yoqilgan" : "Eslatma qo‘yish"}
                    onClick={() => setReminderAsk({ open: true, enable: !reminded })}
                  >
                    {reminded ? <BellRing size={16} /> : <Bell size={16} />}
                  </button>
                )}
                {editor && featured && (
                  <button type="button" className="m-week-edit m-week-edit-icon" onClick={() => setEditing({ book: featured })} aria-label="Hafta kitobini tahrirlash" title="Tahrirlash">
                    <Pencil size={16} />
                  </button>
                )}
              </div>
            </div>
            {talk && talkAt && talk.status !== "live" && (
              <Dialog open={reminderAsk.open} onOpenChange={(open) => setReminderAsk((ask) => ({ ...ask, open }))}>
                <DialogContent
                  className="talk-remind-dialog"
                  showCloseButton={false}
                  // Trigger komponenti yo'q — yopilganda fokus qo'ng'iroqchaga qaytariladi.
                  onCloseAutoFocus={(event) => { event.preventDefault(); reminderBell.current?.focus(); }}
                >
                  <span className="talk-remind-icon" aria-hidden="true">
                    {reminderAsk.enable ? <BellRing size={26} /> : <BellOff size={26} />}
                  </span>
                  <DialogTitle>{reminderAsk.enable ? "Eslatmani yoqasizmi?" : "Eslatmani o‘chiraymi?"}</DialogTitle>
                  <DialogDescription>
                    «{talk.title}» — {dayMonth(talkAt)}, {WEEKDAYS[talkAt.getDay()]}, soat {clock(talkAt)}
                  </DialogDescription>
                  <div className="talk-remind-actions">
                    <button
                      type="button"
                      className="talk-remind-yes"
                      onClick={() => {
                        // Holat boshqa joyda allaqachon o'zgargan bo'lsa, qayta almashtirilmaydi.
                        if (reminded !== reminderAsk.enable) toggleTalkReminder(talk.id);
                        setReminderAsk((ask) => ({ ...ask, open: false }));
                        toast.success(reminderAsk.enable ? `${dayMonth(talkAt)}, ${clock(talkAt)} uchun eslatma qo‘yildi` : "Eslatma olib tashlandi");
                      }}
                    >Ha</button>
                    <DialogClose className="talk-remind-no">Yo‘q</DialogClose>
                  </div>
                </DialogContent>
              </Dialog>
            )}
            {editor && !featured && (
              <div className="m-week-admin">
                <button type="button" className="m-week-add" onClick={() => setEditing({ book: null })}>
                  <Plus size={18} /> Yangi hafta kitobini joylash
                </button>
                {catalog.items.length > 0 && (
                  <select aria-label="Kutubxonadagi kitobni hafta kitobi qilish" value="" onChange={(e) => void chooseWeekBook(e.target.value)}>
                    <option value="">yoki kutubxonadan tanlang…</option>
                    {catalog.items.map((b) => <option key={b.id} value={b.id}>{b.title} — {b.author}</option>)}
                  </select>
                )}
                <small>Muqova rasmi va bir nechta audio qism kitob oynasida yuklanadi.</small>
              </div>
            )}
            <div className="m-week-row">
              {featured ? <button type="button" className="m-week-cover" onClick={() => onOpenBook(featured)} aria-label={`${featured.title} haqida`}><BookCover title={featured.title} author={featured.author} tone="cream" image={featured.coverUrl} color={featured.color} /></button> : <BookCover title="Tez orada" author="Bir Ilm" tone="cream" />}
              <div>
                <h2>{featured?.title ?? "Haftaning kitobi hali tanlanmagan"}</h2>
                <p className="m-author">{featured?.author ?? "Admin tez orada e‘lon qiladi"}</p>
                {featured?.summary && <p className="m-blurb">{featured.summary.slice(0, 90)}{featured.summary.length > 90 ? "…" : ""}</p>}
              </div>
            </div>
            {talk && talkAt ? (
              <div className={`m-week-timeline m-talk-next ${talkProgress >= 80 ? "is-finishing" : ""}`}>
                <button type="button" className="m-talk-when" onClick={onOpenTalks}>
                  <span className={`m-talk-badge${talk.status === "live" ? " live" : ""}`}>{talk.status === "live" ? "JONLI" : "SUHBAT"}</span>
                  <strong>{talk.title}</strong>
                </button>
                <div className="m-week-labels">
                  <span>E’lon</span>
                  <strong>{talk.status === "live" ? "Suhbat boshlandi" : countdown(talk.scheduledAt, now)}</strong>
                  <span>{dayMonth(talkAt)} {clock(talkAt)}</span>
                </div>
                <div className="m-week-track" aria-label={`Suhbatgacha vaqtning ${talkProgress} foizi o‘tdi`}>
                  <span style={{ width: `${talkProgress}%` }} />
                  <Leaf size={17} style={{ left: `${Math.min(96, talkProgress)}%` }} />
                </div>
              </div>
            ) : (
              editor && featured && <p className="m-talk-none">Suhbat vaqti belgilanmagan — «Tahrirlash»dan kalendar orqali tanlang.</p>
            )}
            {featured?.audioUrl && (
              <>
                <div className="m-progress">
                  <div className="m-progress-track" aria-hidden="true">
                    <span style={{ width: `${percent}%` }} />
                  </div>
                  <strong>{percent}%</strong>
                </div>
                <p className="m-listened">
                  <Headphones size={15} />
                  {bookSeconds ? <>Tinglandi: <b>{listenedLabel(bookSeconds)}</b></> : "Hali tinglanmagan"}
                  {todaySeconds > 0 && <span>· bugun {listenedLabel(todaySeconds)}</span>}
                </p>
              </>
            )}
            {featured?.audioUrl ? (
              <button className="m-primary m-listen-cta" type="button" onClick={() => onContinue(featured)} aria-label={`${featured.title} — tinglash`}>
                <Headphones size={20} />
                <span className="m-listen-title">{featured.title}</span>
                <ArrowRight size={18} />
              </button>
            ) : featured && featuredLink ? (
              <a
                className="m-primary m-listen-cta"
                href={featuredLink.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${featured.title} — ${featuredLink.label} orqali tinglash (yangi oynada ochiladi)`}
              >
                <Headphones size={20} />
                <span className="m-listen-title">{featured.title}</span>
                <ExternalLink size={17} />
              </a>
            ) : featured ? (
              editor ? (
                <button type="button" className="m-listen-soon is-editor" onClick={() => setEditing({ book: featured })}>
                  <Plus size={17} /> Audio yoki havola qo‘shish
                </button>
              ) : (
                <p className="m-listen-soon"><Headphones size={17} /> Audio tez orada qo‘shiladi</p>
              )
            ) : (
              <button className="m-primary m-listen-cta" type="button" onClick={() => onContinue(null)}>
                <Headphones size={20} />
                <span className="m-listen-title">Audiokitoblarni ko‘rish</span>
                <ArrowRight size={18} />
              </button>
            )}
          </section>

          <WisdomCard wisdom={todayWisdom} admin={isAdmin} onOpen={() => setWisdomOpen(true)} onEdit={() => setWisdomEditing(true)} />

          <div className="m-shortcuts">
            <QuizEntry
              count={serverQuizzes.loading ? null : quizzes.length}
              live={nextLive ? { open: nextLive.status === "open", when: whenText(nextLive.session.startsAt) } : null}
              onOpen={openQuizzes}
            />
          </div>

          <div className="m-section-head">
            <h2>Yangiliklar</h2>
            <button type="button" onClick={() => { setScreen("news"); window.scrollTo({ top: 0 }); }}>
              Barchasi <ChevronRight size={16} />
            </button>
          </div>
          <div className="m-news-carousel" aria-label="Yangiliklar">
            {!news.length && <p className="m-news-empty">Hozircha e‘lonlar yo‘q.</p>}
            {news.slice(0, 3).map((item) => <NewsCard key={item.id} item={item} />)}
          </div>
        </div>
      )}

      {screen === "news" && (
        <div className="m-screen m-solid-head">
          <Subhead title="Yangiliklar" onBack={goHome} />
          <div className="m-stack">
            {!news.length && <p className="m-news-empty">Hozircha e‘lonlar yo‘q. Admin e‘lon joylaganda shu yerda ko‘rinadi.</p>}
            {news.map((item) => (
              <NewsCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}

      {screen === "quizzes" && quizEditing && (
        <div className="m-contents m-solid-head">
          <QuizEditor key={quizEditing.quiz?.id ?? "new"} quiz={quizEditing.quiz} onClose={() => setQuizEditing(null)} />
        </div>
      )}
      {screen === "quizzes" && !quizEditing && (
        <div className="m-screen qz-screen">
          <QuizHero mode={mode} onMode={setMode} onBack={goHome} stats={quizStats} />

          <div className="qz-panel" role="tabpanel" id="qz-panel" aria-labelledby={`qz-tab-${mode}`}>
            {mode === "live" ? (
              <>
                {nextLive ? (
                  <QuizLiveCard
                    cover={<BookCover title={nextLive.quiz.title} author={nextLive.quiz.author} tone="cream" image={nextLive.quiz.image} color={nextLive.quiz.color} />}
                    title={nextLive.quiz.title}
                    author={nextLive.quiz.author}
                    when={whenText(nextLive.session.startsAt)}
                    participants={nextLive.session.participants}
                    open={nextLive.status === "open"}
                    countdown={countdown(nextLive.session.startsAt, now)}
                    code={editor ? nextLive.session.code : null}
                    staff={editor}
                    onJoin={() => openRoom(nextLive.quiz, nextLive.session.id)}
                  />
                ) : (
                  <QuizEmpty
                    icon={<CalendarClock size={18} />}
                    title="Hozircha jonli viktorina belgilanmagan"
                    text={editor ? "Viktorinani tahrirlab, unga vaqt va kirish kodini qo‘shing." : "Jonli viktorina vaqti e’lon qilinganda shu yerda ko‘rinadi."}
                  />
                )}
                <QuizCodeForm code={code} busy={joining} onCode={setCode} onSubmit={joinRoom} />
              </>
            ) : (
              <p className="qz-solo">
                <UserRound size={18} aria-hidden="true" />
                <span>Mustaqil rejimda savollarni o‘z tezligingizda yechasiz. Natija shu qurilmada saqlanadi.</span>
              </p>
            )}
          </div>

          <div className="m-section-head">
            <h2>O‘zingizni sinang</h2>
            {quizzes.length > 2 && (
              <button type="button" onClick={() => setShowQuizzes((value) => !value)}>
                {showQuizzes ? "Yig‘ish" : "Barchasi"} <ChevronRight size={16} />
              </button>
            )}
          </div>
          {editor && <QuizAddButton onClick={() => setQuizEditing({ quiz: null })} />}
          {!serverQuizzes.loading && quizzes.length === 0 && (
            <QuizEmpty
              icon={<BookOpen size={18} />}
              title="Hozircha viktorina yo‘q"
              text={editor ? "«Viktorina qo‘shish» tugmasi bilan kitob bo‘yicha savollar qo‘shing." : "Yangi viktorinalar tez orada qo‘shiladi."}
            />
          )}
          <div className="qz-list">
            {serverQuizzes.loading && quizzes.length === 0 && (
              <>
                <QuizCardSkeleton />
                <QuizCardSkeleton />
              </>
            )}
            {visibleQuizzes.map((quiz) => (
              <QuizCard
                key={quiz.id}
                cover={<BookCover title={quiz.title} author={quiz.author} tone={quiz.tone} size="sm" image={quiz.image} color={quiz.color} />}
                title={quiz.title}
                author={quiz.author}
                questions={quiz.questions.length}
                minutes={quiz.minutes}
                best={save.scores[quiz.id] ?? null}
                onStart={() => startQuiz(quiz)}
                onEdit={editor ? () => setQuizEditing({ quiz: serverQuizzes.items.find((x) => x.id === quiz.id) ?? null }) : undefined}
              />
            ))}
          </div>

          <div className="m-section-head">
            <h2>Haftaning bilimdonlari</h2>
            {leaderRows.length > 3 && (
              <button type="button" onClick={() => setShowLeaders((value) => !value)}>
                {showLeaders ? "Yig‘ish" : "Barchasi"} <ChevronRight size={16} />
              </button>
            )}
          </div>
          <QuizLeaders rows={leaders} />
        </div>
      )}

      {screen === "play" && active && (
        <div className="m-screen m-solid-head qz-play-screen">
          <Subhead title={active.title} onBack={() => { setScreen("quizzes"); setActive(null); }} />
          <QuizPlay
            key={active.id}
            quiz={active}
            cover={<BookCover title={active.title} author={active.author} tone={active.tone} image={active.image} color={active.color} />}
            best={save.scores[active.id] ?? null}
            live={activeSession != null}
            onFinish={finishSolo}
            onBack={() => { setScreen("quizzes"); setActive(null); }}
          />
        </div>
      )}

      {screen === "live" && room && (
        <div className="m-screen m-solid-head qz-play-screen">
          <Subhead title={room.quiz.title} onBack={() => { setScreen("quizzes"); setRoom(null); }} />
          <QuizLive
            sessionId={room.sessionId}
            onBack={() => { setScreen("quizzes"); setRoom(null); }}
            onSolo={() => { const { quiz, sessionId } = room; setRoom(null); startQuiz(quiz, sessionId); }}
          />
        </div>
      )}

      <WisdomDialog
        open={wisdomOpen}
        onOpenChange={setWisdomOpen}
        wisdom={todayWisdom}
        admin={isAdmin}
        onEdit={() => { setWisdomOpen(false); setWisdomEditing(true); }}
      />
      {isAdmin && (
        <WisdomEditor open={wisdomEditing} onOpenChange={setWisdomEditing} items={wisdomData.value.items ?? []} todayId={wisdomData.value.today?.id ?? null} />
      )}

      <BookEditor open={Boolean(editing)} book={editing?.book ?? null} asWeekBook={!editing?.book} onClose={() => setEditing(null)} />

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
  item: { id?: string; title: string; body: string; time: string; image: string | null; open: () => void };
}) {
  return (
    <button className="m-card m-news" type="button" onClick={item.open}>
      {item.image ? <img className="m-news-art m-news-photo" src={item.image} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <DiscussionArt variant={item.id} />}
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

/** `image` — e'lonning birinchi rasmi (albomdan, bo'lmasa matn ichidan); rasm yo'q bo'lsa null. */
export type Announcement = { id: string; title: string; body: string; time: string; at: number; image: string | null };
type AnnouncementPost = { id: string; title?: string; book: string; body: string; createdAt: string; media?: MediaItem[]; attachments?: string[] };
const parseTime = (iso: string) => new Date(iso.replace(" ", "T") + (iso.endsWith("Z") ? "" : "Z")).getTime();

function relativeTime(iso: string): string {
  const when = parseTime(iso);
  const minutes = Math.max(0, Math.round((Date.now() - when) / 60000));
  if (minutes < 60) return minutes <= 1 ? "Hozirgina" : `${minutes} daqiqa oldin`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} soat oldin`;
  // Brauzerning "uz" lokali ba'zan "M10 13" deb chiqaradi — o'zimizning "13-okt" ko'rinishi.
  return dayMonth(new Date(when));
}

function announcementImage(post: AnnouncementPost): string | null {
  const media = post.media ?? [];
  const album = (post.attachments ?? []).flatMap((id) => media.filter((item) => item.id === id));
  const image = [...album, ...media].find((item) => item.kind === "image");
  return image ? absoluteUrl(image.url) : null;
}

// Bosh sahifadagi yangiliklar — admin/moderator joylagan e'lonlar.
export function useAnnouncements(): Announcement[] {
  const [items, setItems] = useState<Announcement[]>([]);
  useEffect(() => {
    const ctrl = new AbortController();
    const load = () => fetch("/api/social?scope=announcements", { signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<{ posts?: AnnouncementPost[] }>) : null))
      .then((data) => {
        setItems((data?.posts ?? []).map((p) => ({ id: p.id, title: p.title || p.book, body: p.body, time: relativeTime(p.createdAt), at: parseTime(p.createdAt), image: announcementImage(p) })));
      })
      .catch(() => {});
    load();
    // Suhbat e'lon bilan belgilansa — yangi e'lon darhol ko'rinsin.
    window.addEventListener(TALKS_CHANGED, load);
    return () => {
      window.removeEventListener(TALKS_CHANGED, load);
      ctrl.abort();
    };
  }, []);
  return items;
}

// O'qilgan e'lonlar: har biri alohida belgilanadi (qo'ng'iroqchada faqat o'qilmaganlari qoladi).
// Eski versiya oyna ochilgan vaqtni saqlardi — undan oldingi e'lonlar ham o'qilgan hisoblanadi.
const READ_KEY = "bir-announcements-read";
const LEGACY_SEEN_KEY = "bir-notifications-seen";
const READ_EVENT = "bir-announcements-read";
const READ_LIMIT = 200;

type ReadState = { ids: ReadonlySet<string>; before: number };
const NO_READS: ReadState = { ids: new Set(), before: 0 };
let readCache: { raw: string; state: ReadState } = { raw: "", state: NO_READS };

function readRaw(): string {
  try {
    return `${localStorage.getItem(READ_KEY) ?? ""}|${localStorage.getItem(LEGACY_SEEN_KEY) ?? ""}`;
  } catch {
    return "";
  }
}

/** useSyncExternalStore uchun barqaror snapshot: saqlangan qiymat o'zgarmasa — o'sha obyekt. */
function readState(): ReadState {
  const raw = readRaw();
  if (raw === readCache.raw) return readCache.state;
  const [list, seen] = raw.split("|");
  let ids: string[] = [];
  try {
    const parsed: unknown = JSON.parse(list || "[]");
    if (Array.isArray(parsed)) ids = parsed.filter((id): id is string => typeof id === "string");
  } catch { /* buzilgan qiymat — o'qilmagan deb hisoblanadi */ }
  readCache = { raw, state: { ids: new Set(ids), before: Number(seen) || 0 } };
  return readCache.state;
}

const isRead = (item: Announcement, state: ReadState) => item.at <= state.before || state.ids.has(item.id);

export function markAnnouncementsRead(ids: string[]) {
  if (!ids.length) return;
  const next = [...new Set([...readState().ids, ...ids])].slice(-READ_LIMIT);
  try {
    localStorage.setItem(READ_KEY, JSON.stringify(next));
  } catch {
    /* shaxsiy rejim — holat shu sessiyada saqlanmaydi */
  }
  window.dispatchEvent(new Event(READ_EVENT));
}

function subscribeRead(onChange: () => void) {
  window.addEventListener(READ_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(READ_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Hali ochilmagan e'lonlar (yangisi tepada, ro'yxat tartibida). */
export function useUnreadAnnouncements(items: Announcement[]): Announcement[] {
  const state = useSyncExternalStore(subscribeRead, readState, () => NO_READS);
  return useMemo(() => items.filter((item) => !isRead(item, state)), [items, state]);
}

export function useUnreadCount(items: Announcement[]): number {
  return useUnreadAnnouncements(items).length;
}
