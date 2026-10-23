"use client";

/**
 * Viktorina oynalari — "Naqsh" uslubida: peshtoq (lojuvard koshin), tilla hoshiya, sakkiz qirrali yulduz,
 * ravoq tokcha va koshin chizig'i. Bu fayldagi komponentlar faqat ko'rinish: holat va amallar
 * `mobile-screens.tsx` da qoladi, bu yerga tayyor qiymatlar va callback'lar uzatiladi.
 */
import { useRef, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { OTPInput, REGEXP_ONLY_DIGITS } from "input-otp";
import {
  ArrowRight,
  CalendarClock,
  ChevronLeft,
  Clock,
  Flame,
  KeyRound,
  ListChecks,
  Pencil,
  Play,
  Plus,
  Radio,
  Shuffle,
  Star,
  Trophy,
  UserRound,
  Users,
  Zap,
} from "lucide-react";
import { QUIZ_SESSION_OPENS_BEFORE_MIN } from "@/shared/contract";

export type QuizMode = "live" | "solo";

const CODE_LENGTH = 6;
/** Sakkiz qirrali yulduz medalyoni (rub el-hizb): tashqi qatlam tilla, ichkisi lojuvard. */
export function StarMedal({ children, size = "md" }: { children: ReactNode; size?: "sm" | "md" }) {
  return (
    <span className={`qz-medal qz-medal-${size}`} aria-hidden="true">
      <span>
        <span>{children}</span>
      </span>
    </span>
  );
}

/** Bosh sahifadagi «Viktorinalar» kartasi. `count` — yuklanayotganda null. */
export function QuizEntry({
  count,
  live,
  onOpen,
}: {
  count: number | null;
  live: { open: boolean; when: string } | null;
  onOpen: () => void;
}) {
  return (
    <button type="button" className="qz-entry" onClick={onOpen}>
      <StarMedal>
        <Trophy size={24} />
      </StarMedal>
      <span className="qz-entry-copy">
        <span className="qz-eyebrow">Bilim bellashuvi</span>
        <strong>Viktorinalar</strong>
        <small>{count ? `${count} ta viktorina · ` : ""}Bilimingizni sinang</small>
        {live && (
          <span className={`qz-entry-live${live.open ? " is-open" : ""}`}>
            <i aria-hidden="true" />
            {live.open ? "Jonli: kirish ochiq" : `Jonli: ${live.when}`}
          </span>
        )}
      </span>
      <span className="qz-entry-go" aria-hidden="true">
        <ArrowRight size={20} />
      </span>
    </button>
  );
}

const MODES: { id: QuizMode; label: string; icon: ReactNode }[] = [
  { id: "live", label: "Jonli", icon: <Radio size={17} /> },
  { id: "solo", label: "Mustaqil", icon: <UserRound size={17} /> },
];

/** Viktorinalar sahifasi boshi: peshtoq foni, qisqa statistika va rejim tablari (panel id: `qz-panel`). */
export function QuizHero({
  mode,
  onMode,
  onBack,
  stats,
}: {
  mode: QuizMode;
  onMode: (mode: QuizMode) => void;
  onBack: () => void;
  stats: { count: number; solved: number; best: number | null };
}) {
  const tabs = useRef<Partial<Record<QuizMode, HTMLButtonElement | null>>>({});

  // Tablar uchun klaviatura: chap/o'ng o'q, Home/End (WAI-ARIA tabs namunasi).
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = MODES.findIndex((item) => item.id === mode);
    const next =
      event.key === "ArrowRight" ? MODES[(index + 1) % MODES.length]
      : event.key === "ArrowLeft" ? MODES[(index - 1 + MODES.length) % MODES.length]
      : event.key === "Home" ? MODES[0]
      : event.key === "End" ? MODES[MODES.length - 1]
      : null;
    if (!next) return;
    event.preventDefault();
    onMode(next.id);
    tabs.current[next.id]?.focus();
  }

  return (
    <section className="qz-hero" aria-labelledby="qz-hero-title">
      <div className="qz-hero-top">
        <button type="button" className="qz-round" aria-label="Orqaga" onClick={onBack}>
          <ChevronLeft size={22} />
        </button>
        <span className="qz-eyebrow">Bilim bellashuvi</span>
      </div>
      <h1 id="qz-hero-title">Viktorinalar</h1>
      <p className="qz-hero-sub">Kitoblar bo‘yicha savollar — jonli bellashuvda yoki o‘z tezligingizda.</p>
      <dl className="qz-stats">
        <div>
          <dt>Viktorina</dt>
          <dd>{stats.count}</dd>
        </div>
        <div>
          <dt>Yechilgan</dt>
          <dd>{stats.solved}</dd>
        </div>
        <div>
          <dt>Eng yaxshi</dt>
          <dd>{stats.best ?? "—"}</dd>
        </div>
      </dl>
      <div className="qz-tabs" role="tablist" aria-label="Viktorina turlari" onKeyDown={onKeyDown}>
        {MODES.map((item) => (
          <button
            key={item.id}
            ref={(node) => { tabs.current[item.id] = node; }}
            id={`qz-tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={mode === item.id}
            aria-controls="qz-panel"
            tabIndex={mode === item.id ? 0 : -1}
            onClick={() => onMode(item.id)}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>
    </section>
  );
}

/** Eng yaqin jonli viktorina: holat belgisi, vaqt, ishtirokchilar va qo'shilish tugmasi. */
export function QuizLiveCard({
  cover,
  title,
  author,
  when,
  participants,
  open,
  countdown,
  code,
  staff,
  onJoin,
}: {
  cover: ReactNode;
  title: string;
  author: string;
  when: string;
  participants: number;
  open: boolean;
  countdown: string;
  /** Xona kodi — faqat admin/moderatorga keladi. */
  code: string | null;
  /** Admin/moderator: xonaga boshlovchi sifatida kiradi. */
  staff: boolean;
  onJoin: () => void;
}) {
  return (
    <article className={`qz-live naqsh-card${open ? " is-open" : ""}`} aria-labelledby="qz-live-title">
      <div className="qz-live-head">
        <span className={`qz-badge${open ? " is-live" : ""}`}>
          {open && <i aria-hidden="true" />}
          {open ? "Jonli" : "Kutilmoqda"}
        </span>
        <span className="qz-live-left">{open ? "Kirish ochiq" : countdown}</span>
      </div>
      <div className="qz-live-body">
        {cover}
        <div>
          <h2 id="qz-live-title">{title}</h2>
          <p className="qz-author">{author || "Viktorina"}</p>
          <p className="qz-meta">
            <span><Clock size={14} /> {when}</span>
            <span><Users size={14} /> {participants} ishtirokchi</span>
          </p>
        </div>
      </div>
      {code && (
        <p className="qz-room-code">
          <KeyRound size={15} /> Xona kodi
          <code aria-hidden="true">{code}</code>
          <span className="sr-only">{code.split("").join(" ")}</span>
        </p>
      )}
      <button className="qz-gold" type="button" disabled={!open} onClick={onJoin}>
        {open ? <>{staff ? "Boshlovchi sifatida kirish" : "Qo‘shilish"} <ArrowRight size={18} /></> : <><CalendarClock size={18} /> Kirish {QUIZ_SESSION_OPENS_BEFORE_MIN} daqiqa oldin ochiladi</>}
      </button>
    </article>
  );
}

/** Bo'sh holat: medalyon, sarlavha va izoh. */
export function QuizEmpty({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="qz-empty">
      <StarMedal size="sm">{icon}</StarMedal>
      <p>
        <strong>{title}</strong>
        <span>{text}</span>
      </p>
    </div>
  );
}

/** Xona kodi: 6 ta katak (yopishtirilgan matndan faqat raqamlar olinadi). */
export function QuizCodeForm({
  code,
  busy,
  onCode,
  onSubmit,
}: {
  code: string;
  busy: boolean;
  onCode: (code: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <form className="qz-code" onSubmit={onSubmit}>
      <div className="qz-code-head">
        <StarMedal size="sm">
          <KeyRound size={17} />
        </StarMedal>
        <div>
          <label htmlFor="room-code">Xona kodi bilan qo‘shilish</label>
          <p id="room-code-hint">Boshlovchi bergan {CODE_LENGTH} xonali kodni kiriting</p>
        </div>
      </div>
      <div className="qz-code-row">
        <OTPInput
          id="room-code"
          maxLength={CODE_LENGTH}
          value={code}
          onChange={onCode}
          pattern={REGEXP_ONLY_DIGITS}
          pasteTransformer={(pasted) => pasted.replace(/\D/g, "").slice(0, CODE_LENGTH)}
          inputMode="numeric"
          autoComplete="off"
          aria-describedby="room-code-hint"
          pushPasswordManagerStrategy="none"
          containerClassName="qz-code-slots"
          render={({ slots }) =>
            slots.map((slot, index) => (
              <span key={index} className="qz-slot-cell">
                {index === CODE_LENGTH / 2 && <span className="qz-slot-sep" aria-hidden="true" />}
                <span className={`qz-slot${slot.isActive ? " is-active" : ""}${slot.char ? " is-filled" : ""}`}>
                  {slot.char ?? (slot.hasFakeCaret ? <span className="qz-caret" /> : <span className="qz-slot-dot" />)}
                </span>
              </span>
            ))
          }
        />
        <button type="submit" className="qz-code-go" aria-label="Xonaga qo‘shilish" disabled={busy}>
          <ArrowRight size={20} />
        </button>
      </div>
    </form>
  );
}

/** Admin/moderator uchun «Viktorina qo'shish». */
export function QuizAddButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="qz-add" type="button" onClick={onClick}>
      <span className="qz-add-icon" aria-hidden="true"><Plus size={14} /></span>
      Viktorina qo‘shish
    </button>
  );
}

/** «O'zingizni sinang» ro'yxatidagi viktorina kartasi. */
export function QuizCard({
  cover,
  title,
  author,
  questions,
  minutes,
  best,
  onStart,
  onEdit,
}: {
  cover: ReactNode;
  title: string;
  author: string;
  questions: number;
  minutes: number;
  best: number | null;
  onStart: () => void;
  onEdit?: () => void;
}) {
  return (
    <div className={`qz-card-wrap${onEdit ? " has-edit" : ""}`}>
      <button className="qz-card" type="button" onClick={onStart}>
        {cover}
        <span className="qz-card-body">
          <strong>{title}</strong>
          {author && <em>{author}</em>}
          <span className="qz-chips">
            <span><ListChecks size={13} /> {questions} savol</span>
            <span><Clock size={13} /> {minutes} daqiqa</span>
            {best != null ? (
              <span className="qz-best">
                <Star size={12} /> <span className="sr-only">Eng yaxshi natija:</span>{best}<span className="sr-only"> ball</span>
              </span>
            ) : (
              <span className="qz-new">Yangi</span>
            )}
          </span>
        </span>
        <span className="qz-card-go" aria-hidden="true"><Play size={14} /></span>
      </button>
      {onEdit && (
        <button className="qz-card-edit" type="button" aria-label={`${title} viktorinasini tahrirlash`} onClick={onEdit}>
          <Pencil size={15} />
        </button>
      )}
    </div>
  );
}

/** Yuklanish paytidagi kulrang karta. */
export function QuizCardSkeleton() {
  return (
    <div className="qz-card qz-card-skeleton" aria-hidden="true">
      <span />
      <span><i /><i /><i /></span>
    </div>
  );
}

export type QuizLeader = { id: string; name: string; score: number; me?: boolean };

/** «Haftaning bilimdonlari»: 1–3-o'rinlar tilla, kumush va bronza yulduzda. */
export function QuizLeaders({ rows }: { rows: QuizLeader[] }) {
  if (!rows.length) {
    return (
      <QuizEmpty
        icon={<Trophy size={18} />}
        title="Reyting hali bo‘sh"
        text="Viktorina yeching — natijangiz shu yerda ko‘rinadi."
      />
    );
  }
  return (
    <ol className="qz-leaders">
      {rows.map((row, index) => (
        <li key={row.id} className={row.me ? "is-me" : undefined}>
          <span className={`qz-rank qz-rank-${Math.min(index + 1, 4)}`}>{index + 1}</span>
          <span className="qz-avatar" aria-hidden="true">{row.name.slice(0, 1).toUpperCase()}</span>
          <strong>
            {row.name}
            {row.me && <small> · siz</small>}
          </strong>
          <em>
            {row.score} <small>ball</small>
          </em>
        </li>
      ))}
    </ol>
  );
}

/** Boshlash oynasi: ravoq tokchadagi muqova, savol/vaqt/rekord va qoidalar. */
export function QuizIntro({
  cover,
  title,
  author,
  questions,
  minutes,
  best,
  live,
  onStart,
}: {
  cover: ReactNode;
  title: string;
  author: string;
  questions: number;
  minutes: number;
  best: number | null;
  live: boolean;
  onStart: () => void;
}) {
  return (
    <section className="qz-stage qz-intro" aria-labelledby="qz-intro-title">
      <span className="qz-eyebrow">{live ? "Jonli viktorina" : "Mustaqil viktorina"}</span>
      <div className="qz-niche">{cover}</div>
      <h2 id="qz-intro-title">{title}</h2>
      {author && <p className="qz-stage-sub">{author}</p>}
      <ul className="qz-facts">
        <li><ListChecks size={18} /><b>{questions}</b><span>savol</span></li>
        <li><Clock size={18} /><b>~{minutes}</b><span>daqiqa</span></li>
        <li><Trophy size={18} /><b>{best ?? "—"}</b><span>eng yaxshi</span></li>
      </ul>
      <ul className="qz-rules">
        <li><Zap size={15} /> To‘g‘ri javob 500–1000 ball: qanchalik tez, shuncha ko‘p</li>
        <li><Flame size={15} /> Ketma-ket to‘g‘ri javoblar bonus beradi (+50 … +250)</li>
        <li><Shuffle size={15} /> Savollar tartibi har safar aralashadi</li>
      </ul>
      <button type="button" className="qz-gold qz-start" onClick={onStart}>
        <Play size={18} /> Boshlash
      </button>
    </section>
  );
}
