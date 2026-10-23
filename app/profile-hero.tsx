"use client";

/**
 * Shaxsiy sahifa tepasi: muqova (yoki koshin naqsh), avatar va rol belgisi, ism va tahallus,
 * «o'zim haqimda» (havolalar bosiladi), kasb va a'zolik yili, obunalar hamda to'rtta ko'rsatkich kartasi.
 */
import { type ReactNode } from "react";
import { Briefcase, CalendarDays, ChevronRight, Crown, Gem, Headphones, Menu, Share2, ShieldCheck, TrendingDown, TrendingUp, Trophy, Timer, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import type { Viewer } from "@/shared/contract";
import { USER_ROLE_LABELS } from "@/shared/contract/roles";
import { absoluteUrl } from "@/lib/api/config";
import { dayKey, useLibrarySave } from "./library-store";

export type ProfileHeroProps = {
  viewer: Viewer;
  /** null — hali yuklanmagan. */
  followers: number | null;
  following: number | null;
  posts: number | null;
  points: number;
  rank: number;
  onEdit: () => void;
  onMenu: () => void;
  onFollows: () => void;
  onPosts: () => void;
  onRank: () => void;
};

/** 86842 → «86 842». */
export const grouped = (value: number) => String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const shown = (value: number | null) => (value === null ? "—" : grouped(value));

const URL_IN_TEXT = /(https?:\/\/[^\s<>"']+)/g;

/** Matndagi http(s) havolalar bosiladigan bo'ladi; qolgani oddiy matn (HTML sifatida talqin qilinmaydi). */
function linkify(text: string): ReactNode[] {
  return text.split(URL_IN_TEXT).map((part, index) => {
    if (index % 2 === 0) return part;
    const trailing = part.match(/[.,!?;:)\]]+$/)?.[0] ?? "";
    const href = trailing ? part.slice(0, -trailing.length) : part;
    try {
      const url = new URL(href);
      if (url.protocol !== "https:" && url.protocol !== "http:") return part;
    } catch {
      return part;
    }
    return (
      <span key={index}>
        <a href={href} target="_blank" rel="noopener noreferrer nofollow">{href.replace(/^https?:\/\//, "").replace(/\/$/, "")}</a>
        {trailing}
      </span>
    );
  });
}

/** Shu qurilmada tinglangan daqiqalar: jami, oxirgi 7 kun va undan oldingi 7 kun (o'sish foizi uchun). */
function useListening() {
  const save = useLibrarySave();
  const total = Object.values(save.listenedBooks).reduce((sum, seconds) => sum + seconds, 0) / 60;
  const week = (from: number) => {
    let seconds = 0;
    for (let i = from; i < from + 7; i += 1) {
      const day = new Date();
      day.setDate(day.getDate() - i);
      seconds += save.listenedDays[dayKey(day)] ?? 0;
    }
    return seconds / 60;
  };
  const current = week(0);
  const previous = week(7);
  const trend = previous >= 1 ? Math.round(((current - previous) / previous) * 100) : null;
  return { total, current, trend };
}

// ── Umumiy qismlar (Bir Ilm profili va do'kon hisobi bir xil ko'rinishda) ──

/** Muqova (rasm yoki koshin naqsh), menyu tugmasi (`onMenu` bo'lsa), avatar va rol belgisi hamda o'ng tomondagi tugmalar. */
export function HeroTop({ viewer, tone = "lojuvard", onMenu, actions }: { viewer: Viewer; tone?: "lojuvard" | "firuza"; onMenu?: () => void; actions: ReactNode }) {
  const cover = absoluteUrl(viewer.coverUrl);
  const avatar = absoluteUrl(viewer.avatarUrl);
  const role = viewer.role;
  return (
    <>
      <div className={`pv-cover is-${tone}${cover ? " has-image" : ""}`} style={cover ? { backgroundImage: `url("${cover}")` } : undefined}>
        {onMenu && (
          <button type="button" className="pv-cover-btn" onClick={onMenu} aria-label="Menyu va sozlamalar" title="Menyu">
            <Menu size={21} />
          </button>
        )}
      </div>
      <div className="pv-head">
        <div className="pv-avatar">
          {avatar ? <img src={avatar} alt="" referrerPolicy="no-referrer" /> : (viewer.name.trim().slice(0, 1).toUpperCase() || "K")}
          {role !== "user" && (
            <span className={`pv-role is-${role}`} title={USER_ROLE_LABELS[role]} aria-label={USER_ROLE_LABELS[role]}>
              {role === "admin" ? <Crown size={15} /> : <ShieldCheck size={15} />}
            </span>
          )}
        </div>
        <div className="pv-actions">{actions}</div>
      </div>
    </>
  );
}

export type StatTone = "tilla" | "firuza" | "anor" | "lojuvard";
export type StatItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  tone: StatTone;
  value: string;
  unit?: string;
  /** Sarlavha yonidagi qo'shimcha (masalan, o'sish foizi). */
  extra?: ReactNode;
  onClick?: () => void;
};

/** Ko'rsatkich kartalari (2 yoki 3 ustun); bosiladiganlarida o'ng tomonda «›». */
export function StatGrid({ items, columns = 2 }: { items: StatItem[]; columns?: 2 | 3 }) {
  return (
    <div className={`pv-stats${columns === 3 ? " is-three" : ""}`}>
      {items.map((item) => {
        const Icon = item.icon;
        const body = (
          <>
            <small>{item.label}{item.extra}</small>
            <span><i className={`pv-stat-icon is-${item.tone}`}><Icon size={17} /></i><b>{item.value}</b>{item.unit && <em>{item.unit}</em>}</span>
            {item.onClick && <ChevronRight className="pv-stat-go" size={18} aria-hidden="true" />}
          </>
        );
        return item.onClick
          ? <button key={item.key} type="button" className="pv-stat" onClick={item.onClick}>{body}</button>
          : <div key={item.key} className="pv-stat">{body}</div>;
      })}
    </div>
  );
}

export default function ProfileHero(p: ProfileHeroProps) {
  const { viewer } = p;
  const listening = useListening();
  const joinedYear = viewer.joinedAt ? new Date(viewer.joinedAt).getFullYear() : null;
  const role = viewer.role;

  async function share() {
    const text = viewer.username ? `Bir Ilm’da meni kuzating: @${viewer.username}` : `${viewer.name} — Bir Ilm kitobxoni`;
    const url = window.location.origin;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Bir Ilm", text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text}\n${url}`);
      toast.success("Nusxalandi — xohlagan joyingizga yuboring.");
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) toast.error("Ulashib bo‘lmadi.");
    }
  }

  return (
    <header className="pv">
      <HeroTop
        viewer={viewer}
        onMenu={p.onMenu}
        actions={<>
          <button type="button" className="pv-edit" onClick={p.onEdit}>Profilni tahrirlash</button>
          <button type="button" className="pv-share" onClick={() => void share()} aria-label="Profilni ulashish" title="Ulashish">
            <Share2 size={19} />
          </button>
        </>}
      />

      <div className="pv-identity">
        <h2>{viewer.name || "Kitobxon"}</h2>
        <p className="pv-handle">
          {viewer.username ? <span>@{viewer.username}</span> : <button type="button" onClick={p.onEdit}>+ tahallus qo‘shish</button>}
          {role !== "user" && <b className={`pv-role-chip is-${role}`}>{USER_ROLE_LABELS[role]}</b>}
        </p>
        {viewer.bio ? <p className="pv-bio">{linkify(viewer.bio)}</p> : <button type="button" className="pv-bio-empty" onClick={p.onEdit}>O‘zingiz haqingizda qisqacha yozing</button>}
        {(viewer.profession || joinedYear) && (
          <ul className="pv-meta">
            {viewer.profession && <li><Briefcase size={17} />{viewer.profession}</li>}
            {joinedYear && <li><CalendarDays size={17} />{joinedYear}-yildan beri a’zo</li>}
          </ul>
        )}
        <p className="pv-follow">
          <button type="button" onClick={p.onFollows}><b>{shown(p.followers)}</b> obunachi</button>
          <i aria-hidden="true" />
          <button type="button" onClick={p.onFollows}><b>{shown(p.following)}</b> obuna</button>
          <i aria-hidden="true" />
          <button type="button" onClick={p.onPosts}><b>{shown(p.posts)}</b> post</button>
        </p>
      </div>

      <StatGrid
        items={[
          { key: "points", label: "Ball", icon: Gem, tone: "tilla", value: grouped(p.points) },
          { key: "listened", label: "Umumiy tinglash", icon: Headphones, tone: "firuza", value: grouped(listening.total), unit: "daq" },
          { key: "rank", label: "Reyting", icon: Trophy, tone: "anor", value: `#${p.rank}`, onClick: p.onRank },
          {
            key: "week",
            label: "Oxirgi 7 kun",
            icon: Timer,
            tone: "lojuvard",
            value: grouped(listening.current),
            unit: "daq",
            extra: listening.trend !== null && (
              <span className={`pv-trend${listening.trend < 0 ? " is-down" : ""}`}>
                {listening.trend < 0 ? <TrendingDown size={14} /> : <TrendingUp size={14} />}{Math.abs(listening.trend)}%
              </span>
            ),
          },
        ]}
      />
    </header>
  );
}
