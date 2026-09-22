"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  BadgeCheck,
  Bell,
  BookOpen,
  Check,
  ChevronRight,
  Clock,
  Crown,
  Database,
  Flame,
  Headphones,
  Home,
  Medal,
  MessageSquare,
  MonitorSmartphone,
  Plus,
  Send,
  Settings,
  Smartphone,
  Star,
  Trophy,
  Upload,
  Users,
  UserRound,
  Wifi,
  X,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { toast, Toaster } from "sonner";
import LiveSession from "./live-session";
import ReadingDashboard from "./reading-dashboard";
import BookDiscovery from "./book-discovery";
import FocusTimer from "./focus-timer";
import MobileScreens from "./mobile-screens";
import {
  Book,
  CommunityComment,
  LeaderboardMember,
  books,
  seedComments,
  seedLeaderboard,
} from "./app-data";

type BackendMode = "local" | "server" | "seed";

type State = {
  name: string;
  page: number;
  total: number;
  shelf: string[];
  comments: CommunityComment[];
  note: string;
  reading: boolean;
  talk: boolean;
  onboarded: boolean;
  streak: number;
  points: number;
  activeDays: number;
  lastActiveDate: string;
};

type Recording = {
  id: string;
  title: string;
  file: Blob;
  url?: string;
};

type AppStatePayload = {
  type?: "comment" | "progress" | "profile";
  text?: string;
  page?: number;
  total?: number;
};

const nav = [
  ["home", "Home", Home],
  ["community", "Community", Users],
  ["talks", "Suhbatlar", MessageSquare],
  ["shelf", "Javonim", BookOpen],
  ["profile", "Profil", UserRound],
] as const;

const initial: State = {
  name: "Kitobxon",
  page: 0,
  total: books[0]?.pages ?? 320,
  shelf: [books[0]?.id ?? "atomic-habits"],
  note: "",
  reading: false,
  talk: false,
  onboarded: false,
  comments: seedComments,
  streak: 0,
  points: 120,
  activeDays: 0,
  lastActiveDate: "",
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayKey() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return date.toISOString().slice(0, 10);
}

function nextSession() {
  const date = new Date();
  date.setHours(18, 0, 0, 0);
  date.setDate(date.getDate() + ((7 - date.getDay()) % 7));
  if (date.getTime() <= Date.now()) date.setDate(date.getDate() + 7);
  return date.getTime();
}

function normalizeSavedState(
  saved: (Partial<State> & { shelf?: unknown[] }) | null,
) {
  if (!saved) return initial;

  const shelf = Array.isArray(saved.shelf)
    ? saved.shelf
        .map((item) => {
          if (typeof item === "number") return books[item]?.id;
          if (typeof item === "string") return item;
          return null;
        })
        .filter((item): item is string => Boolean(item))
    : initial.shelf;

  return {
    ...initial,
    ...saved,
    shelf,
    comments: Array.isArray(saved.comments) ? saved.comments : initial.comments,
  };
}

function getInitialState() {
  if (typeof window === "undefined") return initial;

  try {
    const raw =
      window.localStorage.getItem("bir-ilm-v2") ??
      window.localStorage.getItem("bir-ilm-v1");
    return normalizeSavedState(raw ? JSON.parse(raw) : null);
  } catch {
    return initial;
  }
}

function audioDB(
  action: "all" | "put" | "delete",
  value?: Recording | string,
): Promise<Recording[]> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("bir-ilm-audio", 1);
    open.onupgradeneeded = () => {
      open.result.createObjectStore("audio", { keyPath: "id" });
    };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("audio", action === "all" ? "readonly" : "readwrite");
      const store = tx.objectStore("audio");
      const request =
        action === "all"
          ? store.getAll()
          : action === "put"
            ? store.put(value)
            : store.delete(value as string);

      tx.oncomplete = () => {
        resolve(action === "all" ? (request.result as Recording[]) : []);
        db.close();
      };
      tx.onerror = () => reject(tx.error);
    };
  });
}

