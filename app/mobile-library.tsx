"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Bookmark, ChevronLeft, Headphones, Moon, Pause, Pencil, Play, Plus, Search, SkipBack, SkipForward } from "lucide-react";
import { toast } from "sonner";
import { useCatalog } from "@/lib/api/books-client";
import { useViewer } from "@/lib/api/roles-client";
import { canModerate } from "@/shared/contract/roles";
import type { Book } from "@/shared/contract";
import BookEditor from "./book-editor";

type Save = {
  /** Har kitob uchun tinglangan joy (soniya). */
  progress: Record<string, number>;
  finished: string[];
  speed: number;
  last: string | null;
};

type Screen = "catalog" | "mine" | "player";
type MineTab = "saved" | "finished";

const KEY = "bir-ilm-library-v2";
const speeds = [1, 1.25, 1.5, 2];
const empty: Save = { progress: {}, finished: [], speed: 1, last: null };

function parseSave(raw: string): Save {
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw) as Partial<Save>;
    const progress: Record<string, number> = {};
    for (const [id, at] of Object.entries(parsed.progress ?? {})) if (Number.isFinite(at)) progress[id] = at as number;
    return {
      progress,
      finished: Array.isArray(parsed.finished) ? parsed.finished.filter((id) => typeof id === "string") : [],
      speed: typeof parsed.speed === "number" && speeds.includes(parsed.speed) ? parsed.speed : 1,
      last: typeof parsed.last === "string" ? parsed.last : null,
    };
  } catch {
    return empty;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("bir-library-save", onChange);
  return () => window.removeEventListener("bir-library-save", onChange);
}

