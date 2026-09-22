"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  Bookmark,
  ChevronLeft,
  Download,
  Headphones,
  List,
  Moon,
  Pause,
  Play,
  Search,
  SkipBack,
  SkipForward,
  SunMedium,
  Type,
} from "lucide-react";
import { toast } from "sonner";
import { books } from "./app-data";
import {
  clock,
  lengthLabel,
  library,
  seedDownloads,
  seedProgress,
  type LibraryMeta,
  type Spot,
} from "./library-data";

type Save = {
  downloads: string[];
  progress: Record<string, Spot>;
  finished: string[];
  speed: number;
};

type Live = Spot & { id: string; playing: boolean; speed: number; sleepUntil: number | null };

type Screen = "catalog" | "mine" | "player" | "reader";
type MineTab = "saved" | "downloaded" | "finished";
type Filter = "all" | "audio" | "text";
type Sort = "recent" | "title" | "progress";

const KEY = "bir-ilm-library-v1";
const speeds = [1, 1.25, 1.5, 2];

const seed: Save = {
  downloads: seedDownloads,
  progress: seedProgress,
  finished: [],
  speed: 1,
};

function parseSave(raw: string): Save {
  if (!raw) return seed;
  try {
    const parsed = JSON.parse(raw) as Partial<Save>;
    const progress: Record<string, Spot> = { ...seed.progress };
    if (parsed.progress && typeof parsed.progress === "object") {
      for (const [id, spot] of Object.entries(parsed.progress)) {
        if (spot && Number.isFinite(spot.chapter) && Number.isFinite(spot.at)) progress[id] = spot;
      }
    }
    return {
      downloads: Array.isArray(parsed.downloads) ? parsed.downloads.filter((id) => typeof id === "string") : seed.downloads,
      progress,
      finished: Array.isArray(parsed.finished) ? parsed.finished.filter((id) => typeof id === "string") : [],
      speed: typeof parsed.speed === "number" && speeds.includes(parsed.speed) ? parsed.speed : 1,
    };
  } catch {
    return seed;
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

function writeSave(next: Save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* Qurilma xotirasi to‘lsa tinglash shu sessiyada davom etadi. */
  }
  window.dispatchEvent(new Event("bir-library-save"));
}

function metaById(id: string) {
  return library.find((item) => item.id === id);
}

function bookById(id: string) {
  return books.find((item) => item.id === id);
}

function spotOf(save: Save, id: string): Spot {
  return save.progress[id] ?? { chapter: 0, at: 0 };
}

export default function MobileLibrary({
  shelf,
  onToggleSave,
  onReadPage,
}: {
  shelf: string[];
  onToggleSave: (id: string) => void;
  onReadPage: (page: number, total: number) => void;
}) {
  const raw = useSyncExternalStore(subscribe, readSnapshot, () => "");
  const save = useMemo(() => parseSave(raw), [raw]);
  const [screen, setScreen] = useState<Screen>("catalog");
  const [mine, setMine] = useState<MineTab>("downloaded");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [showFresh, setShowFresh] = useState(false);
  const [activeId, setActiveId] = useState("atomic-habits");
  const [live, setLive] = useState<Live | null>(null);
  const liveRef = useRef<Live | null>(null);
  liveRef.current = live;
  const [font, setFont] = useState(18);
  const [brightness, setBrightness] = useState(1);
  const [showLight, setShowLight] = useState(false);
  const [showContents, setShowContents] = useState(false);
  const [returnTo, setReturnTo] = useState<Screen>("catalog");

  const active = metaById(activeId) ?? library[0];
  const activeBook = bookById(active.id);

  useEffect(() => {
    if (!live?.playing) return;
    const timer = window.setInterval(() => {
      setLive((prev) => {
        if (!prev?.playing) return prev;
        const item = metaById(prev.id);
        const chapter = item?.chapters[prev.chapter];
        if (!item || !chapter || chapter.seconds <= 0) return { ...prev, playing: false };
        if (prev.sleepUntil && Date.now() >= prev.sleepUntil) {
          toast("Uyqu taymeri tugadi");
          return { ...prev, playing: false, sleepUntil: null };
        }
        let at = prev.at + 0.25 * prev.speed;
        let chapterIndex = prev.chapter;
        if (at >= chapter.seconds) {
          if (chapterIndex + 1 < item.chapters.length) {
            chapterIndex += 1;
            at = 0;
          } else {
            return { ...prev, at: chapter.seconds, playing: false };
          }
        }
        return { ...prev, at, chapter: chapterIndex };
      });
    }, 250);
    const persist = window.setInterval(() => {
      const prev = liveRef.current;
      if (!prev) return;
      const current = parseSave(readSnapshot());
      writeSave({
        ...current,
        speed: prev.speed,
        progress: { ...current.progress, [prev.id]: { chapter: prev.chapter, at: prev.at } },
      });
    }, 1000);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(persist);
    };
  }, [live?.playing, live?.id]);

  useEffect(() => {
    if (!live || live.playing) return;
    const current = parseSave(readSnapshot());
    writeSave({
      ...current,
      speed: live.speed,
      progress: { ...current.progress, [live.id]: { chapter: live.chapter, at: live.at } },
    });
  }, [live]);

  function place(id: string): Spot {
    if (live?.id === id) return { chapter: live.chapter, at: live.at };
    return spotOf(save, id);
  }

  function openPlayer(id: string, from: Screen = screen) {
    const item = metaById(id);
    if (!item?.audio) {
      toast("Bu kitobning audio nusxasi yo‘q");
      openReader(id, from);
      return;
    }
    const spot = place(id);
    setReturnTo(from);
    setActiveId(id);
    setLive({
      id,
      chapter: spot.chapter,
      at: spot.at,
      playing: true,
      speed: live?.speed ?? save.speed,
      sleepUntil: live?.id === id ? live.sleepUntil : null,
    });
    setScreen("player");
    window.scrollTo({ top: 0 });
  }

  function openReader(id: string, from: Screen = screen) {
    const item = metaById(id);
    if (!item?.text) {
      toast("Bu kitobning matn nusxasi yo‘q");
      return;
    }
    setReturnTo(from);
    setActiveId(id);
    setShowContents(false);
    setScreen("reader");
    const book = bookById(id);
    const spot = place(id);
    if (id === "atomic-habits" && book && item.chapters[spot.chapter]) onReadPage(item.chapters[spot.chapter].page, book.pages);
    window.scrollTo({ top: 0 });
  }

  function toggleDownload() {
    const has = save.downloads.includes(active.id);
    writeSave({
      ...save,
      downloads: has ? save.downloads.filter((id) => id !== active.id) : [...save.downloads, active.id],
    });
    toast.success(has ? "Yuklama olib tashlandi" : "Kitob yuklanganlarga qo‘shildi");
  }

  function toggleBookmark() {
    onToggleSave(active.id);
  }

  function cycleSpeed() {
    const current = live?.speed ?? save.speed;
    const next = speeds[(speeds.indexOf(current) + 1) % speeds.length];
    setLive((prev) => (prev ? { ...prev, speed: next } : prev));
    writeSave({ ...parseSave(readSnapshot()), speed: next });
  }

  function cycleSleep() {
    setLive((prev) => {
      if (!prev) return prev;
      const choices = [null, 15, 30, 45] as const;
      const left = prev.sleepUntil ? Math.max(1, Math.round((prev.sleepUntil - Date.now()) / 60000)) : 0;
      const index = left >= 40 ? 3 : left >= 20 ? 2 : left > 0 ? 1 : 0;
      const pick = choices[(index + 1) % choices.length];
      toast(pick ? `Uyqu taymeri: ${pick} daqiqa` : "Uyqu taymeri o‘chirildi");
      return { ...prev, sleepUntil: pick ? Date.now() + pick * 60000 : null };
    });
  }

  function seek(at: number) {
    setLive((prev) => (prev ? { ...prev, at } : prev));
  }

  function skip(delta: number) {
    setLive((prev) => {
      if (!prev) return prev;
      const item = metaById(prev.id);
      const chapter = item?.chapters[prev.chapter];
      if (!chapter) return prev;
      return { ...prev, at: Math.min(chapter.seconds, Math.max(0, prev.at + delta)) };
    });
  }

  function chooseChapter(index: number, play: boolean) {
    setLive((prev) => {
      const base = prev ?? {
        id: active.id,
        chapter: 0,
        at: 0,
        playing: play,
        speed: save.speed,
        sleepUntil: null,
      };
      return { ...base, id: active.id, chapter: index, at: 0, playing: play };
    });
    setShowContents(false);
    if (!play && active.id === "atomic-habits") {
      const book = bookById(active.id);
      const next = active.chapters[index];
      if (book && next) onReadPage(next.page, book.pages);
    }
  }

  function markFinished() {
    if (save.finished.includes(active.id)) {
      toast("Bu kitob allaqachon tugatilgan");
      return;
    }
    writeSave({ ...parseSave(readSnapshot()), finished: [...save.finished, active.id] });
    toast.success("Tugatilganlarga qo‘shildi");
    setMine("finished");
    setScreen("mine");
  }

  const queryText = query.trim().toLocaleLowerCase();
  const matches = (item: LibraryMeta) => {
    const book = bookById(item.id);
    if (!book) return false;
    if (filter === "audio" && !item.audio) return false;
    if (filter === "text" && !item.text) return false;
    if (!queryText) return true;
    return `${book.title} ${book.author}`.toLocaleLowerCase().includes(queryText);
  };

  const highlights = library.filter((item) => item.highlight && matches(item));
  const fresh = library.filter((item) => item.fresh && matches(item));
  const searched = library.filter(matches);

  const mineItems = library
    .filter((item) => {
      if (mine === "saved") return shelf.includes(item.id);
      if (mine === "downloaded") return save.downloads.includes(item.id);
      return save.finished.includes(item.id);
    })
    .sort((a, b) => {
      if (sort === "title") return (bookById(a.id)?.title ?? "").localeCompare(bookById(b.id)?.title ?? "");
      if (sort === "progress") {
        const ratio = (item: LibraryMeta) => {
          const spot = place(item.id);
          const chapter = item.chapters[spot.chapter];
          return chapter?.seconds ? spot.at / chapter.seconds : 0;
        };
        return ratio(b) - ratio(a);
      }
      return save.downloads.indexOf(a.id) - save.downloads.indexOf(b.id);
    });

  const downloadCount = save.downloads.length;
  const downloadSize = library.filter((item) => save.downloads.includes(item.id)).reduce((sum, item) => sum + item.sizeMb, 0);
  const chapter = active.chapters[(live?.id === active.id ? live.chapter : place(active.id).chapter)] ?? active.chapters[0];
  const at = live?.id === active.id ? live.at : place(active.id).at;
  const playing = Boolean(live?.playing && live.id === active.id);

  return (
    <div className="mobile-library">
      {screen === "catalog" && (
        <div className="lib-screen">
          <header className="lib-head">
            <h1>Kutubxona</h1>
            <button type="button" onClick={() => { setMine("downloaded"); setScreen("mine"); }}>Kitoblarim</button>
            <button type="button" aria-label="Qidiruv" onClick={() => document.getElementById("library-search")?.focus()}>
              <Search size={20} />
            </button>
          </header>
          <label className="lib-search">
            <Search size={18} />
            <input
              id="library-search"
              value={query}
              placeholder="Kitob yoki muallif"
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <button type="button" aria-label="Qidiruvni tozalash" onClick={() => setQuery("")}>
                ×
              </button>
            )}
          </label>
          <div className="lib-filters" role="tablist" aria-label="Kitob turi">
            {([
              ["all", "Barchasi"],
              ["audio", "Audio"],
              ["text", "Elektron"],
            ] as const).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={filter === id} className={filter === id ? "is-on" : ""} onClick={() => setFilter(id)}>
                {label}
              </button>
            ))}
          </div>

          {!query && filter === "all" && <Continue item={library[0]} spot={place(library[0].id)} onPlay={() => openPlayer(library[0].id)} onAll={() => { setMine("downloaded"); setScreen("mine"); }} />}

          <BookShelf
            items={query || filter !== "all" ? searched : highlights}
            onOpen={(id) => openReader(id)}
            onPlay={(id) => openPlayer(id)}
          />
          {!searched.length && <p className="lib-empty">Bu so‘rov bo‘yicha kitob topilmadi.</p>}

          {!query && filter === "all" && (
            <>
              <div className="lib-section">
                <h2>Yangilar</h2>
                <button type="button" onClick={() => setShowFresh((value) => !value)}>{showFresh ? "Yig‘ish" : "Barchasini ko‘rish"}</button>
              </div>
              <BookShelf
                items={showFresh ? fresh : fresh.slice(0, 3)}
                onOpen={(id) => openReader(id)}
                onPlay={(id) => openPlayer(id)}
              />
            </>
          )}
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
            {([
              ["saved", "Saqlangan"],
              ["downloaded", "Yuklangan"],
              ["finished", "Tugatilgan"],
            ] as const).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={mine === id} className={mine === id ? "is-on" : ""} onClick={() => setMine(id)}>
                {label}
              </button>
            ))}
          </div>
          <div className="lib-mine-meta">
            <span>{mine === "downloaded" ? `${downloadCount} kitob · ${downloadSize} MB` : `${mineItems.length} kitob`}</span>
            <label>
              Saralash
              <select aria-label="Saralash" value={sort} onChange={(event) => setSort(event.target.value as Sort)}>
                <option value="recent">So‘nggi</option>
                <option value="title">Nom</option>
                <option value="progress">Jarayon</option>
              </select>
            </label>
          </div>
          <div className="lib-list">
            {mineItems.map((item) => {
              const book = bookById(item.id);
              const spot = place(item.id);
              const current = item.chapters[spot.chapter] ?? item.chapters[0];
              const ratio = current?.seconds ? Math.min(100, (spot.at / current.seconds) * 100) : 0;
              if (!book) return null;
              return (
                <article key={item.id} className="lib-row">
                  <button type="button" className="lib-row-main" onClick={() => openReader(item.id, "mine")}>
                    <Cover id={item.id} />
                    <span>
                      <strong>{book.title}</strong>
                      <small>{book.author}</small>
                      {item.audio && current?.seconds ? (
                        <>
                          <span className="lib-bar" aria-hidden="true"><i style={{ width: `${ratio}%` }} /></span>
                          <em>{clock(spot.at)} / {clock(current.seconds)}</em>
                        </>
                      ) : <em>Elektron matn</em>}
                    </span>
                  </button>
                  {item.audio && (
                    <button type="button" className="lib-round" aria-label={`${book.title}ni tinglash`} onClick={() => openPlayer(item.id, "mine")}>
                      <Headphones size={16} />
                    </button>
                  )}
                </article>
              );
            })}
          </div>
          {!mineItems.length && <p className="lib-empty">{mine === "saved" ? "Saqlangan kitob yo‘q. Pleyerdagi xatcho‘p bilan qo‘shing." : mine === "finished" ? "Tugatilgan kitoblar shu yerda ko‘rinadi." : "Yuklangan kitob yo‘q."}</p>}
        </div>
      )}

      {screen === "player" && activeBook && (
        <div className="lib-screen lib-player">
          <header className="lib-head">
            <button type="button" aria-label="Orqaga" onClick={() => setScreen(returnTo)}><ChevronLeft size={22} /></button>
            <h1>Audio kitob</h1>
            <button type="button" aria-label={save.downloads.includes(active.id) ? "Yuklamani olish" : "Yuklab olish"} aria-pressed={save.downloads.includes(active.id)} onClick={toggleDownload}>
              <Download size={18} />
            </button>
            <button type="button" aria-label={shelf.includes(active.id) ? "Saqlangandan olish" : "Saqlash"} aria-pressed={shelf.includes(active.id)} onClick={toggleBookmark}>
              <Bookmark size={18} fill={shelf.includes(active.id) ? "currentColor" : "none"} />
            </button>
          </header>
          <Cover id={active.id} size="lg" />
          <h2>{activeBook.title}</h2>
          <p>{activeBook.author}</p>
          <p className="lib-chapter">{active.chapters[live?.id === active.id ? live.chapter : place(active.id).chapter]?.title}</p>
          <label className="lib-scrub">
            <span className="lib-sr">Joyini tanlash</span>
            <input
              type="range"
              min={0}
              max={chapter?.seconds || 1}
              value={Math.min(at, chapter?.seconds || 0)}
              onChange={(event) => seek(Number(event.target.value))}
            />
          </label>
          <div className="lib-times"><span>{clock(at)}</span><span>{clock(chapter?.seconds || 0)}</span></div>
          <div className="lib-transport">
            <button type="button" aria-label="15 soniya orqaga" onClick={() => skip(-15)}><SkipBack size={18} /><b>15</b></button>
            <button type="button" className="lib-play" aria-label={playing ? "Pauza" : "Ijro"} onClick={() => setLive((prev) => prev ? { ...prev, playing: !prev.playing } : { id: active.id, ...place(active.id), playing: true, speed: save.speed, sleepUntil: null })}>
              {playing ? <Pause size={28} /> : <Play size={28} />}
            </button>
            <button type="button" aria-label="15 soniya oldinga" onClick={() => skip(15)}><SkipForward size={18} /><b>15</b></button>
          </div>
          <div className="lib-tools">
            <button type="button" onClick={cycleSpeed}><b>{live?.speed ?? save.speed}x</b><small>Tezlik</small></button>
            <button type="button" onClick={cycleSleep}><Moon size={16} /><small>Uyqu taymeri</small></button>
            <button type="button" onClick={() => document.getElementById("chapter-list")?.scrollIntoView({ behavior: "smooth" })}><List size={16} /><small>Boblar ro‘yxati</small></button>
          </div>
          <h3 id="chapter-list">Boblar</h3>
          <ol className="lib-chapters">
            {active.chapters.map((item, index) => {
              const currentIndex = live?.id === active.id ? live.chapter : place(active.id).chapter;
              const on = index === currentIndex;
              return (
                <li key={item.title}>
                  <button type="button" className={on ? "is-on" : ""} onClick={() => chooseChapter(index, true)}>
                    <span>{index + 1}. {item.title}</span>
                    <em>{clock(item.seconds)}{on ? " ▮▮" : ""}</em>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {screen === "reader" && activeBook && (
        <div className="lib-screen lib-reader" style={{ fontSize: font }}>
          <header className="lib-head">
            <button type="button" aria-label="Orqaga" onClick={() => setScreen(returnTo)}><ChevronLeft size={22} /></button>
            <h1>{activeBook.title}</h1>
            <button type="button" aria-label="Shrift" onClick={() => setFont((value) => value >= 22 ? 16 : value + 2)}><Type size={18} /></button>
            <button type="button" aria-label={shelf.includes(active.id) ? "Saqlangandan olish" : "Saqlash"} aria-pressed={shelf.includes(active.id)} onClick={toggleBookmark}>
              <Bookmark size={18} fill={shelf.includes(active.id) ? "currentColor" : "none"} />
            </button>
          </header>
          <article style={{ filter: `brightness(${brightness})` }}>
            <p className="lib-sample">Namunaviy matn</p>
            <p className="lib-ch-no">{(live?.id === active.id ? live.chapter : place(active.id).chapter) + 1}-bob</p>
            <h2>{chapter?.title}</h2>
            {active.sample.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            <button className="lib-finish" type="button" onClick={markFinished}>Tugatildi deb belgilash</button>
          </article>
          {showLight && (
            <label className="lib-light">
              <SunMedium size={16} />
              <input type="range" min={0.7} max={1} step={0.02} value={brightness} aria-label="Yorug‘lik" onChange={(event) => setBrightness(Number(event.target.value))} />
            </label>
          )}
          {showContents && (
            <ol className="lib-contents">
              {active.chapters.map((item, index) => (
                <li key={item.title}>
                  <button type="button" onClick={() => chooseChapter(index, false)}>{index + 1}. {item.title}</button>
                </li>
              ))}
            </ol>
          )}
          <div className="lib-readbar">
            <button type="button" onClick={() => { setShowLight((value) => !value); setShowContents(false); }}><SunMedium size={16} /><small>Yorug‘lik</small></button>
            <button type="button" onClick={() => setFont((value) => value >= 22 ? 16 : value + 2)}><Type size={16} /><small>Shrift</small></button>
            <button type="button" onClick={() => { setShowContents((value) => !value); setShowLight(false); }}><List size={16} /><small>Mundarija</small></button>
            <button type="button" onClick={() => openPlayer(active.id, "reader")}><Headphones size={16} /><small>Audio tinglash</small></button>
            <span>{chapter?.page ?? 1} / {activeBook.pages}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Continue({ item, spot, onPlay, onAll }: { item: LibraryMeta; spot: Spot; onPlay: () => void; onAll: () => void }) {
  const book = bookById(item.id);
  const chapter = item.chapters[spot.chapter];
  if (!book || !chapter) return null;
  return (
    <section className="lib-continue">
      <div className="lib-section">
        <h2>Tinglashni davom ettirish</h2>
        <button type="button" onClick={onAll}>Barchasini ko‘rish</button>
      </div>
      <article>
        <Cover id={item.id} size="sm" />
        <span>
          <strong>{book.title}</strong>
          <small>{book.author}</small>
          <em>{clock(spot.at)} / {clock(chapter.seconds)}</em>
        </span>
        <button type="button" className="lib-round" aria-label="Davom ettirish" onClick={onPlay}><Play size={18} /></button>
      </article>
    </section>
  );
}

function chunkRows<T>(items: T[], size: number) {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += size) rows.push(items.slice(index, index + size));
  return rows;
}

function BookShelf({
  items,
  onOpen,
  onPlay,
}: {
  items: LibraryMeta[];
  onOpen: (id: string) => void;
  onPlay: (id: string) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="lib-shelves">
      {chunkRows(items, 3).map((row) => (
        <section className="lib-shelf" key={row.map((item) => item.id).join("-")}>
          <div className="lib-shelf-books">
            {[0, 1, 2].map((slot) => {
              const item = row[slot];
              const book = item ? bookById(item.id) : null;
              if (!item || !book) return <span key={slot} />;
              return (
                <button key={item.id} type="button" className="lib-stood" aria-label={`${book.title}ni o‘qish`} onClick={() => onOpen(item.id)}>
                  <Cover id={item.id} />
                </button>
              );
            })}
          </div>
          <div className="lib-plank" aria-hidden="true" />
          <div className="lib-shelf-captions">
            {[0, 1, 2].map((slot) => {
              const item = row[slot];
              const book = item ? bookById(item.id) : null;
              if (!item || !book) return <span key={slot} />;
              return (
                <div key={item.id}>
                  <button type="button" className="lib-card-title" onClick={() => onOpen(item.id)}>{book.title}</button>
                  <p>{book.author}</p>
                  {item.audio ? (
                    <button type="button" className="lib-duration" onClick={() => onPlay(item.id)}>
                      <Headphones size={13} /> {lengthLabel(item.totalSeconds)}
                    </button>
                  ) : <span className="lib-duration">Elektron</span>}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function Cover({ id, size = "md" }: { id: string; size?: "sm" | "md" | "lg" }) {
  const book = bookById(id);
  return (
    <div className={`lib-cover lib-cover-${size} cover-${id}`} aria-hidden="true">
      {size === "md" && <CoverArt id={id} />}
      <span>{book?.title}</span>
      {size === "lg" && <small>{book?.author}</small>}
    </div>
  );
}

function CoverArt({ id }: { id: string }) {
  if (id === "otkan-kunlar") {
    return (
      <svg className="lib-art" viewBox="0 0 90 130" preserveAspectRatio="xMidYMid slice">
        <rect width="90" height="78" fill="#8ec6ea" />
        <rect y="78" width="90" height="52" fill="#7daa55" />
        <circle cx="70" cy="28" r="10" fill="#f6e7b2" />
        <path d="M8 92c8-16 14-16 22 0 6-18 16-20 24 0 8-14 16-14 28 2v36H8z" fill="#2f6b38" />
        <path d="M18 86c6-12 10-12 16 2 5-14 12-14 18 4v38H18z" fill="#3e8144" />
      </svg>
    );
  }
  if (id === "dunyoning-ishlari") {
    return (
      <svg className="lib-art" viewBox="0 0 90 130" preserveAspectRatio="xMidYMid slice">
        <rect width="90" height="130" fill="#b7d4e4" />
        <path d="M0 78 L28 36 L46 62 L68 28 L90 70 V130 H0z" fill="#6d8ea3" />
        <path d="M0 92 L24 58 L42 78 L90 48 V130 H0z" fill="#d7e4ea" />
        <path d="M0 108h90v22H0z" fill="#8fb4c4" />
      </svg>
    );
  }
  if (id === "alchemist") {
    return (
      <svg className="lib-art" viewBox="0 0 90 130" preserveAspectRatio="xMidYMid slice">
        <rect width="90" height="130" fill="#e8834a" />
        <circle cx="64" cy="36" r="12" fill="#f6d27a" />
        <path d="M0 78c18 10 28-8 46 2 16 8 28-6 44 4v46H0z" fill="#d86a32" />
        <path d="M0 100c20 8 34-6 52 2 14 6 24-4 38 6v22H0z" fill="#c45a28" />
      </svg>
    );
  }
  if (id === "kecha-va-kunduz") {
    return (
      <svg className="lib-art" viewBox="0 0 90 130" preserveAspectRatio="xMidYMid slice">
        <rect width="90" height="70" fill="#e7a15a" />
        <circle cx="46" cy="58" r="14" fill="#f3d7a2" />
        <rect y="70" width="90" height="60" fill="#2c5878" />
        <path d="M20 92h50M16 104h58M24 116h42" stroke="#d7e6ef" strokeWidth="2" />
      </svg>
    );
  }
  if (id === "mehrobdan-chayon") {
    return (
      <svg className="lib-art" viewBox="0 0 90 130" preserveAspectRatio="xMidYMid slice">
        <rect width="90" height="130" fill="#c4513d" />
        <circle cx="62" cy="34" r="16" fill="#e7b089" />
        <path d="M45 130 V62 M45 78 L28 96 M45 70 L66 90 M45 92 L30 112 M45 88 L64 112" stroke="#4a1816" strokeWidth="4" fill="none" />
        <rect y="108" width="90" height="22" fill="#6d2a22" />
      </svg>
    );
  }
  if (id === "ikigai" || id === "deep-work" || id === "money-psychology" || id === "1984") {
    return (
      <svg className="lib-art" viewBox="0 0 90 130" preserveAspectRatio="xMidYMid slice">
        <rect width="90" height="130" fill={id === "ikigai" ? "#c4b483" : id === "deep-work" ? "#2f8f78" : id === "1984" ? "#6a9aaf" : "#6d7c8a"} />
        <rect x="14" y="28" width="62" height="74" rx="2" fill="rgba(255,255,255,.16)" />
      </svg>
    );
  }
  return null;
}