function Brand() {
  return (
    <div className="brand brand-with-logo">
      <Image src="/assets/bir-ilm-logo.jpg" alt="BIR ILM" width={62} height={62} />
      <div>
        <span className="wordmark">BIR ILM</span>
        <span className="brand-tag">SINANG, QO&apos;LLANG, ULASHING</span>
      </div>
    </div>
  );
}

function activityFromState(data: State) {
  const ownComments = data.comments.filter((comment) => !comment.demo).length;
  const booksFinished = data.page >= data.total ? 1 : 0;
  const score = data.points + data.page * 2 + ownComments * 35 + data.streak * 25;

  return {
    score,
    streak: data.streak,
    activeDays: data.activeDays,
    comments: ownComments,
    books: booksFinished,
    pages: data.page,
  };
}

function mergeLeaders(
  data: State,
  serverLeaders: LeaderboardMember[],
): Array<LeaderboardMember & { current?: boolean }> {
  const activity = activityFromState(data);
  const current: LeaderboardMember & { current: true } = {
    id: "me",
    name: data.name || "Kitobxon",
    pages: activity.pages,
    books: activity.books,
    comments: activity.comments,
    streak: activity.streak,
    score: activity.score,
    trend: "siz",
    current: true,
  };

  const rows: Array<LeaderboardMember & { current?: boolean }> = [
    current,
    ...serverLeaders,
    ...seedLeaderboard,
  ];
  const unique = new Map<string, LeaderboardMember & { current?: boolean }>();
  rows.forEach((row) => {
    const key = row.current ? "me" : row.id;
    if (!unique.has(key)) unique.set(key, row);
  });

  return [...unique.values()].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.streak !== a.streak) return b.streak - a.streak;
    return b.pages - a.pages;
  });
}

