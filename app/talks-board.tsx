"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Bell,
  BellRing,
  BookOpenText,
  CalendarDays,
  ChevronRight,
  CirclePlay,
  Clock3,
  Mic,
  NotebookText,
  Play,
  Plus,
  Radio,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { useCatalog } from "@/lib/api/books-client";
import type { LiveSession } from "@/shared/contract/live";

// Suhbatlar bo'limining asosiy oynasi (xonaga kirishdan oldingi holat).

type Filter = "all" | "live" | "past" | "mine";

const FILTERS: Array<[Filter, string, typeof Mic]> = [
  ["all", "Barchasi", Mic],
  ["live", "Jonli", Radio],
  ["past", "O‘tganlar", CirclePlay],
  ["mine", "Mening", NotebookText],
];

const MONTHS = ["yan", "fev", "mar", "apr", "may", "iyun", "iyul", "avg", "sent", "okt", "noy", "dek"];
const WEEKDAYS = ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"];

const dayMonth = (d: Date) => `${d.getDate()}-${MONTHS[d.getMonth()]}`;
const clock = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

function duration(s: LiveSession) {
  if (!s.startedAt || !s.endedAt) return null;
  const total = Math.max(0, Math.round((Date.parse(s.endedAt) - Date.parse(s.startedAt)) / 1000));
  const h = Math.floor(total / 3600);
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const sec = String(total % 60).padStart(2, "0");
  return h ? `${h}:${m}:${sec}` : `${Number(m)}:${sec}`;
}

