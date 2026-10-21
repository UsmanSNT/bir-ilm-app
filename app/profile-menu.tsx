"use client";

/**
 * Menyu (shaxsiy sahifadagi barcha sozlamalar): guruhlangan kartalar, rangli belgilar va qidiruv.
 * Qidiruv guruh va band nomi bo'yicha; o'zbekcha tutuq belgilari (o‘, g‘, ’) farqlanmaydi.
 */
import { useMemo, useState, type ComponentType, type ReactNode } from "react";
import { ChevronRight, Search, X } from "lucide-react";

export type MenuTone = "firuza" | "tilla" | "anor" | "lojuvard" | "yashil" | "binafsha" | "pushti" | "kulrang";

export type MenuItem = {
  id: string;
  title: string;
  /** Lucide belgisi yoki o‘z belgi (masalan, ScrollIcon) — `size` qabul qilsa bas. */
  icon: ComponentType<{ size?: number }>;
  tone: MenuTone;
  /** O'ng tomondagi qiymat (masalan, «O‘zbekcha», «Yoqilgan»). */
  value?: string;
  /** Bo'lmasa — faqat ma'lumot qatori (bosilmaydi). */
  onClick?: () => void;
  danger?: boolean;
};

export type MenuGroup = { id: string; title: string; items: MenuItem[] };

const fold = (text: string) => text.toLocaleLowerCase("uz").replace(/[‘’'`ʻʼ]/g, "'").trim();

export default function ProfileMenu({ groups, footer, search = true }: { groups: MenuGroup[]; footer?: ReactNode; search?: boolean }) {
  const [query, setQuery] = useState("");
  const needle = fold(query);
  const visible = useMemo(
    () => groups
      .map((group) => (!needle || fold(group.title).includes(needle) ? group : { ...group, items: group.items.filter((item) => fold(item.title).includes(needle)) }))
      .filter((group) => group.items.length > 0),
    [groups, needle],
  );

  return (
    <div className="pm">
      {search && <label className="pm-search">
        <Search size={19} aria-hidden="true" />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Qidirish" aria-label="Menyudan qidirish" />
        {query && <button type="button" onClick={() => setQuery("")} aria-label="Qidiruvni tozalash"><X size={17} /></button>}
      </label>}

      {visible.map((group) => (
        <section className="pm-group" key={group.id} aria-labelledby={`pm-${group.id}`}>
          <h2 id={`pm-${group.id}`}>{group.title}</h2>
          <ul>
            {group.items.map((item) => {
              const Icon = item.icon;
              const body = (
                <>
                  <span className={`pm-icon is-${item.tone}`} aria-hidden="true"><Icon size={19} /></span>
                  <span className="pm-title">{item.title}</span>
                  {item.value && <small>{item.value}</small>}
                  {item.onClick && <ChevronRight className="pm-go" size={18} aria-hidden="true" />}
                </>
              );
              return (
                <li key={item.id}>
                  {item.onClick
                    ? <button type="button" className={`pm-row${item.danger ? " is-danger" : ""}`} onClick={item.onClick}>{body}</button>
                    : <div className="pm-row is-static">{body}</div>}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {!visible.length && <p className="pm-empty">«{query.trim()}» bo‘yicha hech narsa topilmadi.</p>}
      {!needle && footer}
    </div>
  );
}