export default function App() {
  const [data, setData] = useState<State>(initial);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState("home");
  const [now, setNow] = useState(0);
  const [session, setSession] = useState(0);
  const [modal, setModal] = useState("");
  const [selected, setSelected] = useState<Book>(books[0]);
  const [message, setMessage] = useState("");
  const [audio, setAudio] = useState<Recording[]>([]);
  const [audioTitle, setAudioTitle] = useState("Atom odatlar muhokamasi");
  const [busy, setBusy] = useState(false);
  const [backendMode, setBackendMode] = useState<BackendMode>("local");
  const [serverLeaders, setServerLeaders] = useState<LeaderboardMember[]>([]);

  const pct = Math.round((data.page / Math.max(1, data.total)) * 100);
  const secs = Math.max(0, Math.floor((session - now) / 1000));
  const timer = `${Math.floor(secs / 86400)} kun ${String(
    Math.floor(secs / 3600) % 24,
  ).padStart(2, "0")}:${String(Math.floor(secs / 60) % 60).padStart(
    2,
    "0",
  )}:${String(secs % 60).padStart(2, "0")}`;
  const leaders = useMemo(
    () => mergeLeaders(data, serverLeaders),
    [data, serverLeaders],
  );
  const myRank = Math.max(1, leaders.findIndex((leader) => leader.current) + 1);
  const backendLabel =
    backendMode === "server"
      ? "Backend faol"
      : backendMode === "seed"
        ? "Seed holat"
        : "Qurilma xotirasi";

  const update = (patch: Partial<State>) =>
    setData((value) => ({ ...value, ...patch }));

  const touchActivity = (points = 20) => {
    setData((value) => {
      const today = todayKey();
      const isNewDay = value.lastActiveDate !== today;
      return {
        ...value,
        points: value.points + points,
        lastActiveDate: today,
        activeDays: isNewDay ? value.activeDays + 1 : value.activeDays,
        streak: isNewDay
          ? value.lastActiveDate === yesterdayKey()
            ? value.streak + 1
            : 1
          : Math.max(1, value.streak),
      };
    });
  };

  const syncState = async (payload: AppStatePayload, snapshot = data) => {
    try {
      const response = await fetch("/api/app-state", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...payload,
          userId: "local-reader",
          name: snapshot.name,
          activity: activityFromState(snapshot),
        }),
      });
      if (response.ok) setBackendMode("server");
    } catch {
      setBackendMode("local");
    }
  };

  const go = (value: string) => {
    setTab(value);
    window.scrollTo({ top: 0 });
  };

  useEffect(() => {
    queueMicrotask(() => {
      setData(getInitialState());
      setReady(true);
      setNow(Date.now());
      setSession(nextSession());
    });

    fetch("/api/app-state")
      .then((response) => response.json())
      .then((payload) => {
        const appState = payload as {
          mode?: BackendMode;
          comments?: CommunityComment[];
          leaderboard?: LeaderboardMember[];
        };
        if (appState.mode) setBackendMode(appState.mode);
        if (Array.isArray(appState.comments) && appState.comments.length) {
          setData((value) => ({ ...value, comments: appState.comments! }));
        }
        if (Array.isArray(appState.leaderboard)) {
          setServerLeaders(appState.leaderboard);
        }
      })
      .catch(() => setBackendMode("local"));

    audioDB("all")
      .then((rows) =>
        setAudio(rows.map((row) => ({ ...row, url: URL.createObjectURL(row.file) }))),
      )
      .catch(() => toast.error("Audio xotirasi mavjud emas"));

    const tick = setInterval(() => {
      setNow(Date.now());
      setSession(nextSession());
    }, 1000);

    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem("bir-ilm-v2", JSON.stringify(data));
    } catch {
      toast.error("Xotira to'ldi. O'zgarish saqlanmadi");
    }
  }, [data, ready]);

  useEffect(() => {
    const ctx = (
      document as Document & {
        modelContext?: { registerTool: (tool: unknown, options: unknown) => void };
      }
    ).modelContext;
    if (!ctx) return;

    const ctrl = new AbortController();
    try {
      ctx.registerTool(
        {
          name: "set_reading_progress",
          description: "O'qilgan sahifani yangilash",
          inputSchema: {
            type: "object",
            properties: { page: { type: "integer", minimum: 0 } },
            required: ["page"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false },
          execute: ({ page }: { page: number }) => {
            if (!Number.isInteger(page) || page < 0 || page > data.total) {
              throw Error("Sahifa noto'g'ri");
            }
            updateProgress(page, data.total);
            return { page };
          },
        },
        { signal: ctrl.signal },
      );
    } catch {}

    return () => ctrl.abort();
    // The registered tool should follow the current total, not re-register on every state write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.total]);

  function week() {
    return (
      <section className="week-header">
        <div className="week-top">
          <span className="eyebrow">HAFTA KITOBI</span>
          <span className="timer">
            <Clock size={15} />
            {timer}
          </span>
        </div>
        <h2>Atom odatlar</h2>
        <p>James Clear</p>
        <div className="week-bottom">
          <span>Suhbat: yakshanba, 18:00</span>
          <span>{backendLabel}</span>
        </div>
        <Progress value={pct} aria-label="O'qish progressi" />
        <div className="progress-label">
          <span>
            {data.page} / {data.total} sahifa
          </span>
          <span>{pct}%</span>
        </div>
      </section>
    );
  }

  function updateProgress(page: number, total = data.total) {
    const next = {
      ...data,
      page: Math.max(0, Math.min(total, page)),
      total,
    };
    setData(next);
    if (page > data.page) touchActivity(25);
    void syncState({ type: "progress", page: next.page, total: next.total }, next);
  }

  async function upload(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("audio/") || file.size > 50 * 1024 * 1024) {
      toast.error("50 MB gacha audio tanlang");
      return;
    }

    setBusy(true);
    const row = {
      id: crypto.randomUUID(),
      title: audioTitle.trim() || file.name,
      file,
    };

    try {
      await audioDB("put", row);
      setAudio((items) => [...items, { ...row, url: URL.createObjectURL(file) }]);
      touchActivity(15);
      toast.success("Audio qurilmaga saqlandi");
    } catch {
      toast.error("Audio saqlanmadi");
    } finally {
      setBusy(false);
    }
  }

  function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = message.trim();
    if (!text) return;

    const comment: CommunityComment = {
      id: Date.now(),
      name: data.name,
      text,
      createdAt: new Date().toISOString(),
    };
    const next = { ...data, comments: [...data.comments, comment] };
    setData(next);
    setMessage("");
    touchActivity(35);
    void syncState({ type: "comment", text }, next);
    toast.success("Izoh saqlandi");
  }

  if (!ready) {
    return (
      <main className="splash">
        <Brand />
        <p>Kitobxonlik sari...</p>
      </main>
    );
  }

  return (
    <>
      <Toaster richColors position="top-center" />
      <div className={`app-shell${tab === "home" ? " show-mobile-home" : ""}`}>
        <aside className="desktop-rail">
          <Brand />
          <div className="rail-intro"><span>KITOB BILAN</span><strong>Har kuningiz<br/>mazmunli.</strong><p>O‘qing. Fikrlashing.<br/>Birga o‘sing.</p></div>
          <div className="rail-status">
            <Wifi size={18} />
            <span>{backendLabel}</span>
          </div>
        </aside>

        <main className="app-main">
          <header className="app-header">
            <Brand />
            <button
              className="icon-btn"
              aria-label="Bildirishnomalar"
              onClick={() => setModal("notifications")}
            >
              <Bell size={22} />
            </button>
          </header>

          <Tabs value={tab} onValueChange={go} className="app-tabs">
            <TabsList className="navigation" aria-label="Asosiy bo'limlar">
              {nav.map(([id, label, Icon]) => (
                <TabsTrigger value={id} key={id}>
                  <Icon size={22} strokeWidth={1.8} />
                  <span>{label}</span>
                </TabsTrigger>
              ))}
            </TabsList>

            <div className="workspace">
              <div className="page-heading">
                <div>
                  <p className="eyebrow">BIR HAFTA. BIR KITOB.</p>
                  <h1>
                    {tab === "home"
                      ? `Salom, ${data.name}`
                      : tab === "leaders" ? "Faollar" : nav.find((item) => item[0] === tab)?.[1]}
                  </h1>
                </div>
                <FocusTimer onComplete={async session => {
                  const response = await fetch("/api/social", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "focus", name: data.name, ...session }) });
                  if (!response.ok) throw Error("Seans saqlanmadi");
                  window.dispatchEvent(new Event("bir-focus-saved"));
                }} />
              </div>

              <TabsContent value="home">
                <div className="desktop-home">
                  <BookDiscovery shelf={data.shelf} page={data.page} total={data.total} streak={data.streak} onNavigate={go} onProgress={() => setModal("progress")} onOpen={book => { setSelected(book); setModal("book"); }} onToggle={book => { const saved = data.shelf.includes(book.id); update({ shelf: saved ? data.shelf.filter(id => id !== book.id) : [...data.shelf, book.id] }); toast.success(saved ? "Javondan olindi" : "Javonga qo‘shildi"); }} />
                  <ReadingDashboard mode="feed" name={data.name} pages={data.page} shelfCount={data.shelf.length} streak={data.streak} />
                </div>
                <MobileScreens
                  name={data.name}
                  streak={data.streak}
                  page={data.page}
                  total={data.total}
                  session={session}
                  now={now}
                  reminderOn={data.talk}
                  onContinue={() => setModal("progress")}
                  onOpenTimer={() => window.dispatchEvent(new Event("bir-open-pomodoro"))}
                  onOpenBook={() => {
                    setSelected(books[0]);
                    setModal("book");
                  }}
                  onAddReminder={() => {
                    if (data.talk) toast("Eslatma allaqachon yoqilgan");
                    else {
                      update({ talk: true });
                      toast.success("Yakshanba, 18:00 uchun eslatma qo‘shildi");
                    }
                  }}
                />
              </TabsContent>
              <TabsContent value="profile">
                <ReadingDashboard mode="profile" name={data.name} pages={data.page} shelfCount={data.shelf.length} streak={data.streak} />
                <button className="button profile-ranking" onClick={() => go("leaders")}><Trophy size={18}/>Faollar reytingi · #{myRank}</button>
                <div className="home-grid">
                  <div className="stack">
                    {week()}
                    <div className="stats">
                      <div className="mini">
                        <strong>
                          {Math.max(
                            1,
                            Math.ceil(
                              (data.total - data.page) /
                                Math.max(1, Math.ceil(secs / 86400)),
                            ),
                          )}
                        </strong>
                        <span>kunlik sahifa rejasi</span>
                      </div>
                      <div className="mini">
                        <strong>{data.shelf.length}</strong>
                        <span>javoningizdagi kitob</span>
                      </div>
                    </div>
                    <button className="button full" onClick={() => setModal("progress")}>
                      <BookOpen size={18} />
                      Progressni yangilash
                    </button>
                  </div>

                  <div className="stack">
                    <h3 className="section-title">Bugungi reja</h3>
                    <div className="card tasks">
                      {[
                        ["progress", "Kitob o'qish", `${data.page} sahifa o'qildi`, BookOpen],
                        [
                          "note",
                          "Muhim fikr yozish",
                          data.note ? "Fikringiz saqlangan" : "O'qiganingizdan bir xulosa",
                          data.note ? Check : Plus,
                        ],
                        ["community", "Chatga fikr yozish", "Hafta savoliga javob bering", Users],
                      ].map(([id, title, sub, Icon]) => {
                        const TaskIcon = Icon as typeof Home;
                        return (
                          <button
                            className="task"
                            key={id as string}
                            onClick={() =>
                              id === "community" ? go("community") : setModal(id as string)
                            }
                          >
                            <span className="check">
                              <TaskIcon size={20} />
                            </span>
                            <span>
                              {title as string}
                              <small>{sub as string}</small>
                            </span>
                            <ChevronRight size={18} />
                          </button>
                        );
                      })}
                    </div>

                  </div>
                </div>
              </TabsContent>

              <TabsContent value="community">
                <div className="community-layout">
                  <div>
                    {week()}
                    <div className="chat-panel">
                      <div className="section-row tight">
                        <h3>Fikrlar va savollar</h3>
                        <span>{data.comments.length} ta izoh</span>
                      </div>
                      <div className="messages">
                        {data.comments.map((comment) => (
                          <article className="message" key={comment.id}>
                            <span className="avatar">{comment.name.slice(0, 1)}</span>
                            <div>
                              <div className="message-head">
                                <strong>{comment.name}</strong>
                                <small>{comment.demo ? "Namuna" : "Siz"}</small>
                              </div>
                              <p>{comment.text}</p>
                            </div>
                          </article>
                        ))}
                      </div>
                      <form className="composer" onSubmit={submitComment}>
                        <textarea
                          aria-label="Izoh yoki savol"
                          placeholder="Fikr yoki savol yozing..."
                          value={message}
                          maxLength={2000}
                          onChange={(event) => setMessage(event.target.value)}
                        />
                        <button
                          className="button"
                          disabled={!message.trim()}
                          aria-label="Izoh yuborish"
                        >
                          <Send size={20} />
                        </button>
                      </form>
                    </div>
                  </div>

                  <aside className="side-panel">
                    <h3>Chat holati</h3>
                    <div className="status-line">
                      <BadgeCheck size={19} />
                      <span>{backendLabel}</span>
                    </div>
                    <p>
                      Backend ulanganda chat, progress va reyting barcha qurilmalarda bitta
                      hisobga bog&apos;lanadi.
                    </p>
                    <button className="button secondary" onClick={() => setModal("note")}>
                      <Star size={18} />
                      Hafta fikrini yozish
                    </button>
                  </aside>
                </div>
              </TabsContent>

              <TabsContent value="talks">
                <LiveSession name={data.name} date={session} onComments={() => go("community")} />
                <div className="section-row">
                  <h3>O&apos;tgan kitoblar suhbatlari</h3>
                  <Headphones size={22} />
                </div>
                <p className="muted">
                  Suhbat yozuvlari serverga ko&apos;chirilganda Android, iOS va web bir xil
                  ro&apos;yxatni ko&apos;radi. Hozir qurilmadagi audioni qo&apos;shib tinglash mumkin.
                </p>
                <div className="card upload-card">
                  <label>
                    Kitob yoki suhbat nomi
                    <input
                      value={audioTitle}
                      maxLength={100}
                      onChange={(event) => setAudioTitle(event.target.value)}
                    />
                  </label>
                  <label className="button upload">
                    <Upload size={18} />
                    {busy ? "Saqlanmoqda..." : "Audio qo'shish"}
                    <input
                      type="file"
                      accept="audio/*"
                      disabled={busy}
                      onChange={(event) => {
                        void upload(event.target.files?.[0]);
                        event.target.value = "";
                      }}
                    />
                  </label>
                  <small>50 MB gacha · Brauzer qo&apos;llaydigan audio formatlari</small>
                </div>

                {audio.map((recording) => (
                  <article className="card audio-card" key={recording.id}>
                    <div className="section-row">
                      <h3>{recording.title}</h3>
                      <button
                        className="icon-btn"
                        aria-label={`${recording.title} audiosini o'chirish`}
                        onClick={async () => {
                          try {
                            await audioDB("delete", recording.id);
                            URL.revokeObjectURL(recording.url!);
                            setAudio((items) => items.filter((item) => item.id !== recording.id));
                            toast.success("Audio o'chirildi");
                          } catch {
                            toast.error("O'chirib bo'lmadi");
                          }
                        }}
                      >
                        <X size={18} />
                      </button>
                    </div>
                    <audio
                      controls
                      preload="metadata"
                      src={recording.url}
                      onError={() => toast.error("Brauzer bu audio formatini ocha olmadi")}
                    />
                  </article>
                ))}

                {!audio.length && (
                  <div className="empty">
                    <Headphones size={34} />
                    <h3>Hozircha audio yo&apos;q</h3>
                    <p>Birinchi suhbat yozuvini yuqoridan qo&apos;shing.</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="shelf">
                <BookDiscovery library shelf={data.shelf} page={data.page} total={data.total} streak={data.streak} onNavigate={go} onProgress={() => setModal("progress")} onOpen={book => { setSelected(book); setModal("book"); }} onToggle={book => { const saved = data.shelf.includes(book.id); update({ shelf: saved ? data.shelf.filter(id => id !== book.id) : [...data.shelf, book.id] }); toast.success(saved ? "Javondan olindi" : "Javonga qo‘shildi"); }} />
              </TabsContent>

              <TabsContent value="leaders">
                <button className="text-btn profile-ranking" onClick={() => go("profile")}>Profilga qaytish</button>
                <div className="leaders-grid">
                  <section className="leaderboard-panel">
                    <div className="section-row tight">
                      <h3>Faollar doskasi</h3>
                      <span>Top {leaders.length}</span>
                    </div>
                    <div className="leader-list">
                      {leaders.map((leader, index) => (
                        <article
                          className={`leader-row${leader.current ? " current" : ""}`}
                          key={`${leader.id}-${leader.current ? "me" : "seed"}`}
                        >
                          <span className="rank">
                            {index === 0 ? <Crown size={19} /> : index + 1}
                          </span>
                          <div>
                            <strong>{leader.name}</strong>
                            <small>
                              {leader.pages} sahifa · {leader.comments} izoh · {leader.books} kitob
                            </small>
                          </div>
                          <span className="score">{leader.score}</span>
                        </article>
                      ))}
                    </div>
                  </section>

                  <aside className="streak-panel">
                    <span className="flame">
                      <Flame size={28} />
                    </span>
                    <h3>{data.streak || 0} kun streak</h3>
                    <p>Har kuni progress, izoh yoki suhbat harakati streakni davom ettiradi.</p>
                    <div className="streak-stats">
                      <div>
                        <strong>#{myRank}</strong>
                        <span>reyting</span>
                      </div>
                      <div>
                        <strong>{activityFromState(data).score}</strong>
                        <span>ball</span>
                      </div>
                    </div>
                    <button className="button" onClick={() => setModal("progress")}>
                      <Medal size={18} />
                      Bugungi progress
                    </button>
                  </aside>
                </div>

                <div className="profile card">
                  <span className="avatar large">{data.name[0]}</span>
                  <div>
                    <h3>{data.name}</h3>
                    <p className="muted">Bir Ilm kitobxoni</p>
                  </div>
                  <button className="text-btn" onClick={() => setModal("profile")}>
                    Tahrirlash
                  </button>
                </div>

                <h3 className="section-title">Sozlamalar</h3>
                {[
                  ["notifications", "Bildirishnomalar", "O'qish va suhbat eslatmalari", Bell],
                  ["progress", "Kitob rejasi", "Sahifa soni va o'qish progressi", BookOpen],
                  ["profile", "Profil", "Kitobxon ismini o'zgartirish", Users],
                  ["about", "App holati", "Web, backend va app chiqarish yo'li", Settings],
                ].map(([id, title, sub, Icon]) => {
                  const SettingIcon = Icon as typeof Bell;
                  return (
                    <button
                      className="setting"
                      key={id as string}
                      onClick={() => setModal(id as string)}
                    >
                      <SettingIcon size={22} />
                      <span>
                        <strong>{title as string}</strong>
                        <small>{sub as string}</small>
                      </span>
                      <ChevronRight size={18} />
                    </button>
                  );
                })}
              </TabsContent>
            </div>
          </Tabs>

          <footer className="desktop-footer">
            SINANG, QO&apos;LLANG, ULASHING <span>Bir Ilm · Appga tayyor web</span>
          </footer>
        </main>
      </div>

      <Dialog
        open={!data.onboarded || Boolean(modal)}
        onOpenChange={(open) => {
          if (!open && data.onboarded) setModal("");
        }}
      >
        <DialogContent className="app-dialog" showCloseButton={false}>
          <DialogTitle>
            {!data.onboarded
              ? "Bir haftada bitta kitob"
              : ({
                  progress: "O'qish progressi",
                  note: "Muhim fikringiz",
                  book: selected.title,
                  profile: "Profil",
                  notifications: "Bildirishnomalar",
                  about: "App holati",
                } as Record<string, string>)[modal]}
          </DialogTitle>
          <DialogDescription>
            {!data.onboarded
              ? "Har kuni o'qing. Hafta oxirida kitobni birga tahlil qiling."
              : "O'zgarishlar backend mavjud bo'lsa serverga, aks holda qurilmaga saqlanadi."}
          </DialogDescription>

          {!data.onboarded ? (
            <>
              <div className="onboarding-brand">
                <Brand />
              </div>
              <p>O&apos;qish progressi, chat, javon, reyting va streak bir joyda.</p>
              <label>
                Ismingiz
                <input
                  value={data.name}
                  maxLength={40}
                  onChange={(event) => update({ name: event.target.value })}
                />
              </label>
              <button
                className="button"
                onClick={() => {
                  const next = {
                    ...data,
                    onboarded: true,
                    name: data.name.trim() || "Kitobxon",
                  };
                  setData(next);
                  void syncState({ type: "profile" }, next);
                }}
              >
                Boshlash <ChevronRight size={18} />
              </button>
            </>
          ) : (
            <>
              {modal === "progress" && (
                <>
                  <label>
                    Kitobdagi jami sahifa
                    <input
                      type="number"
                      min={1}
                      max={5000}
                      value={data.total}
                      onChange={(event) => {
                        const total = Math.min(5000, Math.max(1, Number(event.target.value)));
                        updateProgress(Math.min(data.page, total), total);
                      }}
                    />
                  </label>
                  <label>
                    O&apos;qilgan sahifa
                    <input
                      type="number"
                      min={0}
                      max={data.total}
                      value={data.page}
                      onChange={(event) =>
                        updateProgress(Math.max(0, Math.min(data.total, Number(event.target.value))))
                      }
                    />
                  </label>
                  <Progress value={pct} />
                  <p>{pct}% o&apos;qildi. Jami sahifani o&apos;z nashringizga moslang.</p>
                </>
              )}

              {modal === "note" && (
                <textarea
                  className="note-input"
                  aria-label="Muhim fikr"
                  placeholder="Bugun nimani o'rgandingiz?"
                  value={data.note}
                  maxLength={5000}
                  onChange={(event) => {
                    update({ note: event.target.value });
                  }}
                  onBlur={() => {
                    if (data.note.trim().length > 8) touchActivity(10);
                  }}
                />
              )}

              {modal === "profile" && (
                <label>
                  Ismingiz
                  <input
                    value={data.name}
                    maxLength={40}
                    onChange={(event) => {
                      const next = { ...data, name: event.target.value };
                      setData(next);
                      void syncState({ type: "profile" }, next);
                    }}
                  />
                </label>
              )}

              {modal === "book" && (
                <>
                  <p className="muted">{selected.author}</p>
                  <p>{selected.summary}</p>
                  <p className="book-detail-meta"><BookOpen size={18}/> {selected.pages} sahifa</p>
                  <p className="small-note">Bu kitob haqida ma’lumot. To‘liq matn va audio hali joylanmagan.</p>
                  <button
                    className="button"
                    onClick={() => {
                      const isSaved = data.shelf.includes(selected.id);
                      update({
                        shelf: isSaved
                          ? data.shelf.filter((id) => id !== selected.id)
                          : [...data.shelf, selected.id],
                      });
                      touchActivity(8);
                      toast.success(isSaved ? "Javondan olindi" : "Javonga qo'shildi");
                    }}
                  >
                    {data.shelf.includes(selected.id) ? "Javondan olish" : "Javonga qo'shish"}
                  </button>
                </>
              )}

              {modal === "notifications" && (
                <>
                  <div className="setting">
                    <label htmlFor="read-reminder">O&apos;qish eslatmasi</label>
                    <Switch
                      id="read-reminder"
                      checked={data.reading}
                      onCheckedChange={(value) => update({ reading: value })}
                    />
                  </div>
                  <div className="setting">
                    <label htmlFor="talk-reminder">Suhbat eslatmasi</label>
                    <Switch
                      id="talk-reminder"
                      checked={data.talk}
                      onCheckedChange={(value) => update({ talk: value })}
                    />
                  </div>
                  {(data.reading || data.talk) && (
                    <button
                      className="button"
                      onClick={() =>
                        toast("Bir Ilm eslatmasi", {
                          description: "Bugungi o'qish uchun vaqt ajrating.",
                        })
                      }
                    >
                      Eslatmani sinash
                    </button>
                  )}
                </>
              )}

              {modal === "about" && (
                <>
                  <Brand />
                  <div className="readiness modal-readiness">
                    <div className="readiness-item">
                      <MonitorSmartphone size={20} />
                      <span>
                        <strong>Web</strong>
                        <small>PC va mobile responsive</small>
                      </span>
                    </div>
                    <div className="readiness-item">
                      <Smartphone size={20} />
                      <span>
                        <strong>Android/iOS</strong>
                        <small>PWA manifest va app shell tayyor</small>
                      </span>
                    </div>
                    <div className="readiness-item">
                      <Database size={20} />
                      <span>
                        <strong>Backend</strong>
                        <small>D1 schema va API qo&apos;shildi</small>
                      </span>
                    </div>
                  </div>
                  <p>
                    Keyingi qadam: real login, push bildirishnoma, audio fayllar uchun server
                    storage va Play Market/App Store paketlarini ulash.
                  </p>
                  <button
                    className="text-btn"
                    onClick={() => {
                      setModal("");
                      update({ onboarded: false });
                    }}
                  >
                    Onboardingni qayta ko&apos;rish
                  </button>
                </>
              )}

              <DialogClose asChild>
                <button
                  className="button secondary"
                  onClick={() => {
                    if (!data.name.trim()) update({ name: "Kitobxon" });
                  }}
                >
                  Tayyor
                </button>
              </DialogClose>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
