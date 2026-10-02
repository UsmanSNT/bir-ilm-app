"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, BookOpen, Bookmark, Check, Flame, Headphones, Plus, Search, Sparkles, X } from "lucide-react";
import { useCatalog } from "@/lib/api/books-client";
import { useViewer } from "@/lib/api/roles-client";
import { canModerate } from "@/shared/contract/roles";
import type { Book } from "@/shared/contract";
import BookEditor from "./book-editor";

function lengthLabel(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  return hours <= 0 ? `${mins} daqiqa` : `${hours} soat ${mins} daq`;
}

export default function BookDiscovery({ shelf, onOpen, onToggle, onNavigate, page, total, streak, library = false, onProgress }: {
  shelf: string[]; onOpen: (book: Book) => void; onToggle: (book: Book) => void;
  onNavigate: (tab: string) => void; page: number; total: number; streak: number;
  library?: boolean; onProgress: () => void;
}) {
  const catalog = useCatalog();
  const viewer = useViewer();
  const editor = canModerate(viewer?.role);
  const [editing, setEditing] = useState<{ book: Book | null } | null>(null);
  const [query, setQuery] = useState("");
  const [savedOnly, setSavedOnly] = useState(false);
  const [sort, setSort] = useState("recent");
  const featured = catalog.active;

  const filtered = useMemo(() => catalog.items.filter(book =>
    (!savedOnly || shelf.includes(book.id)) &&
    `${book.title} ${book.author}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  ).sort((a, b) => sort === "short" ? (a.audioSeconds || Infinity) - (b.audioSeconds || Infinity) : sort === "title" ? a.title.localeCompare(b.title) : 0), [catalog.items, query, savedOnly, shelf, sort]);

  return <div className="discovery">
    {!library && <div className="discovery-intro">
      <section className="discovery-feature">
        <span className="discovery-kicker"><Sparkles size={16}/> HAFTA KITOBI</span>
        {featured ? <>
          <h2>{featured.title}</h2>
          <p>{featured.author}{featured.summary ? ` — ${featured.summary.slice(0, 140)}${featured.summary.length > 140 ? "…" : ""}` : ""}</p>
          <button onClick={() => onOpen(featured)}>Kitob bilan tanishish <ArrowUpRight size={19}/></button>
        </> : <>
          <h2>Haftaning kitobi<br/><em>hali tanlanmagan.</em></h2>
          <p>{editor ? "Kitob qo‘shing va «Haftaning kitobi» belgisini qo‘ying." : "Tez orada shu yerda haftaning kitobi paydo bo‘ladi."}</p>
          {editor && <button onClick={() => setEditing({ book: null })}>Kitob qo‘shish <Plus size={19}/></button>}
        </>}
      </section>
      <section className="discovery-progress">
        <span className="discovery-kicker"><Flame size={17}/> MENING MUTOLAAM</span>
        <div className="reading-number">{page}<span> / {total} sahifa</span></div>
        <p>{featured ? `${featured.title} · haftalik mutolaa` : "Haftalik mutolaa"}</p>
        <progress value={page} max={total} aria-label="Haftalik mutolaa"/>
        <div className="reading-meta"><span>{Math.round(page / Math.max(1, total) * 100)}% o‘qildi</span><span>{streak} kun ketma-ket</span></div>
        <button onClick={onProgress}>Natijamni yangilash <ArrowUpRight size={18}/></button>
      </section>
    </div>}

    <div className="discovery-title">
      <div><span className="discovery-kicker">SIZNING KEYINGI KITOBINGIZ</span><h2>{library ? "Kitoblar kutubxonasi" : "Mutolaa olamini kashf eting"}</h2></div>
      <span className="catalog-count">{catalog.items.length} kitob</span>
      {editor && <button className="catalog-add" onClick={() => setEditing({ book: null })}><Plus size={17}/> Kitob qo‘shish</button>}
    </div>
    <div className="discovery-controls">
      <label className="discovery-search"><Search size={20}/><input aria-label="Kitob yoki muallifni izlash" placeholder="Kitob yoki muallifni izlang..." value={query} onChange={e => setQuery(e.target.value)}/>{query && <button aria-label="Qidiruvni tozalash" onClick={() => setQuery("")}><X size={17}/></button>}</label>
      <button className={`shelf-filter ${savedOnly ? "is-active" : ""}`} aria-pressed={savedOnly} onClick={() => setSavedOnly(!savedOnly)}><Bookmark size={18}/>Javonim <span>{shelf.length}</span></button>
      <select aria-label="Kitoblarni saralash" value={sort} onChange={e => setSort(e.target.value)}><option value="recent">Yangilari</option><option value="short">Avval qisqa audiolar</option><option value="title">Nom bo‘yicha</option></select>
    </div>
    <div className="catalog-results" aria-live="polite">{catalog.loading ? "Yuklanmoqda…" : `${filtered.length} ta kitob${savedOnly ? " · mening javonimda" : ""}`}</div>
    <div className="discovery-books">{filtered.map((book, index) => <article className="discovery-book" key={book.id}>
      <button className={`discovery-cover cover-style-${index % 3}${book.coverUrl ? " has-image" : ""}`} style={{ backgroundColor: book.color }} onClick={() => onOpen(book)} aria-label={`${book.title} haqida`}>
        {book.coverUrl ? <img src={book.coverUrl} alt="" loading="lazy"/> : <><span className="cover-edition">BIR ILM / {String(index + 1).padStart(2, "0")}</span><strong>{book.title}</strong><span className="cover-author">{book.author}</span><BookOpen className="cover-symbol" size={30} strokeWidth={1}/></>}
      </button>
      <button className="catalog-save" aria-label={`${book.title}: ${shelf.includes(book.id) ? "javondan olish" : "javonga qo‘shish"}`} aria-pressed={shelf.includes(book.id)} onClick={() => onToggle(book)}>{shelf.includes(book.id) ? <Check size={17}/> : <Bookmark size={17}/>}</button>
      {book.active && <span className="catalog-genre">Hafta kitobi</span>}
      <button className="catalog-book-title" onClick={() => onOpen(book)}>{book.title}</button><p>{book.author}</p>
      <span className="catalog-pages"><Headphones size={13}/>{book.audioUrl ? (book.audioSeconds ? lengthLabel(book.audioSeconds) : "Audiokitob") : "Audio tez orada"}</span>
      {editor && <button className="text-btn catalog-edit" onClick={() => setEditing({ book })}>Tahrirlash</button>}
    </article>)}</div>
    {!catalog.loading && !filtered.length && <div className="catalog-empty"><Search size={28}/><h3>{catalog.items.length ? "Kitob topilmadi" : "Kutubxona hozircha bo‘sh"}</h3><p>{catalog.items.length ? "Boshqa nomni sinab ko‘ring." : editor ? "Birinchi kitobni qo‘shing." : "Tez orada kitoblar qo‘shiladi."}</p>{catalog.items.length ? <button onClick={() => { setQuery(""); setSavedOnly(false); }}>Filtrlarni tozalash</button> : editor && <button onClick={() => setEditing({ book: null })}>Kitob qo‘shish</button>}</div>}
    {!library && <div className="discovery-collections"><button onClick={() => onNavigate("shelf")}><Headphones size={25}/><span><strong>Audiokitoblar</strong><small>Javonimda tinglash</small></span><ArrowUpRight size={20}/></button><button onClick={() => onNavigate("talks")}><BookOpen size={25}/><span><strong>O‘qiganlaringiz haqida suhbat</strong><small>Jonli davra va suhbatlar</small></span><ArrowUpRight size={20}/></button></div>}
    <BookEditor open={Boolean(editing)} book={editing?.book ?? null} onClose={() => setEditing(null)} />
  </div>;
}
