"use client";

import Image from "next/image";
import type { LucideIcon } from "lucide-react";

export type DockItem = { id: string; label: string; icon: LucideIcon; active?: boolean; badge?: number; onClick: () => void };

/**
 * Bir Ilm navigatsiyasi: mobilda pastda suzuvchi "koshin" panel, desktopda chapda vertikal ustun.
 * Markazda sakkiz qirrali yulduz (rub el-hizb) — ikki rejim (Bir Ilm / Book Store) orasidagi darvoza.
 */
export default function Dock({ mode, label, left, right, center }: {
  mode: "main" | "store"; label: string; left: DockItem[]; right: DockItem[];
  center: { label: string; ariaLabel: string; icon: LucideIcon; onClick: () => void };
}) {
  const Star = center.icon;
  const item = ({ id, label: text, icon: Icon, active, badge, onClick }: DockItem) => (
    <button key={id} type="button" className="dock-item" aria-current={active ? "page" : undefined} onClick={onClick}>
      <span className="dock-icon"><Icon size={22} strokeWidth={1.7} />{!!badge && <b className="dock-badge">{badge > 99 ? "99+" : badge}</b>}</span>
      <span className="dock-label">{text}</span>
    </button>
  );
  return <nav className="dock" data-mode={mode} aria-label={label}>
    <span className="dock-logo" aria-hidden="true"><Image src="/assets/bir-ilm-logo.jpg" alt="" width={48} height={48} /></span>
    <div className="dock-items">
      {left.map(item)}
      <button type="button" className="dock-star" onClick={center.onClick} aria-label={center.ariaLabel}>
        <span className="dock-star-shape"><span className="dock-star-inner"><Star size={24} strokeWidth={1.8} /></span></span>
        <span className="dock-label">{center.label}</span>
      </button>
      {right.map(item)}
    </div>
  </nav>;
}