function untilLabel(iso: string) {
  if (Date.parse(iso) <= Date.now()) return "Boshlanishi kutilmoqda";
  const days = Math.round((new Date(iso).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
  if (days <= 0) return "Bugun";
  if (days === 1) return "Ertaga";
  return `${days} kundan keyin`;
}

// Eslatmalar faqat shu qurilmada saqlanadi.
const REMINDERS_KEY = "bir-live-reminders";
function readReminders(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(REMINDERS_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

// To'lqin chizig'i suhbat id'sidan hosil bo'ladi — har safar bir xil ko'rinadi.
function waveBars(seed: string, count = 42) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Array.from({ length: count }, () => {
    h = (h * 1103515245 + 12345) | 0;
    return 30 + (Math.abs(h >> 8) % 70);
  });
}

function Cover({ title, url, color, size }: { title: string; url?: string | null; color?: string; size: "lg" | "sm" }) {
  return (
    <span className={`tb-cover tb-cover-${size}`} style={url ? undefined : { background: color ?? "#1d5b48" }} aria-hidden="true">
      {url ? <img src={url} alt="" loading="lazy" /> : <b>{title}</b>}
    </span>
  );
}

export default function TalksBoard({
  sessions,
  loading,
  signedIn,
  isAdmin,
  userId,
  notice,
  login,
  onJoin,
  onCreate,
  onShare,
}: {
  sessions: LiveSession[];
  loading: boolean;
  signedIn: boolean;
  isAdmin: boolean;
  userId: string | null;
  notice: string;
  login: ReactNode;
  onJoin: (id: string) => void;
  onCreate: () => void;
  onShare: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [reminders, setReminders] = useState<string[]>([]);
  const catalog = useCatalog();

  useEffect(() => {
    queueMicrotask(() => setReminders(readReminders()));
  }, []);

  const bookFor = (title: string) => {
    const key = title.trim().toLowerCase();
    return catalog.items.find((b) => b.title.trim().toLowerCase() === key);
  };

  const { upcoming, past } = useMemo(() => {
    const open = sessions
      .filter((s) => s.status !== "ended")
      .sort((a, b) => (a.status === "live" ? 0 : 1) - (b.status === "live" ? 0 : 1) || Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
    const done = sessions
      .filter((s) => s.status === "ended")
      .sort((a, b) => Date.parse(b.endedAt ?? b.scheduledAt) - Date.parse(a.endedAt ?? a.scheduledAt));
    return { upcoming: open, past: done };
  }, [sessions]);

  const isMine = (s: LiveSession) => reminders.includes(s.id) || (userId !== null && s.moderatorId === userId);

  function toggleReminder(s: LiveSession) {
    const on = reminders.includes(s.id);
    const next = on ? reminders.filter((id) => id !== s.id) : [...reminders, s.id];
    setReminders(next);
    try {
      localStorage.setItem(REMINDERS_KEY, JSON.stringify(next));
    } catch {
      /* shaxsiy rejim */
    }
    const when = new Date(s.scheduledAt);
    toast.success(on ? "Eslatma olib tashlandi" : `${dayMonth(when)}, ${clock(when)} uchun eslatma qo‘yildi`);
  }

  function open(s: LiveSession) {
    if (!signedIn) {
      toast("Suhbatga qo‘shilish uchun avval tizimga kiring");
      return;
    }
    onJoin(s.id);
  }

  const featured = (s: LiveSession) => {
    const when = new Date(s.scheduledAt);
    const book = bookFor(s.bookTitle);
    const live = s.status === "live";
    const reminded = reminders.includes(s.id);
    return (
      <article className={`tb-feature${live ? " is-live" : ""}`} key={s.id}>
        <button type="button" className="tb-stretch" aria-label={`${s.bookTitle} suhbatini ochish`} onClick={() => open(s)} />
        <Cover title={s.bookTitle} url={book?.coverUrl} color={book?.color} size="lg" />
        <div className="tb-feature-body">
          <span className={`tb-badge${live ? " live" : ""}`}>
            {live ? <><i /> JONLI EFIRDA</> : <><CalendarDays size={15} /> KELGUSI SUHBAT</>}
          </span>
          <h3>{s.bookTitle} – {s.title}</h3>
          <p className="tb-meta">
            <span><CalendarDays size={17} /> {dayMonth(when)}, {WEEKDAYS[when.getDay()]}</span>
            <span><Clock3 size={17} /> {clock(when)}</span>
          </p>
          <div className="tb-feature-foot">
            <span className="tb-people">
              {live || s.participantCount > 0 ? (
                <><Users size={16} /> {s.participantCount} kishi qatnashmoqda</>
              ) : (
                <><Clock3 size={16} /> {untilLabel(s.scheduledAt)}</>
              )}
            </span>
            {live || isAdmin ? (
              <button type="button" className="tb-action primary" onClick={() => open(s)} disabled={!signedIn}>
                <Mic size={17} /> {live ? "Qo‘shilish" : "Kirish va boshlash"}
              </button>
            ) : (
              <button type="button" className={`tb-action${reminded ? " on" : ""}`} onClick={() => toggleReminder(s)} aria-pressed={reminded}>
                {reminded ? <BellRing size={17} /> : <Bell size={17} />} {reminded ? "Eslatma qo‘yildi" : "Eslatma qo‘yish"}
              </button>
            )}
          </div>
        </div>
        <ChevronRight className="tb-chevron" size={24} aria-hidden="true" />
      </article>
    );
  };

  const pastRow = (s: LiveSession) => {
    const when = new Date(s.endedAt ?? s.scheduledAt);
    const book = bookFor(s.bookTitle);
    const length = duration(s);
    return (
      <article className="tb-past" key={s.id}>
        <Cover title={s.bookTitle} url={book?.coverUrl} color={book?.color} size="sm" />
        <div className="tb-past-body">
          <h4>{s.bookTitle}</h4>
          <p className="tb-meta">
            <span><CalendarDays size={16} /> {dayMonth(when)}, {when.getFullYear()}</span>
            {length && <span><Clock3 size={16} /> {length}</span>}
          </p>
          <span className="tb-wave" aria-hidden="true">
            {waveBars(s.id).map((h, i) => <i key={i} style={{ height: `${h}%` }} className={i < 13 ? "on" : undefined} />)}
          </span>
        </div>
        <button type="button" className="tb-play" aria-label={`${s.bookTitle}: suhbat izohlarini ochish`} title="Suhbat izohlarini ochish" onClick={() => open(s)}>
          <Play size={20} fill="currentColor" />
        </button>
      </article>
    );
  };

  const empty = (text: string) => <p className="tb-empty">{text}</p>;

  let content: ReactNode;
  if (loading) content = empty("Yuklanmoqda…");
  else if (filter === "all") {
    content = (
      <>
        {upcoming.length ? upcoming.map(featured) : empty("Hozircha rejalashtirilgan suhbat yo‘q. Admin e’lon qilganda shu yerda ko‘rinadi.")}
        {past.length > 0 && (
          <>
            <div className="tb-section-head">
              <h3>O‘tgan suhbatlar</h3>
              {past.length > 3 && (
                <button type="button" onClick={() => setFilter("past")}>Barchasini ko‘rish <ChevronRight size={18} /></button>
              )}
            </div>
            <div className="tb-past-list">{past.slice(0, 3).map(pastRow)}</div>
          </>
        )}
      </>
    );
  } else if (filter === "live") {
    const live = upcoming.filter((s) => s.status === "live");
    content = live.length ? live.map(featured) : empty("Hozir jonli suhbat yo‘q. Kelgusi suhbatga eslatma qo‘yib qo‘ying.");
  } else if (filter === "past") {
    content = past.length ? <div className="tb-past-list">{past.map(pastRow)}</div> : empty("Hali o‘tgan suhbatlar yo‘q.");
  } else {
    const mineUpcoming = upcoming.filter(isMine);
    const minePast = past.filter(isMine);
    content = mineUpcoming.length || minePast.length ? (
      <>
        {mineUpcoming.map(featured)}
        {minePast.length > 0 && <div className="tb-past-list">{minePast.map(pastRow)}</div>}
      </>
    ) : empty("Eslatma qo‘ygan suhbatlaringiz shu yerda turadi.");
  }

  return (
    <div className="talks-board">
      <div className="tb-filters" role="tablist" aria-label="Suhbatlar saralash">
        {FILTERS.map(([id, label, Icon]) => (
          <button key={id} type="button" role="tab" aria-selected={filter === id} className={filter === id ? "active" : ""} onClick={() => setFilter(id)}>
            <Icon size={19} /> <span>{label}</span>
          </button>
        ))}
      </div>

      {notice && <p className="live-list-notice">{notice}</p>}
      {isAdmin && (
        <button type="button" className="tb-create" onClick={onCreate}>
          <Plus size={18} /> Yangi suhbat e’lon qilish
        </button>
      )}

      {content}

      {login}

      <button type="button" className="tb-share" onClick={onShare}>
        <span className="tb-share-icon"><Mic size={26} /></span>
        <span className="tb-share-copy">
          <strong>O‘z fikringizni ulashing</strong>
          <small>Suhbatdan keyin hamjamiyatda yozing: kitob hayotingizda nimani o‘zgartirdi?</small>
        </span>
        <BookOpenText className="tb-share-art" size={58} strokeWidth={1.2} aria-hidden="true" />
        <ChevronRight size={22} aria-hidden="true" />
      </button>
    </div>
  );
}
