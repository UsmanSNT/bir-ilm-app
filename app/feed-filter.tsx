"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, ListFilter } from "lucide-react";

export type FeedOption = { value: string; label: string; icon?: ReactNode; badge?: number };

/** Lenta filtri: tablar qatori o'rniga ixcham tugma — bosilganda variantlar ro'yxati ochiladi. */
export default function FeedFilter({ value, options, onChange }: { value: string; options: FeedOption[]; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const current = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onDown = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("pointerdown", onDown); };
  }, [open]);

  return (
    <div className="feed-filter" ref={root}>
      <button type="button" className={`feed-filter-btn${value !== options[0]?.value ? " is-on" : ""}`} onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls={menuId} aria-haspopup="true">
        <ListFilter size={16} aria-hidden="true" />
        <span>{current?.label}</span>
        <ChevronDown size={15} aria-hidden="true" className="feed-filter-chevron" />
      </button>
      {open && (
        <ul id={menuId} className="feed-filter-menu">
          {options.map((o) => (
            <li key={o.value}>
              <button type="button" aria-pressed={o.value === value} onClick={() => { onChange(o.value); setOpen(false); }}>
                {o.icon}
                <span>{o.label}</span>
                {o.badge ? <b>{o.badge}</b> : null}
                {o.value === value && <Check size={16} aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
