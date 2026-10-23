"use client";

import type { ReactNode } from "react";

export type FeedOption = { value: string; label: string; icon?: ReactNode; badge?: number };

/** Lenta filtri: kichik tugmalar bitta qatorda. Sig'masa qator yon tomonga suriladi. */
export default function FeedFilter({ value, options, onChange }: { value: string; options: FeedOption[]; onChange: (value: string) => void }) {
  return (
    <div className="feed-chips" role="group" aria-label="Lenta filtri">
      {options.map((o) => (
        <button key={o.value} type="button" className="feed-chip" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.icon}
          <span>{o.label}</span>
          {o.badge ? <b>{o.badge}</b> : null}
        </button>
      ))}
    </div>
  );
}
