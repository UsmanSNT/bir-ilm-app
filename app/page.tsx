"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
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
  LogIn,
  LogOut,
  LibraryBig,
  Medal,
  MonitorSmartphone,
  Plus,
  Settings,
  Smartphone,
  Store,
  Trophy,
  Upload,
  Users,
  UserRound,
  Wifi,
  X,
} from "lucide-react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
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
import BookStore from "./book-store";
import Dock from "./dock";
import { AuthProvider, useAuth } from "./auth";
import { uzDate } from "./uz-date";
import MyBooks from "./my-books";
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
  ["home", "Bosh sahifa", Home],
  ["community", "Gurung", Users],
  ["talks", "Suhbat", Headphones],
  ["shelf", "Javon", LibraryBig],
] as const;
const headings: Record<string, [string, string]> = {
  community: ["Kitobxonlar davrasi", "Gurung"],
  talks: ["Haftalik muhokama", "Suhbat"],
  shelf: ["Shaxsiy kutubxona", "Javon"],
  profile: ["Kitobxon sahifasi", "Profil"],
  leaders: ["Hafta faollari", "Faollar"],
};
const mainNavLeft = nav.slice(0, 2);
const mainNavRight = nav.slice(2);

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
    <div className="brand">
      <span className="brand-mark"><Image src="/assets/bir-ilm-logo.jpg" alt="" width={44} height={44} /></span>
      <span className="brand-text">
        <span className="wordmark">Bir Ilm</span>
        <span className="brand-tag">Sinang · qo‘llang · ulashing</span>
      </span>
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

export default function Page() {
  return <AuthProvider><App /></AuthProvider>;
}

