"use client";

import { useState } from "react";
import { BookOpen, Heart, Package, ShoppingCart, Store } from "lucide-react";
import BookDiscovery from "./book-discovery";
import { books, type Book } from "./app-data";

const sections = [
  ["catalog", "Katalog", Store],
  ["wishlist", "Sevimlilar", Heart],
] as const;
const sectionsRight = [
  ["cart", "Savat", ShoppingCart],
  ["orders", "Buyurtmalar", Package],
] as const;

type StoreSection = (typeof sections)[number][0] | (typeof sectionsRight)[number][0];

export default function BookStore({ shelf, onBack, onOpen, onToggle }: {
  shelf: string[]; onBack: () => void; onOpen: (book: Book) => void; onToggle: (book: Book) => void;
}) {
  const [section, setSection] = useState<StoreSection>("catalog");
  const saved = books.filter(book => shelf.includes(book.id));
  const tab = ([id, label, Icon]: readonly [StoreSection, string, typeof Store]) => (
    <button key={id} type="button" aria-current={section === id ? "page" : undefined} onClick={() => { setSection(id); window.scrollTo({ top: 0 }); }}>
      <Icon size={22} strokeWidth={1.8} /><span>{label}</span>
    </button>
  );

  return <>
    <nav className="store-nav" aria-label="Book Store bo'limlari">
      {sections.map(tab)}
      <button type="button" className="store-home" onClick={onBack} aria-label="Bir Ilm bosh sahifasiga qaytish">
        <BookOpen size={22} strokeWidth={1.8} /><span>Bir Ilm</span>
      </button>
      {sectionsRight.map(tab)}
    </nav>
    <div className="workspace">
      <div className="page-heading"><div><p className="eyebrow">BOOK STORE</p><h1>{{ catalog: "Kitob do‘koni", wishlist: "Sevimlilar", cart: "Savat", orders: "Buyurtmalar" }[section]}</h1></div></div>
      {section === "catalog" && <BookDiscovery library shelf={shelf} page={0} total={1} streak={0} onNavigate={() => {}} onProgress={() => {}} onOpen={onOpen} onToggle={onToggle} />}
      {section === "wishlist" && (saved.length
        ? <div className="discovery"><div className="discovery-books">{saved.map(book => <article className="discovery-book" key={book.id}>
            <button className="discovery-cover" style={{ backgroundColor: book.color }} onClick={() => onOpen(book)} aria-label={`${book.title} haqida`}><strong>{book.title}</strong><span className="cover-author">{book.author}</span></button>
            <button className="catalog-book-title" onClick={() => onOpen(book)}>{book.title}</button><p>{book.author}</p>
          </article>)}</div></div>
        : <div className="store-empty"><Heart size={28} /><h3>Sevimlilar bo‘sh</h3><p>Katalogdagi kitoblarni javonga qo‘shing.</p></div>)}
      {section === "cart" && <div className="store-empty"><ShoppingCart size={28} /><h3>Savat bo‘sh</h3><p>Do‘kon rejasi qo‘shilgach savat ishga tushadi.</p></div>}
      {section === "orders" && <div className="store-empty"><Package size={28} /><h3>Buyurtmalar yo‘q</h3><p>Do‘kon rejasi qo‘shilgach buyurtmalar shu yerda ko‘rinadi.</p></div>}
    </div>
  </>;
}