function readSnapshot() {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

function writeSave(patch: Partial<Save>) {
  const next = { ...parseSave(readSnapshot()), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* Qurilma xotirasi to'lsa tinglash shu sessiyada davom etadi. */
  }
  window.dispatchEvent(new Event("bir-library-save"));
}

export function clock(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = String(safe % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

function lengthLabel(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  return hours <= 0 ? `${Math.max(1, mins)} daq` : `${hours}s ${mins} daq`;
}

type Live = { id: string; playing: boolean; at: number; duration: number; speed: number; sleepUntil: number | null; sleepMinutes: number | null };

export default function MobileLibrary({ shelf, onToggleSave }: { shelf: string[]; onToggleSave: (id: string) => void }) {
  const catalog = useCatalog();
  const viewer = useViewer();
  const editor = canModerate(viewer?.role);
  const raw = useSyncExternalStore(subscribe, readSnapshot, () => "");
  const save = useMemo(() => parseSave(raw), [raw]);
  const [screen, setScreen] = useState<Screen>("catalog");
  const [returnTo, setReturnTo] = useState<Screen>("catalog");
  const [mine, setMine] = useState<MineTab>("saved");
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [editing, setEditing] = useState<{ book: Book | null } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const byId = (id: string | null) => catalog.items.find((b) => b.id === id) ?? null;
  const active = byId(activeId);

  // Bitta audio element: sahifa ichida kitoblar almashsa ham shu ishlatiladi.
  useEffect(() => {
    const el = new Audio();
    el.preload = "metadata";
    audioRef.current = el;
    let lastSaved = 0;
    const sync = () => setLive((prev) => (prev ? { ...prev, at: el.currentTime, duration: Number.isFinite(el.duration) ? el.duration : prev.duration, playing: !el.paused } : prev));
    const onTime = () => {
      sync();
      const id = el.dataset.book;
      if (id && Date.now() - lastSaved > 3000) {
        lastSaved = Date.now();
        writeSave({ progress: { ...parseSave(readSnapshot()).progress, [id]: el.currentTime }, last: id });
      }
    };
    const onEnded = () => {
      const id = el.dataset.book;
      sync();
      if (id) {
        const current = parseSave(readSnapshot());
        writeSave({ finished: current.finished.includes(id) ? current.finished : [...current.finished, id], progress: { ...current.progress, [id]: 0 } });
        toast.success("Kitob tugadi — «Tugatilgan»larga qo‘shildi");
      }
    };
    const onError = () => {
      if (el.src) toast.error("Audio ochilmadi. Internetni tekshiring yoki keyinroq urinib ko‘ring.");
      sync();
    };
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("play", sync);
    el.addEventListener("pause", sync);
    el.addEventListener("loadedmetadata", sync);
    el.addEventListener("ended", onEnded);
    el.addEventListener("error", onError);
    return () => {
      const id = el.dataset.book;
      if (id && el.currentTime) writeSave({ progress: { ...parseSave(readSnapshot()).progress, [id]: el.currentTime } });
      el.pause();
      el.removeAttribute("src");
      el.load();
    };
  }, []);

  // Uyqu taymeri.
  useEffect(() => {
    if (!live?.sleepUntil) return;
    const timer = window.setInterval(() => {
      if (live.sleepUntil && Date.now() >= live.sleepUntil) {
        audioRef.current?.pause();
        setLive((prev) => (prev ? { ...prev, sleepUntil: null, sleepMinutes: null } : prev));
        toast("Uyqu taymeri tugadi");
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [live?.sleepUntil]);

  function openBook(id: string, from: Screen = screen) {
    setReturnTo(from);
    setActiveId(id);
    setScreen("player");
    window.scrollTo({ top: 0 });
  }

  function play(id: string) {
    const book = byId(id);
    const el = audioRef.current;
    if (!book || !el) return;
    if (!book.audioUrl) {
      toast("Bu kitobning audiosi hali yuklanmagan");
      return;
    }
    if (el.dataset.book !== id) {
      el.dataset.book = id;
      el.src = book.audioUrl;
      el.currentTime = save.progress[id] ?? 0;
      setLive({ id, playing: false, at: save.progress[id] ?? 0, duration: book.audioSeconds, speed: save.speed, sleepUntil: null, sleepMinutes: null });
    }
    el.playbackRate = live?.speed ?? save.speed;
    void el.play().catch(() => toast.error("Ijro etib bo‘lmadi. Qayta bosing."));
    writeSave({ last: id });
  }

  function toggle(id: string) {
    const el = audioRef.current;
    if (el && el.dataset.book === id && !el.paused) el.pause();
    else play(id);
  }

  function seek(at: number) {
    const el = audioRef.current;
    if (!el || !active || el.dataset.book !== active.id) {
      if (active) writeSave({ progress: { ...save.progress, [active.id]: at } });
      return;
    }
    el.currentTime = Math.max(0, Math.min(at, el.duration || at));
  }

  function cycleSpeed() {
    const current = live?.speed ?? save.speed;
    const next = speeds[(speeds.indexOf(current) + 1) % speeds.length];
    if (audioRef.current) audioRef.current.playbackRate = next;
    setLive((prev) => (prev ? { ...prev, speed: next } : prev));
    writeSave({ speed: next });
  }

  function cycleSleep() {
    setLive((prev) => {
      if (!prev) return prev;
      const choices = [null, 15, 30, 45] as const;
      const pick = choices[(choices.indexOf(prev.sleepMinutes as (typeof choices)[number]) + 1) % choices.length];
      toast(pick ? `Uyqu taymeri: ${pick} daqiqa` : "Uyqu taymeri o‘chirildi");
      return { ...prev, sleepUntil: pick ? Date.now() + pick * 60000 : null, sleepMinutes: pick };
    });
  }

  const position = (book: Book) => (live?.id === book.id ? live.at : save.progress[book.id] ?? 0);
  const lengthOf = (book: Book) => (live?.id === book.id && live.duration ? live.duration : book.audioSeconds);
  const playingNow = (id: string) => Boolean(live?.playing && live.id === id);

  const text = query.trim().toLocaleLowerCase();
  const found = catalog.items.filter((b) => !text || `${b.title} ${b.author}`.toLocaleLowerCase().includes(text));
  const lastBook = byId(save.last);
  const mineItems = catalog.items.filter((b) => (mine === "saved" ? shelf.includes(b.id) : save.finished.includes(b.id)));

  return (
    <div className="mobile-library">
      {screen === "catalog" && (
        <div className="lib-screen">
          <header className="lib-head">
            <h1>Kutubxona</h1>
            <button type="button" onClick={() => setScreen("mine")}>Kitoblarim</button>
            {editor && (
              <button type="button" className="lib-add" aria-label="Kitob qo‘shish" onClick={() => setEditing({ book: null })}>
                <Plus size={18} />
              </button>
            )}
          </header>
          <label className="lib-search">
            <Search size={18} />
            <input value={query} placeholder="Kitob yoki muallif" onChange={(event) => setQuery(event.target.value)} />
            {query && <button type="button" aria-label="Qidiruvni tozalash" onClick={() => setQuery("")}>×</button>}
          </label>

          {!query && lastBook && lastBook.audioUrl && (
            <section className="lib-continue">
              <div className="lib-section"><h2>Tinglashni davom ettirish</h2></div>
              <article>
                <Cover book={lastBook} size="sm" />
                <span>
                  <strong>{lastBook.title}</strong>
                  <small>{lastBook.author}</small>
                  <em>{clock(position(lastBook))} / {clock(lengthOf(lastBook))}</em>
                </span>
                <button type="button" className="lib-round" aria-label={playingNow(lastBook.id) ? "Pauza" : "Davom ettirish"} onClick={() => toggle(lastBook.id)}>
                  {playingNow(lastBook.id) ? <Pause size={18} /> : <Play size={18} />}
                </button>
              </article>
            </section>
          )}

          {catalog.loading ? (
            <p className="lib-empty">Kitoblar yuklanmoqda…</p>
          ) : (
            <BookShelf items={found} onOpen={(id) => openBook(id)} onPlay={(id) => { play(id); openBook(id); }} />
          )}
          {!catalog.loading && !catalog.items.length && (
            <div className="lib-empty">
              <p>Hozircha kutubxonada kitob yo‘q.</p>
              {editor && <button type="button" className="button" onClick={() => setEditing({ book: null })}><Plus size={16} /> Birinchi kitobni qo‘shish</button>}
            </div>
          )}
          {!catalog.loading && catalog.items.length > 0 && !found.length && <p className="lib-empty">Bu so‘rov bo‘yicha kitob topilmadi.</p>}
        </div>
      )}

      {screen === "mine" && (
        <div className="lib-screen">
          <header className="lib-head lib-head-center">
            <button type="button" aria-label="Orqaga" onClick={() => setScreen("catalog")}><ChevronLeft size={22} /></button>
            <h1>Mening kitoblarim</h1>
            <span />
          </header>
          <div className="lib-mine-tabs" role="tablist">
            {([["saved", "Saqlangan"], ["finished", "Tugatilgan"]] as const).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={mine === id} className={mine === id ? "is-on" : ""} onClick={() => setMine(id)}>{label}</button>
            ))}
          </div>
          <div className="lib-list">
            {mineItems.map((book) => {
              const length = lengthOf(book);
              const ratio = length ? Math.min(100, (position(book) / length) * 100) : 0;
              return (
                <article key={book.id} className="lib-row">
                  <button type="button" className="lib-row-main" onClick={() => openBook(book.id, "mine")}>
                    <Cover book={book} />
                    <span>
                      <strong>{book.title}</strong>
                      <small>{book.author}</small>
                      {book.audioUrl ? (
                        <>
                          <span className="lib-bar" aria-hidden="true"><i style={{ width: `${ratio}%` }} /></span>
                          <em>{clock(position(book))} / {clock(length)}</em>
                        </>
                      ) : <em>Audio hali yuklanmagan</em>}
                    </span>
                  </button>
                  {book.audioUrl && (
                    <button type="button" className="lib-round" aria-label={`${book.title}ni tinglash`} onClick={() => toggle(book.id)}>
                      {playingNow(book.id) ? <Pause size={16} /> : <Headphones size={16} />}
                    </button>
                  )}
                </article>
              );
            })}
          </div>
          {!mineItems.length && <p className="lib-empty">{mine === "saved" ? "Saqlangan kitob yo‘q. Kitob sahifasidagi xatcho‘p bilan qo‘shing." : "Oxirigacha tinglangan kitoblar shu yerda ko‘rinadi."}</p>}
        </div>
      )}

      {screen === "player" && active && (
        <div className="lib-screen lib-player">
          <header className="lib-head">
            <button type="button" aria-label="Orqaga" onClick={() => setScreen(returnTo)}><ChevronLeft size={22} /></button>
            <h1>Audio kitob</h1>
            {editor && <button type="button" aria-label="Kitobni tahrirlash" onClick={() => setEditing({ book: active })}><Pencil size={17} /></button>}
            <button type="button" aria-label={shelf.includes(active.id) ? "Saqlangandan olish" : "Saqlash"} aria-pressed={shelf.includes(active.id)} onClick={() => onToggleSave(active.id)}>
              <Bookmark size={18} fill={shelf.includes(active.id) ? "currentColor" : "none"} />
            </button>
          </header>
          <Cover book={active} size="lg" />
          <h2>{active.title}</h2>
          <p>{active.author}</p>
          {active.audioUrl ? (
            <>
              <label className="lib-scrub">
                <span className="lib-sr">Joyini tanlash</span>
                <input type="range" min={0} max={Math.max(1, lengthOf(active))} step={1} value={Math.min(position(active), lengthOf(active))} onChange={(event) => seek(Number(event.target.value))} />
              </label>
              <div className="lib-times"><span>{clock(position(active))}</span><span>{clock(lengthOf(active))}</span></div>
              <div className="lib-transport">
                <button type="button" aria-label="15 soniya orqaga" onClick={() => seek(position(active) - 15)}><SkipBack size={18} /><b>15</b></button>
                <button type="button" className="lib-play" aria-label={playingNow(active.id) ? "Pauza" : "Ijro"} onClick={() => toggle(active.id)}>
                  {playingNow(active.id) ? <Pause size={28} /> : <Play size={28} />}
                </button>
                <button type="button" aria-label="15 soniya oldinga" onClick={() => seek(position(active) + 15)}><SkipForward size={18} /><b>15</b></button>
              </div>
              <div className="lib-tools">
                <button type="button" onClick={cycleSpeed}><b>{live?.speed ?? save.speed}x</b><small>Tezlik</small></button>
                <button type="button" onClick={cycleSleep} disabled={live?.id !== active.id}><Moon size={16} /><small>{live?.sleepMinutes ? `${live.sleepMinutes} daq` : "Uyqu taymeri"}</small></button>
              </div>
            </>
          ) : (
            <p className="lib-empty">Bu kitobning audiosi hali yuklanmagan.{editor ? " Tahrirlash (qalam) tugmasi orqali qo‘shing." : ""}</p>
          )}
          {active.summary && <p className="lib-summary">{active.summary}</p>}
        </div>
      )}

      <BookEditor open={Boolean(editing)} book={editing?.book ?? null} onClose={() => setEditing(null)} />
    </div>
  );
}

function chunkRows<T>(items: T[], size: number) {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += size) rows.push(items.slice(index, index + size));
  return rows;
}

function BookShelf({ items, onOpen, onPlay }: { items: Book[]; onOpen: (id: string) => void; onPlay: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <div className="lib-shelves">
      {chunkRows(items, 3).map((row) => (
        <section className="lib-shelf" key={row.map((book) => book.id).join("-")}>
          <div className="lib-shelf-books">
            {[0, 1, 2].map((slot) => {
              const book = row[slot];
              if (!book) return <span key={slot} />;
              return (
                <button key={book.id} type="button" className="lib-stood" aria-label={`${book.title} haqida`} onClick={() => onOpen(book.id)}>
                  <Cover book={book} />
                </button>
              );
            })}
          </div>
          <div className="lib-plank" aria-hidden="true" />
          <div className="lib-shelf-captions">
            {[0, 1, 2].map((slot) => {
              const book = row[slot];
              if (!book) return <span key={slot} />;
              return (
                <div key={book.id}>
                  <button type="button" className="lib-card-title" onClick={() => onOpen(book.id)}>{book.title}</button>
                  <p>{book.author}</p>
                  <div className="lib-formats" aria-label={`${book.title} formatlari`}>
                    {book.audioUrl && (
                      <button type="button" className="lib-format lib-format-audio" aria-label={`${book.title} audiokitobi, ${lengthLabel(book.audioSeconds)}`} onClick={() => onPlay(book.id)}>
                        <Headphones size={14} />
                        <span>{book.audioSeconds ? lengthLabel(book.audioSeconds) : "Audio"}</span>
                      </button>
                    )}
                    {book.active && <span className="lib-week">Hafta kitobi</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Muqova: yuklangan rasm bo'lsa rasm, bo'lmasa kitob rangida nom yozilgan muqova. */
export function Cover({ book, size = "md" }: { book: Book; size?: "sm" | "md" | "lg" }) {
  return (
    <div className={`lib-cover lib-cover-${size}${book.coverUrl ? " has-image" : ""}`} style={{ backgroundColor: book.color }} aria-hidden="true">
      {book.coverUrl ? <img src={book.coverUrl} alt="" loading="lazy" /> : (
        <>
          <span>{book.title}</span>
          {size === "lg" && <small>{book.author}</small>}
        </>
      )}
    </div>
  );
}