function App() {
  const { user, openAuth, logout, rename } = useAuth();
  const displayName = user?.name ?? "Mehmon";
  const [data, setData] = useState<State>(initial);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState("home");
  const [store, setStore] = useState(false);
  const [now, setNow] = useState(0);
  const [session, setSession] = useState(0);
  const [modal, setModal] = useState("");
  const [selected, setSelected] = useState<Book>(books[0]);
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
    () => mergeLeaders({ ...data, name: displayName }, serverLeaders),
    [data, displayName, serverLeaders],
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
  const openStore = () => {
    setStore(true);
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

  const leaderBoard = (
    <div className="leader-list">
      {leaders.map((leader, index) => (
        <article className={`leader-row${leader.current ? " current" : ""}`} key={`${leader.id}-${leader.current ? "me" : "seed"}`}>
          <span className="rank">{index === 0 ? <Crown size={19} /> : index + 1}</span>
          <div>
            <strong>{leader.name}</strong>
            <small>{leader.pages} sahifa · {leader.comments} izoh · {leader.books} kitob</small>
          </div>
          <span className="score">{leader.score}</span>
        </article>
      ))}
    </div>
  );

  const planPanel = (
    <div className="home-grid">
      <div className="stack">
        {week()}
        <div className="stats">
          <div className="mini"><strong>{Math.max(1, Math.ceil((data.total - data.page) / Math.max(1, Math.ceil(secs / 86400))))}</strong><span>kunlik sahifa rejasi</span></div>
          <div className="mini"><strong>{data.shelf.length}</strong><span>javoningizdagi kitob</span></div>
        </div>
        <button className="button full" onClick={() => setModal("progress")}><BookOpen size={18} />Progressni yangilash</button>
      </div>
      <div className="stack">
        <h3 className="section-title">Bugungi reja</h3>
        <div className="card tasks">
          {([
            ["progress", "Kitob o'qish", `${data.page} sahifa o'qildi`, BookOpen],
            ["note", "Muhim fikr yozish", data.note ? "Fikringiz saqlangan" : "O'qiganingizdan bir xulosa", data.note ? Check : Plus],
            ["community", "Gurungga post yozish", "Kitobdan fikr yoki iqtibos ulashing", Users],
          ] as const).map(([id, title, sub, TaskIcon]) => (
            <button className="task" key={id} onClick={() => (id === "community" ? go("community") : setModal(id))}>
              <span className="check"><TaskIcon size={20} /></span>
              <span>{title}<small>{sub}</small></span>
              <ChevronRight size={18} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const settingsPanel = (
    <div className="settings-panel">
      <NameSettings key={displayName} name={displayName} onSaved={name => { rename(name); update({ name }); }} />
      {user?.login && <SecuritySettings email={user.email ?? null} />}
      {([
        ["notifications", "Bildirishnomalar", "O'qish va suhbat eslatmalari", Bell],
        ["progress", "Kitob rejasi", "Sahifa soni va o'qish progressi", BookOpen],
        ["about", "App holati", "Web, backend va app chiqarish yo'li", Settings],
      ] as const).map(([id, title, sub, SettingIcon]) => (
        <button className="setting" key={id} onClick={() => setModal(id)}>
          <SettingIcon size={22} />
          <span><strong>{title}</strong><small>{sub}</small></span>
          <ChevronRight size={18} />
        </button>
      ))}
      <button className="setting setting-danger" onClick={() => { void logout().then(() => go("home")); }}>
        <LogOut size={22} />
        <span><strong>Hisobdan chiqish</strong><small>{user?.login ? `@${user.login}` : user?.providers?.join(", ")}</small></span>
      </button>
    </div>
  );

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
      <div className="shell" data-mode={store ? "store" : "main"}>
        {!store && <Dock mode="main" label="Asosiy bo'limlar"
          left={mainNavLeft.map(([id, label, icon]) => ({ id, label, icon, active: tab === id, onClick: () => go(id) }))}
          right={mainNavRight.map(([id, label, icon]) => ({ id, label, icon, active: tab === id, onClick: () => go(id) }))}
          center={{ label: "Do‘kon", ariaLabel: "Book Store — kitob do‘koniga o‘tish", icon: Store, onClick: openStore }} />}

        <div className="stage">
          <header className="topbar">
            <Brand />
            <div className="topbar-actions">
              <span className="topbar-status" title="Ma'lumotlar qayerda saqlanmoqda"><Wifi size={15} />{backendLabel}</span>
              <button className="icon-btn" aria-label="Bildirishnomalar" onClick={() => setModal("notifications")}><Bell size={20} /></button>
              {user
                ? <button className="topbar-avatar" aria-label="Profil" disabled={store} onClick={() => go("profile")}><span>{displayName.slice(0, 1).toUpperCase()}</span></button>
                : <button className="topbar-login" onClick={() => openAuth("login")}><LogIn size={17} />Kirish</button>}
            </div>
          </header>

          {store ? (
            <BookStore
              shelf={data.shelf}
              onBack={() => { setStore(false); window.scrollTo({ top: 0 }); }}
              onToggle={book => { const saved = data.shelf.includes(book.id); update({ shelf: saved ? data.shelf.filter(id => id !== book.id) : [...data.shelf, book.id] }); toast.success(saved ? "Javondan olindi" : "Javonga qo‘shildi"); }}
            />
          ) : (

          <Tabs value={tab} onValueChange={go} className="app-tabs">

            <div className="workspace">
              <div className="page-heading">
                <div>
                  <p className="eyebrow">{tab === "home" ? uzDate(new Date()) : headings[tab]?.[0]}</p>
                  <h1>{tab === "home" ? <>Assalomu alaykum,<br /><em>{displayName}</em></> : headings[tab]?.[1]}</h1>
                </div>
                <FocusTimer onComplete={async session => {
                  const response = await fetch("/api/social", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "focus", ...session }) });
                  if (!response.ok) throw Error("Seans saqlanmadi");
                  window.dispatchEvent(new Event("bir-focus-saved"));
                }} />
              </div>

              <TabsContent value="home">
                <BookDiscovery shelf={data.shelf} page={data.page} total={data.total} streak={data.streak} onNavigate={go} onProgress={() => setModal("progress")} onOpen={book => { setSelected(book); setModal("book"); }} onToggle={book => { const saved = data.shelf.includes(book.id); update({ shelf: saved ? data.shelf.filter(id => id !== book.id) : [...data.shelf, book.id] }); toast.success(saved ? "Javondan olindi" : "Javonga qo‘shildi"); }} />
                <ReadingDashboard mode="feed" name={displayName} />
              </TabsContent>
              <TabsContent value="profile">
                {user ? <ReadingDashboard mode="profile" name={displayName}
                  highlights={[
                    { icon: Flame, value: data.streak, label: "kun streak", tone: "anor" },
                    { icon: Trophy, value: `#${myRank}`, label: "reyting", tone: "tilla" },
                    { icon: Medal, value: activityFromState(data).score, label: "ball", tone: "firuza" },
                    { icon: BookOpen, value: data.page, label: "bet o‘qildi", tone: "lojuvard" },
                  ]}
                  tabs={[
                    { id: "books", label: "Kitoblarim", content: <MyBooks onStore={openStore} onOpen={book => { setSelected(book); setModal("book"); }} /> },
                    { id: "leaders", label: "Faollar", content: leaderBoard },
                    { id: "plan", label: "Reja", content: planPanel },
                    { id: "settings", label: "Sozlamalar", content: settingsPanel },
                  ]} />
                  : <section className="guest-card">
                      <span className="guest-mark" aria-hidden="true"><UserRound size={30} /></span>
                      <h2>Kitobxon sahifangiz</h2>
                      <p>Postlaringiz, kuzatuvchilaringiz, streak va reytingingizni ko‘rish uchun hisobingizga kiring.</p>
                      <div className="guest-actions"><button className="button" onClick={() => openAuth("login")}>Kirish</button><button className="button secondary" onClick={() => openAuth("register")}>Hisob ochish</button></div>
                    </section>}
              </TabsContent>

              <TabsContent value="community">
                <ReadingDashboard mode="gurung" name={displayName} />
              </TabsContent>

              <TabsContent value="talks">
                <LiveSession name={displayName} date={session} onComments={() => go("community")} />
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

            </div>
          </Tabs>
          )}

          <footer className="site-foot">
            <span>Sinang, qo‘llang, ulashing</span>
            <span>Bir Ilm · {backendLabel}</span>
          </footer>
        </div>
      </div>

      <Dialog
        open={Boolean(modal)}
        onOpenChange={(open) => {
          if (!open) setModal("");
        }}
      >
        <DialogContent className="app-dialog" showCloseButton={false}>
          <DialogTitle>
            {({
                  progress: "O'qish progressi",
                  note: "Muhim fikringiz",
                  book: selected.title,
                  profile: "Profil",
                  notifications: "Bildirishnomalar",
                  about: "App holati",
                } as Record<string, string>)[modal]}
          </DialogTitle>
          <DialogDescription>
            {"O'zgarishlar backend mavjud bo'lsa serverga, aks holda qurilmaga saqlanadi."}
          </DialogDescription>

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
                </>
              )}

              <DialogClose asChild>
                <button
                  className="button secondary"
                >
                  Tayyor
                </button>
              </DialogClose>
          </>
        </DialogContent>
      </Dialog>
    </>
  );
}

