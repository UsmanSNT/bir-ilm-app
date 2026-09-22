"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, BookOpen, Bookmark, Check, Flame, Headphones, Search, Sparkles, X } from "lucide-react";
import { books, type Book } from "./app-data";

const genres: Record<string, string> = {
  "atomic-habits": "Shaxsiy rivojlanish", alchemist: "Badiiy adabiyot",
  "otkan-kunlar": "O‘zbek adabiyoti", "dunyoning-ishlari": "Shaxsiy rivojlanish",
  "kecha-va-kunduz": "O‘zbek adabiyoti", "mehrobdan-chayon": "O‘zbek adabiyoti",
  "1984": "Badiiy adabiyot",
  ikigai: "Shaxsiy rivojlanish", "deep-work": "Shaxsiy rivojlanish",
  "money-psychology": "Biznes va moliya", metamorphosis: "Badiiy adabiyot",
  "start-with-why": "Biznes va moliya",
};
const categories = ["Barchasi", "Badiiy adabiyot", "O‘zbek adabiyoti", "Shaxsiy rivojlanish", "Biznes va moliya"];

export default function BookDiscovery({ shelf, onOpen, onToggle, onNavigate, page, total, streak, library = false, onProgress }: {
  shelf: string[]; onOpen: (book: Book) => void; onToggle: (book: Book) => void;
  onNavigate: (tab: string) => void; page: number; total: number; streak: number;
  library?: boolean; onProgress: () => void;
}) {
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("Barchasi");
  const [savedOnly, setSavedOnly] = useState(false);
  const [sort, setSort] = useState("recommended");
  const filtered = useMemo(() => books.filter(book =>
    (!savedOnly || shelf.includes(book.id)) &&
    (genre === "Barchasi" || genres[book.id] === genre) &&
    `${book.title} ${book.author}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  ).sort((a, b) => sort === "short" ? a.pages - b.pages : sort === "title" ? a.title.localeCompare(b.title) : 0), [query, genre, savedOnly, shelf, sort]);

  return <div className="discovery">
    {!library && <div className="discovery-intro">
      <section className="discovery-feature">
        <span className="discovery-kicker"><Sparkles size={16}/> HAFTA KITOBI</span>
        <h2>Kichik odatlar.<br/><em>Katta o‘zgarishlar.</em></h2>
        <p>James Clear bilan har kuni bir qadam oldinga. Bu hafta «Atom odatlar»ni birga mutolaa qilamiz.</p>
        <button onClick={() => onOpen(books[0])}>Kitob bilan tanishish <ArrowUpRight size={19}/></button>
      </section>
      <section className="discovery-progress">
        <span className="discovery-kicker"><Flame size={17}/> MENING MUTOLAAM</span>
        <div className="reading-number">{page}<span> / {total} sahifa</span></div>
        <p>Atom odatlar · haftalik mutolaa</p>
        <progress value={page} max={total} aria-label="Haftalik mutolaa"/>
        <div className="reading-meta"><span>{Math.round(page / total * 100)}% o‘qildi</span><span>{streak} kun ketma-ket</span></div>
        <button onClick={onProgress}>Natijamni yangilash <ArrowUpRight size={18}/></button>
      </section>
    </div>}

    <div className="discovery-title"><div><span className="discovery-kicker">SIZNING KEYINGI KITOBINGIZ</span><h2>{library ? "Kitoblar kutubxonasi" : "Mutolaa olamini kashf eting"}</h2></div><span className="catalog-count">{books.length} kitob</span></div>
    <div className="discovery-controls">
      <label className="discovery-search"><Search size={20}/><input aria-label="Kitob yoki muallifni izlash" placeholder="Kitob yoki muallifni izlang..." value={query} onChange={e => setQuery(e.target.value)}/>{query && <button aria-label="Qidiruvni tozalash" onClick={() => setQuery("")}><X size={17}/></button>}</label>
      <button className={`shelf-filter ${savedOnly ? "is-active" : ""}`} aria-pressed={savedOnly} onClick={() => setSavedOnly(!savedOnly)}><Bookmark size={18}/>Javonim <span>{shelf.length}</span></button>
      <select aria-label="Kitoblarni saralash" value={sort} onChange={e => setSort(e.target.value)}><option value="recommended">Tavsiya etilgan</option><option value="short">Avval qisqa kitoblar</option><option value="title">Nom bo‘yicha</option></select>
    </div>
    <div className="genre-chips" aria-label="Janrlar">{categories.map((category, index) => <button key={category} className={`genre-${index}`} aria-pressed={genre === category} onClick={() => setGenre(category)}>{category}</button>)}</div>
    <div className="catalog-results" aria-live="polite">{filtered.length} ta kitob{savedOnly ? " · mening javonimda" : ""}</div>
    <div className="discovery-books">{filtered.map((book, index) => <article className="discovery-book" key={book.id}>
      <button className={`discovery-cover cover-style-${books.indexOf(book) % 3}`} style={{ backgroundColor: book.color }} onClick={() => onOpen(book)} aria-label={`${book.title} haqida`}>
        <span className="cover-edition">BIR ILM / {String(books.indexOf(book) + 1).padStart(2, "0")}</span><strong>{book.title}</strong><span className="cover-author">{book.author}</span><BookOpen className="cover-symbol" size={30} strokeWidth={1}/>
      </button>
      <button className="catalog-save" aria-label={`${book.title}: ${shelf.includes(book.id) ? "javondan olish" : "javonga qo‘shish"}`} aria-pressed={shelf.includes(book.id)} onClick={() => onToggle(book)}>{shelf.includes(book.id) ? <Check size={17}/> : <Bookmark size={17}/>}</button>
      <span className="catalog-genre">{genres[book.id]}</span><button className="catalog-book-title" onClick={() => onOpen(book)}>{book.title}</button><p>{book.author}</p><span className="catalog-pages"><BookOpen size={13}/>{book.pages} sahifa{index === 0 && sort === "short" ? " · qisqa mutolaa" : ""}</span>
    </article>)}</div>
    {!filtered.length && <div className="catalog-empty"><Search size={28}/><h3>Kitob topilmadi</h3><p>Boshqa nom yoki janrni sinab ko‘ring.</p><button onClick={() => { setQuery(""); setGenre("Barchasi"); setSavedOnly(false); }}>Filtrlarni tozalash</button></div>}
    <p className="catalog-disclaimer">Kitoblar haqida ma’lumot va shaxsiy javon. To‘liq matn hamda audiokitoblar hozircha mavjud emas.</p>
    {!library && <div className="discovery-collections"><button onClick={() => { setGenre("Badiiy adabiyot"); setSavedOnly(false); setQuery(""); }}><BookOpen size={25}/><span><strong>Bir kitob, ming olam</strong><small>Badiiy adabiyot bilan tanishing</small></span><ArrowUpRight size={20}/></button><button onClick={() => onNavigate("talks")}><Headphones size={25}/><span><strong>O‘qiganlaringiz haqida suhbat</strong><small>Jonli davra va suhbat yozuvlari</small></span><ArrowUpRight size={20}/></button></div>}
  </div>;
}
