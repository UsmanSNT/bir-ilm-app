"use client";

import ListenLink, { audioLinkOf } from "./listen-link";
import { useEffect, useId, useRef, useState } from "react";
import { BookOpen, BookPlus, Bookmark, ChevronLeft, Headphones, Library, Moon, Pause, Pencil, Play, Plus, Search, SkipBack, SkipForward } from "lucide-react";
import { toast } from "sonner";
import { useCatalog } from "@/lib/api/books-client";
import { useViewer } from "@/lib/api/roles-client";
import { canModerate } from "@/shared/contract/roles";
import type { Book } from "@/shared/contract";
import BookEditor from "./book-editor";
import EbookReader from "./ebook-reader";
import {
  OPEN_AUDIO_EVENT,
  SPEEDS,
  addListened,
  dayKey,
  listenedLabel,
  parseLibrarySave,
  readLibrarySnapshot,
  takeAudioRequest,
  useLibrarySave,
  writeLibrarySave,
} from "./library-store";

type Screen = "catalog" | "player";
type MineTab = "saved" | "finished";

export function clock(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = String(safe % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

type Live = { id: string; playing: boolean; at: number; duration: number; part: number; speed: number; sleepUntil: number | null; sleepMinutes: number | null };

/** `index`-qism boshlanadigan joy (soniya) — oldingi qismlar uzunligi yig'indisi. */
function startOf(book: Book, index: number) {
  return book.tracks.slice(0, index).reduce((sum, t) => sum + t.seconds, 0);
}

/** Butun kitobdagi joy → qaysi qism va uning ichidagi joy. */
function locate(book: Book, at: number): { index: number; offset: number } {
  let start = 0;
  for (let index = 0; index < book.tracks.length; index++) {
    const length = book.tracks[index].seconds;
    if (index === book.tracks.length - 1 || at < start + length) return { index, offset: Math.max(0, at - start) };
    start += length;
  }
  return { index: 0, offset: 0 };
}

function loadPart(el: HTMLAudioElement, book: Book, index: number, offset: number) {
  const track = book.tracks[index];
  if (!track) return;
  el.dataset.book = book.id;
  el.dataset.part = String(index);
  el.dataset.start = String(startOf(book, index));
  el.src = track.url;
  el.currentTime = offset;
}

export default function MobileLibrary({ shelf, onToggleSave }: { shelf: string[]; onToggleSave: (id: string) => void }) {
  const catalog = useCatalog();
  const viewer = useViewer();
  const editor = canModerate(viewer?.role);
  const save = useLibrarySave();
  const [screen, setScreen] = useState<Screen>("catalog");
  // «Kitoblarim» alohida sahifa emas: shu kutubxona sahifasida javon o'rniga shaxsiy ro'yxat ko'rsatiladi.
  const [showMine, setShowMine] = useState(false);
  const [mine, setMine] = useState<MineTab>("saved");
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [editing, setEditing] = useState<{ book: Book | null } | null>(null);
  const [reading, setReading] = useState<Book | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Tinglash hisobini to'xtatib, yig'ilganini saqlaydi (kitob almashganda ham chaqiriladi).
  const stopCounting = useRef<() => void>(() => {});
  const [wanted, setWanted] = useState<string | null>(null);

  const byId = (id: string | null) => catalog.items.find((b) => b.id === id) ?? null;
  const active = byId(activeId);
  // Audio hodisalari bir marta ulanadi — katalogni ref orqali o'qiydi.
  const booksRef = useRef(catalog.items);
  useEffect(() => {
    booksRef.current = catalog.items;
  }, [catalog.items]);

  // Bitta audio element: sahifa ichida kitoblar almashsa ham shu ishlatiladi.
  useEffect(() => {
    const el = new Audio();
    el.preload = "metadata";
    audioRef.current = el;
    let lastSaved = 0;
    // Haqiqiy tinglangan vaqt: ijro paytidagi soat vaqti (orqaga/oldinga surish hisoblanmaydi).
    let tick: number | null = null;
    let pending = 0;
    const count = (stillPlaying: boolean) => {
      const now = Date.now();
      if (tick !== null) {
        const gap = now - tick;
        if (gap > 0 && gap < 3000) pending += gap / 1000;
      }
      tick = stillPlaying ? now : null;
    };
    const flush = () => {
      const id = el.dataset.book;
      if (id && pending >= 1) addListened(id, pending);
      pending = 0;
    };
    stopCounting.current = () => {
      count(false);
      flush();
    };
    // Joy butun kitob bo'yicha: oldingi qismlar uzunligi + shu qismdagi joy.
    const globalAt = () => Number(el.dataset.start || 0) + el.currentTime;
    const sync = () =>
      setLive((prev) => {
        if (!prev) return prev;
        const book = booksRef.current.find((b) => b.id === el.dataset.book);
        const single = Number.isFinite(el.duration) && (book?.tracks.length ?? 0) <= 1 ? el.duration : 0;
        return { ...prev, at: globalAt(), duration: book?.audioSeconds || single || prev.duration, part: Number(el.dataset.part || 0), playing: !el.paused };
      });
    const onTime = () => {
      sync();
      count(!el.paused);
      const id = el.dataset.book;
      if (id && Date.now() - lastSaved > 3000) {
        lastSaved = Date.now();
        flush();
        writeLibrarySave({ progress: { ...parseLibrarySave(readLibrarySnapshot()).progress, [id]: globalAt() }, last: id });
      }
    };
    const onPlay = () => {
      tick = Date.now();
      sync();
    };
    const onPause = () => {
      count(false);
      flush();
      sync();
    };
    const onEnded = () => {
      const id = el.dataset.book;
      const book = booksRef.current.find((b) => b.id === id);
      const nextPart = Number(el.dataset.part || 0) + 1;
      // Keyingi qism bo'lsa — to'xtamasdan davom etadi.
      if (book && nextPart < book.tracks.length) {
        el.dataset.part = String(nextPart);
        el.dataset.start = String(startOf(book, nextPart));
        el.src = book.tracks[nextPart].url;
        void el.play().catch(() => toast.error("Keyingi qism ochilmadi. Qayta bosing."));
        return;
      }
      count(false);
      flush();
      sync();
      if (id) {
        const current = parseLibrarySave(readLibrarySnapshot());
        writeLibrarySave({ finished: current.finished.includes(id) ? current.finished : [...current.finished, id], progress: { ...current.progress, [id]: 0 } });
        toast.success("Kitob tugadi — «Tugatilgan»larga qo‘shildi");
      }
    };
    const onError = () => {
      if (el.src) toast.error("Audio ochilmadi. Internetni tekshiring yoki keyinroq urinib ko‘ring.");
      sync();
    };
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("loadedmetadata", sync);
    el.addEventListener("ended", onEnded);
    el.addEventListener("error", onError);
    return () => {
      count(false);
      flush();
      const id = el.dataset.book;
      if (id && globalAt()) writeLibrarySave({ progress: { ...parseLibrarySave(readLibrarySnapshot()).progress, [id]: globalAt() } });
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

  // Bosh sahifadagi «davom ettirish» so'rovi: kitob yuklangach pleerni ochib, ijroni boshlaymiz.
  useEffect(() => {
    const take = () => {
      const id = takeAudioRequest();
      if (id) setWanted(id);
    };
    take();
    window.addEventListener(OPEN_AUDIO_EVENT, take);
    return () => window.removeEventListener(OPEN_AUDIO_EVENT, take);
  }, []);

  useEffect(() => {
    if (!wanted || catalog.loading) return;
    const id = wanted;
    queueMicrotask(() => {
      setWanted(null);
      if (!byId(id)) return;
      openBook(id);
      if (byId(id)?.audioUrl) play(id);
    });
    // byId/openBook/play har renderda yangi, lekin so'rov bir marta bajariladi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, catalog.loading, catalog.items]);

  /** «Kutubxona» sarlavhasi: qidiruv va «Kitoblarim» tozalanib, javon boshiga qaytiladi. */
  function showLibraryHome() {
    setShowMine(false);
    setQuery("");
    setScreen("catalog");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openBook(id: string) {
    setActiveId(id);
    setScreen("player");
    window.scrollTo({ top: 0 });
  }

  /** `from` — shu joydan (soniya) boshlash; bo'lmasa to'xtagan joydan. */
  function play(id: string, from?: number) {
    const book = byId(id);
    const el = audioRef.current;
    if (!book || !el) return;
    if (!book.audioUrl) {
      toast("Bu kitobning audiosi hali yuklanmagan");
      return;
    }
    if (el.dataset.book !== id) {
      stopCounting.current();
      const at = from ?? save.progress[id] ?? 0;
      const { index, offset } = locate(book, at);
      loadPart(el, book, index, offset);
      setLive({ id, playing: false, at, duration: book.audioSeconds, part: index, speed: save.speed, sleepUntil: null, sleepMinutes: null });
    }
    el.playbackRate = live?.speed ?? save.speed;
    void el.play().catch(() => toast.error("Ijro etib bo‘lmadi. Qayta bosing."));
    writeLibrarySave({ last: id });
  }

  function toggle(id: string) {
    const el = audioRef.current;
    if (el && el.dataset.book === id && !el.paused) el.pause();
    else play(id);
  }

  function seek(at: number) {
    const el = audioRef.current;
    const target = Math.max(0, active?.audioSeconds ? Math.min(at, active.audioSeconds) : at);
    if (!el || !active || el.dataset.book !== active.id) {
      if (active) writeLibrarySave({ progress: { ...save.progress, [active.id]: target } });
      return;
    }
    const { index, offset } = locate(active, target);
    if (index === Number(el.dataset.part || 0)) {
      el.currentTime = Math.max(0, Math.min(offset, el.duration || offset));
      return;
    }
    const wasPlaying = !el.paused;
    loadPart(el, active, index, offset);
    setLive((prev) => (prev ? { ...prev, at: target, part: index } : prev));
    if (wasPlaying) void el.play().catch(() => {});
  }

  /** Qismlar ro'yxatidan tanlangan qismni boshidan ijro etadi. */
  function jumpTo(book: Book, index: number) {
    const el = audioRef.current;
    if (el?.dataset.book === book.id) {
      seek(startOf(book, index));
      if (el.paused) play(book.id);
    } else play(book.id, startOf(book, index));
  }

  function cycleSpeed() {
    const current = live?.speed ?? save.speed;
    const next = SPEEDS[(SPEEDS.indexOf(current) + 1) % SPEEDS.length];
    if (audioRef.current) audioRef.current.playbackRate = next;
    setLive((prev) => (prev ? { ...prev, speed: next } : prev));
    writeLibrarySave({ speed: next });
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
  const mineItems = found.filter((b) => (mine === "saved" ? shelf.includes(b.id) : save.finished.includes(b.id)));

  return (
    <div className="mobile-library">
      {screen === "catalog" && (
        <div className="lib-screen">
          <header className="lib-head lib-head-catalog">
            <div className="lib-title-row">
              <h1><button type="button" className="lib-home" onClick={showLibraryHome} title="Kutubxona boshiga">Kutubxona</button></h1>
            </div>
            <div className="lib-head-actions">
              <button type="button" className={`lib-mine${showMine ? " is-on" : ""}`} aria-pressed={showMine} onClick={() => setShowMine((on) => !on)}>
                <Library size={16} /> Kitoblarim
              </button>
              {editor && (
                <button type="button" className="lib-add" onClick={() => setEditing({ book: null })} aria-label="Kitob qo‘shish" title="Kitob qo‘shish">
                  <BookPlus size={19} />
                </button>
              )}
            </div>
          </header>
          <label className="lib-search">
            <Search size={18} />
            <input value={query} placeholder="Kitob yoki muallif" onChange={(event) => setQuery(event.target.value)} />
            {query && <button type="button" aria-label="Qidiruvni tozalash" onClick={() => setQuery("")}>×</button>}
          </label>

          {showMine ? (
            <>
              <div className="lib-mine-tabs" role="tablist" aria-label="Mening kitoblarim">
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
                      <button type="button" className="lib-row-main" onClick={() => openBook(book.id)}>
                        <Cover book={book} />
                        <span>
                          <strong>{book.title}</strong>
                          <small>{book.author}</small>
                          {book.audioUrl ? (
                            <>
                              <span className="lib-bar" aria-hidden="true"><i style={{ width: `${ratio}%` }} /></span>
                              <em>{clock(position(book))} / {clock(length)}</em>
                            </>
                          ) : audioLinkOf(book) ? <em>{audioLinkOf(book)!.label} havolasi bor</em> : book.ebook ? <em>Elektron kitob</em> : <em>Audio hali yuklanmagan</em>}
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
              {!catalog.loading && !mineItems.length && (
                <p className="lib-empty">
                  {text ? "Bu so‘rov bo‘yicha kitob topilmadi." : mine === "saved" ? "Saqlangan kitob yo‘q. Kitob sahifasidagi xatcho‘p bilan qo‘shing." : "Oxirigacha tinglangan kitoblar shu yerda ko‘rinadi."}
                </p>
              )}
            </>
          ) : (
            <>
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
                <BookShelf items={found} onOpen={(id) => openBook(id)} />
              )}
              {!catalog.loading && !catalog.items.length && (
                <div className="lib-empty">
                  <p>Hozircha kutubxonada kitob yo‘q.</p>
                  {editor && <button type="button" className="button" onClick={() => setEditing({ book: null })}><Plus size={16} /> Birinchi kitobni qo‘shish</button>}
                </div>
              )}
              {!catalog.loading && catalog.items.length > 0 && !found.length && <p className="lib-empty">Bu so‘rov bo‘yicha kitob topilmadi.</p>}
            </>
          )}
        </div>
      )}

      {screen === "player" && active && (
        <div className="lib-screen lib-player">
          <header className="lib-head">
            <button type="button" aria-label="Orqaga" onClick={() => setScreen("catalog")}><ChevronLeft size={22} /></button>
            <h1>{!active.audioUrl && !audioLinkOf(active) && active.ebook ? "Elektron kitob" : "Audio kitob"}</h1>
            {editor && <button type="button" aria-label="Kitobni tahrirlash" onClick={() => setEditing({ book: active })}><Pencil size={17} /></button>}
            <button type="button" aria-label={shelf.includes(active.id) ? "Saqlangandan olish" : "Saqlash"} aria-pressed={shelf.includes(active.id)} onClick={() => onToggleSave(active.id)}>
              <Bookmark size={18} fill={shelf.includes(active.id) ? "currentColor" : "none"} />
            </button>
          </header>
          <Cover book={active} size="lg" />
          <h2>{active.title}</h2>
          <p>{active.author}</p>
          {active.ebook && (
            <button type="button" className="button lib-read" onClick={() => setReading(active)}>
              <BookOpen size={18} /> Kitobni o‘qish
            </button>
          )}
          {active.audioUrl ? (
            <>
              <label className="lib-scrub">
                <span className="lib-sr">Joyini tanlash</span>
                <input type="range" min={0} max={Math.max(1, lengthOf(active))} step={1} value={Math.min(position(active), lengthOf(active))} onChange={(event) => seek(Number(event.target.value))} />
              </label>
              <div className="lib-times"><span>{clock(position(active))}</span><span>{clock(lengthOf(active))}</span></div>
              <p className="lib-listened">
                <Headphones size={15} />
                {save.listenedBooks[active.id] ? `Siz tingladingiz: ${listenedLabel(save.listenedBooks[active.id])}` : "Hali tinglanmagan"}
                {save.listenedDays[dayKey()] ? ` · bugun ${listenedLabel(save.listenedDays[dayKey()])}` : ""}
              </p>
              {active.tracks.length > 1 && (
                <p className="lib-part-now">
                  {(live?.id === active.id ? live.part : locate(active, position(active)).index) + 1}/{active.tracks.length}-qism
                  {active.tracks[live?.id === active.id ? live.part : locate(active, position(active)).index]?.title ? ` · ${active.tracks[live?.id === active.id ? live.part : locate(active, position(active)).index].title}` : ""}
                </p>
              )}
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
          ) : audioLinkOf(active) ? (
            <div className="lib-link-card">
              <p className="lib-link-address">{audioLinkOf(active)!.label} · {audioLinkOf(active)!.display}</p>
              <ListenLink book={active} className="button lib-link-btn" />
            </div>
          ) : !active.ebook || editor ? (
            <p className="lib-empty">Bu kitobning audiosi hali yuklanmagan.{editor ? " Tahrirlash (qalam) tugmasi orqali qo‘shing." : ""}</p>
          ) : null}
          {active.tracks.length > 1 && (
            <section className="lib-parts" aria-label="Qismlar">
              <h3>Qismlar · {active.tracks.length}</h3>
              <ol>
                {active.tracks.map((track, index) => {
                  const current = (live?.id === active.id ? live.part : locate(active, position(active)).index) === index;
                  return (
                    <li key={track.id}>
                      <button
                        type="button"
                        className={current ? "is-on" : undefined}
                        aria-current={current || undefined}
                        onClick={() => jumpTo(active, index)}
                      >
                        <b>{index + 1}</b>
                        <span>{track.title || `${index + 1}-qism`}</span>
                        <small>{clock(track.seconds)}</small>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}
          {active.summary && <p className="lib-summary">{active.summary}</p>}
        </div>
      )}

      <BookEditor open={Boolean(editing)} book={editing?.book ?? null} onClose={() => setEditing(null)} />
      {reading && <EbookReader book={reading} onClose={() => setReading(null)} />}
    </div>
  );
}

function chunkRows<T>(items: T[], size: number) {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += size) rows.push(items.slice(index, index + size));
  return rows;
}

/** Tokcha shakli (viewBox 0 0 100 170): pastdan ko'tarilgan devorlar va o'tkir ravoq. */
const NICHE_ARCH = "M0 170V40C0 22 30 14 50 3C70 14 100 22 100 40V170";
/** Ravoq ichki hoshiyasi — chiroq nuri shu chiziq bo'ylab. */
const NICHE_EDGE = "M3.2 170V41C3.2 24.5 31 16.8 50 7C69 16.8 96.8 24.5 96.8 41V170";

/** Barcha tokchalar uchun umumiy SVG ta'riflari (koshin devor, soya, chiroq nuri, yorug'lik filtri). */
function ShelfDefs({ id }: { id: string }) {
  return (
    <svg className="lib-shelf-defs" width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={`${id}-arch`} clipPathUnits="userSpaceOnUse">
          <path d={`${NICHE_ARCH}Z`} />
        </clipPath>
        {/* Koshin plitkasining rozetkasi har bir tokchaning o'rtasida, kitob tepasida turadi. */}
        <pattern id={`${id}-wall`} patternUnits="userSpaceOnUse" width="100" height="100.7" x="0" y="2">
          <image href="/assets/girih-koshin.webp" width="100" height="100.7" preserveAspectRatio="none" />
        </pattern>
        <linearGradient id={`${id}-shade`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b1231" stopOpacity=".5" />
          <stop offset=".4" stopColor="#1e2f6e" stopOpacity=".6" />
          <stop offset="1" stopColor="#0b1231" stopOpacity=".88" />
        </linearGradient>
        <radialGradient id={`${id}-depth`} cx=".5" cy=".42" r=".72">
          <stop offset=".55" stopColor="#0b1231" stopOpacity="0" />
          <stop offset="1" stopColor="#0b1231" stopOpacity=".6" />
        </radialGradient>
        <radialGradient id={`${id}-lamp`} cx=".5" cy=".05" fx=".5" fy=".05" r=".6">
          <stop offset="0" stopColor="#ffe6a6" stopOpacity=".8" />
          <stop offset=".32" stopColor="#f6c453" stopOpacity=".3" />
          <stop offset="1" stopColor="#f6c453" stopOpacity="0" />
        </radialGradient>
        <filter id={`${id}-glow`} x="-40%" y="-20%" width="180%" height="140%">
          <feGaussianBlur stdDeviation="2.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
    </svg>
  );
}

/** Bitta tokcha: koshin devor, tepadagi chiroq, ravoq bo'ylab nur va tilla qadama. */
function NicheArt({ id }: { id: string }) {
  return (
    <svg className="lib-niche-art" viewBox="0 0 100 170" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <g clipPath={`url(#${id}-arch)`}>
        <rect width="100" height="170" fill="#131f4c" />
        <rect width="100" height="170" fill={`url(#${id}-wall)`} />
        <rect width="100" height="170" fill={`url(#${id}-shade)`} />
        <rect width="100" height="170" fill={`url(#${id}-depth)`} />
        <rect className="lib-niche-lamp" width="100" height="170" fill={`url(#${id}-lamp)`} />
      </g>
      <path d={NICHE_ARCH} fill="none" stroke="#c08a2e" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      <path className="lib-niche-light" d={NICHE_EDGE} fill="none" stroke="#ffc864" strokeWidth="2.6" vectorEffect="non-scaling-stroke" filter={`url(#${id}-glow)`} />
      <path d={NICHE_EDGE} fill="none" stroke="#fff1c8" strokeWidth=".9" vectorEffect="non-scaling-stroke" />
      <circle cx="50" cy="13" r="2.2" fill="#fff3c4" filter={`url(#${id}-glow)`} />
    </svg>
  );
}

/**
 * Javon: o'ymakor yog'och tokcha, har kitob o'z ravoqli tokchasida (koshin devor, tepada chiroq).
 * Javonda faqat muqovalar turadi; kitob nomi, muallif va tinglash — kitob bosilganda ochiladigan sahifada.
 */
function BookShelf({ items, onOpen }: { items: Book[]; onOpen: (id: string) => void }) {
  const id = `shelf${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  if (!items.length) return null;
  return (
    <div className="lib-shelves">
      <ShelfDefs id={id} />
      {chunkRows(items, 3).map((row) => (
        <section className="lib-shelf" key={row.map((book) => book.id).join("-")}>
          <div className="lib-cornice" aria-hidden="true" />
          <div className="lib-shelf-books">
            {[0, 1, 2].map((slot) => {
              const book = row[slot];
              return (
                <div className="lib-niche" key={book?.id ?? `empty-${slot}`}>
                  <NicheArt id={id} />
                  {book && (
                    <button type="button" className="lib-stood" aria-label={`${book.title}, ${book.author} — batafsil`} onClick={() => onOpen(book.id)}>
                      <Cover book={book} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <div className="lib-plank" aria-hidden="true" />
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