function NameSettings({ name, onSaved }: { name: string; onSaved: (name: string) => void }) {
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const clean = value.trim().replace(/\s+/g, " ");
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || clean.length < 2 || clean === name) return;
    setBusy(true);
    try {
      const res = await fetch("/api/social", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "profile", name: clean }) });
      if (!res.ok) throw Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Saqlanmadi.");
      onSaved(clean);
      toast.success("Ism saqlandi");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Saqlanmadi."); }
    finally { setBusy(false); }
  };
  return (
    <form className="card name-settings" onSubmit={e => void save(e)}>
      <label htmlFor="profile-name">Ism</label>
      <div className="name-settings-row">
        <input id="profile-name" maxLength={40} value={value} onChange={e => setValue(e.target.value)} />
        <button className="button" disabled={busy || clean.length < 2 || clean === name}>{busy ? "..." : "Saqlash"}</button>
      </div>
    </form>
  );
}

async function postAuth(payload: Record<string, unknown>) {
  const res = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const data = (await res.json().catch(() => ({}))) as { error?: string; email?: string | null };
  if (!res.ok) throw Error(data.error ?? "Saqlanmadi.");
  return data;
}

/** Parol va emailni o'zgartirish (faqat login-parol hisoblari uchun). */
function SecuritySettings({ email }: { email: string | null }) {
  const [savedEmail, setSavedEmail] = useState(email);
  const [nextEmail, setNextEmail] = useState(email ?? "");
  const [emailPassword, setEmailPassword] = useState("");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (event: FormEvent, action: () => Promise<void>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try { await action(); } catch (e) { toast.error(e instanceof Error ? e.message : "Saqlanmadi."); } finally { setBusy(false); }
  };
  return (
    <section className="card security-card" aria-label="Xavfsizlik">
      <h3>Xavfsizlik</h3>
      <form onSubmit={e => void run(e, async () => {
        const data = await postAuth({ type: "set_email", email: nextEmail, current: emailPassword });
        setSavedEmail(data.email ?? null); setEmailPassword("");
        toast.success(data.email ? "Email saqlandi — parolni shu orqali tiklash mumkin" : "Email olib tashlandi");
      })}>
        <label htmlFor="sec-email">Email {savedEmail ? "" : <small className="auth-hint">(parolni tiklash uchun qo‘shing)</small>}</label>
        <input id="sec-email" type="email" autoComplete="email" maxLength={254} value={nextEmail} onChange={e => setNextEmail(e.target.value)} placeholder="siz@misol.uz" />
        <input type="password" aria-label="Joriy parol (email uchun)" autoComplete="current-password" placeholder="Joriy parol" value={emailPassword} onChange={e => setEmailPassword(e.target.value)} />
        <button className="button secondary" disabled={busy || !emailPassword || nextEmail.trim().toLowerCase() === (savedEmail ?? "")}>Emailni saqlash</button>
      </form>
      <form onSubmit={e => void run(e, async () => {
        if (next !== confirm) throw Error("Yangi parollar bir xil emas.");
        await postAuth({ type: "change_password", current, password: next });
        setCurrent(""); setNext(""); setConfirm("");
        toast.success("Parol o‘zgartirildi. Boshqa qurilmalardagi sessiyalar yopildi.");
      })}>
        <label htmlFor="sec-current">Parolni o‘zgartirish</label>
        <input id="sec-current" type="password" autoComplete="current-password" placeholder="Joriy parol" value={current} onChange={e => setCurrent(e.target.value)} />
        <input type="password" aria-label="Yangi parol" autoComplete="new-password" placeholder="Yangi parol (kamida 8 belgi)" minLength={8} maxLength={128} value={next} onChange={e => setNext(e.target.value)} />
        <input type="password" aria-label="Yangi parolni takrorlang" autoComplete="new-password" placeholder="Yangi parolni takrorlang" value={confirm} onChange={e => setConfirm(e.target.value)} />
        <button className="button secondary" disabled={busy || !current || next.length < 8}>Parolni o‘zgartirish</button>
      </form>
    </section>
  );
}
