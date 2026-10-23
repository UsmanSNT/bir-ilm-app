"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, CalendarDays, Mic, ChevronDown, EyeOff, ListPlus, Globe, Leaf, LibraryBig, Pencil, Play, Radio, Sprout, TreeDeciduous, TreePine, Trees, UserPlus, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { absoluteUrl } from "@/lib/api/config";
import { useViewer } from "@/lib/api/roles-client";
import { useAbout, useJourneyBooks, useTeam } from "@/lib/api/site-client";
import { resolveAboutVideo, teamProfileUrl, videoEmbedUrl, videoThumbnail, websiteLabel, type JourneyBook, type TeamMember } from "@/shared/contract";
import {
  SESSION,
  JUBILEE_STEP,
  computeJourney,
  formatCountdown,
  formatSpan,
  splitCountdown,
  type Journey,
  type ShelfCell,
  type ShelfYear,
} from "@/shared/journey";
import AdminAbout from "./admin-about";
import { JourneyImportForm, JourneyTitleForm } from "./admin-journey";
import AdminTeam from "./admin-team";
import { Facebook, Instagram, Telegram, YouTube } from "./brand-icons";
import TeamAvatarArt from "./team-avatar";
import { StarMedal } from "./quiz-ui";
import { useNow } from "./talk-format";
import { uzDateTashkent, uzDays, uzMonths } from "./uz-date";

const groupDigits = (value: number) => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/** Hisob daqiqa aniqligida: har 30 soniyada tekshiriladi, daqiqa almashsagina qayta hisoblanadi. */
export function useJourney() {
  const { value: about, loading } = useAbout();
  const minute = Math.floor(useNow(30_000) / 60_000) * 60_000;
  const { number, date } = about.anchor;
  const journey = useMemo(() => computeJourney({ number, date }, minute), [number, date, minute]);
  return { journey, about, loading, now: minute };
}

function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const origin = from.current;
    const duration = reduce ? 0 : 900;
    const startedAt = performance.now();
    let frame = 0;
    const step = (time: number) => {
      const progress = duration ? Math.min(1, (time - startedAt) / duration) : 1;
      const current = Math.round(origin + (value - origin) * (1 - (1 - progress) ** 3));
      from.current = current;
      setShown(current);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return (
    <>
      <span aria-hidden="true">{groupDigits(shown)}</span>
      <span className="sr-only">{value}</span>
    </>
  );
}

function nextLabel(journey: Journey, now: number) {
  if (journey.live !== null) return `Hozir efirda · ${journey.live}-kitob muhokamasi`;
  return `${journey.next.n}-kitob · ${uzDateTashkent(journey.next.at, false)}, shanba · ${formatCountdown(journey.next.at - now)} qoldi`;
}

function IntroVideo({ url, loading }: { url: string; loading: boolean }) {
  const video = useMemo(() => resolveAboutVideo(url), [url]);
  const [playing, setPlaying] = useState(false);
  if (loading) return <figure className="ab-video is-portrait is-loading" aria-hidden="true" />;
  if (!video) return null;

  const portrait = video.kind === "file" || /\/(shorts|reel)\//.test(video.url);
  const poster = video.kind === "file" ? video.poster : videoThumbnail(video);
  const frame = `ab-video${portrait ? " is-portrait" : ""}`;

  if (playing) {
    return (
      <figure className={frame}>
        {video.kind === "file" ? (
          <video src={absoluteUrl(video.src)} poster={poster ? absoluteUrl(poster) : undefined} controls autoPlay playsInline aria-label="Bir Ilm tanishtiruv videosi" />
        ) : (
          <iframe src={videoEmbedUrl(video)} title="Bir Ilm tanishtiruv videosi" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
        )}
      </figure>
    );
  }
  return (
    <figure className={frame}>
      <button type="button" className="ab-video-cover" onClick={() => setPlaying(true)} aria-label="Tanishtiruv videosini ijro etish">
        {poster && <img src={absoluteUrl(poster)} alt="" loading="lazy" />}
        <span className="ab-video-play"><StarMedal><Play size={24} /></StarMedal></span>
        <span className="ab-video-label">Bir Ilm bilan tanishing</span>
      </button>
    </figure>
  );
}

const STATE_TEXT: Record<ShelfCell["state"], string> = {
  before: "",
  done: "muhokama qilingan",
  live: "hozir efirda",
  next: "keyingi muhokama",
  future: "rejada",
};

/** Har kitobga barqaror, lekin har xil balandlik — javon tabiiy ko'rinadi. */
const spineStyle = (n: number) => ({ "--h": `${64 + ((n * 37) % 37)}%` }) as CSSProperties;
const isMilestone = (n: number | null) => n !== null && (n === 1 || n % 50 === 0);

/** `.ab-shelf-books` to'ridagi ustunlar soni (about.css bilan bir xil). */
const SHELF_COLUMNS = 53;

type ShelfPick = { year: number; cell: number };

function Shelf({ shelf, titles, admin, onEdit, onImport }: {
  shelf: ShelfYear[];
  titles: ReadonlyMap<number, JourneyBook>;
  /** Faqat admin: tanlangan haftaning nomini yozish va ro'yxatni joylash. */
  admin: boolean;
  onEdit: (cell: ShelfCell) => void;
  onImport: () => void;
}) {
  // `picked` — hozir ko'rsatilayotgan hafta (sichqoncha ustidan o'tganda ham o'zgaradi); `pinned` — oxirgi bosilgan hafta:
  // sichqoncha chiqib ketsa yoki oyna ochilsa shunga qaytiladi.
  const [picked, setPicked] = useState<ShelfPick | null>(null);
  const [pinned, setPinned] = useState<ShelfPick | null>(null);
  const active = picked ? shelf[picked.year]?.cells[picked.cell] ?? null : null;

  /**
   * Chiziq ingichka (~4 px), barmoq esa keng: bosilgan joyga eng yaqin chiziq tanlanadi. Tanlov
   * qatordagi gorizontal o'rindan hisoblanadi, shuning uchun oraliqqa tegib ketish xato bermaydi.
   */
  const select = (yearIndex: number, event: PointerEvent<HTMLDivElement>, pin: boolean) => {
    const row = event.currentTarget;
    const rect = row.getBoundingClientRect();
    const style = getComputedStyle(row);
    const left = parseFloat(style.paddingLeft) || 0;
    const inner = rect.width - left - (parseFloat(style.paddingRight) || 0);
    if (inner <= 0) return;
    const cells = shelf[yearIndex]?.cells ?? [];
    const slot = Math.floor(((event.clientX - rect.left - left) / inner) * SHELF_COLUMNS);
    let cell = Math.min(Math.max(slot, 0), cells.length - 1);
    // Yil boshidagi «hali boshlanmagan» o'rinlar tanlanmaydi: birinchi haqiqiy chiziqqa o'tadi.
    while (cell < cells.length && cells[cell].n === null) cell += 1;
    if (cell >= cells.length) return;
    const keep = (current: ShelfPick | null) => (current?.year === yearIndex && current.cell === cell ? current : { year: yearIndex, cell });
    setPicked(keep);
    if (pin) setPinned(keep);
  };

  const rows = shelf.map((year, yearIndex) => (
    <div className="ab-shelf-row" key={year.year}>
      <div className="ab-shelf-label">
        <strong>{year.year}</strong>
        <span>{year.held} ta kitob{year.planned ? ` · yana ${year.planned} ta rejada` : ""}</span>
      </div>
      <div
        className="ab-shelf-books"
        role="img"
        aria-label={`${year.year}-yil: ${year.held} ta kitob muhokama qilingan${year.planned ? `, ${year.planned} ta rejada` : ""}`}
        onPointerDown={(event) => select(yearIndex, event, true)}
        // Sichqoncha — ustidan o'tganda; barmoq — bosib, gorizontal surganda. Vertikal surish sahifani aylantiradi.
        onPointerMove={(event) => { if (event.pointerType === "mouse" || event.buttons) select(yearIndex, event, event.buttons > 0); }}
      >
        {year.cells.map((cell, cellIndex) => (
          <span
            key={cell.at}
            className={`ab-spine ${cell.state}${isMilestone(cell.n) ? " milestone" : ""}${cell.n !== null ? ` tone-${cell.n % 4}` : ""}${picked?.year === yearIndex && picked.cell === cellIndex ? " is-active" : ""}`}
            style={cell.n !== null ? spineStyle(cell.n) : undefined}
          />
        ))}
      </div>
    </div>
  ));

  return (
    // Tanlov barmoq ko'tarilganda saqlanadi (aks holda telefonda nom darhol yo'qolardi); sichqoncha chiqib ketsa — oxirgi bosilgan haftaga qaytadi.
    <div className="ab-shelf" onPointerLeave={(event) => { if (event.pointerType === "mouse") setPicked(pinned); }}>
      <p className="ab-shelf-readout" aria-live="polite">
        {active && active.n !== null ? (
          <>
            <strong>#{active.n}</strong>
            {titles.get(active.n) && <> · «{titles.get(active.n)?.title}»</>} · {uzDateTashkent(active.at)} · {STATE_TEXT[active.state]}
          </>
        ) : (
          // Kitob nomlari faqat suhbat vaqti belgilangan haftalar uchun yoziladi; hali bitta ham yozilmagan bo'lsa, nom va'da qilinmaydi.
          `Har bir chiziq — bitta shanba, bitta kitob. ${titles.size > 0 ? "Kitob nomi va sanasini" : "Sanasini"} ko‘rish uchun chiziq ustiga bosing.`
        )}
      </p>
      {admin && (
        // Doim ko'rinadi (tanlov bo'lmasa o'chiq), shuning uchun qatorlar siljimaydi.
        <div className="ab-shelf-admin">
          <button type="button" disabled={!active || active.n === null} onClick={() => active && onEdit(active)}>
            <Pencil size={14} />
            {active && active.n !== null
              ? `${active.n}-kitob nomini ${titles.has(active.n) ? "o‘zgartirish" : "yozish"}`
              : "Nom yozish uchun chiziqni tanlang"}
          </button>
          <button type="button" onClick={onImport}><ListPlus size={14} /> Ro‘yxatni joylash</button>
        </div>
      )}
      {rows}
    </div>
  );
}

function localTimeLine(at: number): string | null {
  const local = new Date(at);
  const offset = local.getTimezoneOffset();
  // Toshkent (UTC+5) va Seul (UTC+9) uchun takror ko'rsatilmaydi.
  if (offset === -300 || offset === -540) return null;
  const time = `${String(local.getHours()).padStart(2, "0")}:${String(local.getMinutes()).padStart(2, "0")}`;
  return `Sizning vaqtingiz bilan: ${uzDays[local.getDay()].toLowerCase()}, soat ${time}`;
}

/** Element ekranga birinchi marta kirganda true bo'ladi (animatsiya bir marta o'ynaydi). */
function useInView<T extends Element>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || seen) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setSeen(true);
        observer.disconnect();
      }
    }, { threshold: 0.2 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [seen]);
  return [ref, seen] as const;
}

/** O'sish bosqichlari: nihol → barg → daraxt → qarag'ay → bog'. */
const STAGE_ICONS = [Sprout, Leaf, TreeDeciduous, TreePine, Trees] as const;
const markLabel = (n: number) => (n === 1 ? "Ilk kitob" : `${n}-kitob`);

/** Yillar pog'onasi: har yil oxiridagi jami kitoblar, rang va belgi yildan-yilga boyib boradi. */
function Growth({ journey }: { journey: Journey }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  const { growth, jubilee } = journey;
  const peak = Math.max(1, ...growth.map((year) => year.total + year.planned));
  const points = growth.map((year, index) => `${((index + 0.5) / growth.length) * 100},${100 - (year.total / peak) * 100}`).join(" ");
  const percent = Math.round(jubilee.progress * 100);

  return (
    <div ref={ref} className={`ab-growth${seen ? " is-visible" : ""}`}>
      <div className="ab-growth-chart">
        <svg className="ab-growth-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polyline points={points} />
        </svg>
        <ol className="ab-steps" aria-label="Yillar bo‘yicha o‘sish">
          {growth.map((year, index) => {
            const Icon = STAGE_ICONS[year.stage];
            const current = index === growth.length - 1 && year.planned > 0;
            const vars = { "--f": year.total / peak, "--g": year.planned / peak, "--i": index } as CSSProperties;
            return (
              <li key={year.year} className={`ab-step stage-${year.stage}${current ? " is-current" : ""}`} style={vars}>
                <div className="ab-step-plot">
                  <span className="ab-step-head">
                    <span className="ab-step-icon" aria-hidden="true"><Icon size={14 + year.stage * 2} /></span>
                    <strong>{year.total}</strong>
                  </span>
                  {year.planned > 0 && <span className="ab-step-ghost" aria-hidden="true" />}
                  <span className="ab-step-bar" aria-hidden="true" />
                </div>
                <span className="ab-step-year">{year.year}</span>
                <small className="ab-step-added">+{year.held} kitob</small>
                {year.planned > 0 && <small className="ab-step-planned">{year.planned} ta rejada</small>}
                {year.marks.length > 0 && <em className="ab-step-marks">{year.marks.map(markLabel).join(" · ")}</em>}
                <span className="sr-only">{`${year.year}-yil: ${year.held} ta kitob, jami ${year.total}`}</span>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="ab-jubilee">
        <div className="ab-jubilee-copy">
          <span className="ab-eyebrow">Navbatdagi marra</span>
          <strong>{jubilee.n}-kitob</strong>
          <small>{uzDateTashkent(jubilee.at)} · yana {jubilee.left} ta kitob</small>
        </div>
        <div
          className="ab-jubilee-track"
          role="progressbar"
          aria-label={`${jubilee.n}-kitobgacha`}
          aria-valuemin={0}
          aria-valuemax={JUBILEE_STEP}
          aria-valuenow={JUBILEE_STEP - jubilee.left}
        >
          <span style={{ "--p": jubilee.progress } as CSSProperties} />
        </div>
        <b>{percent}%</b>
      </div>
    </div>
  );
}

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase()).join("") || "B";

/** Ijtimoiy tarmoqlar (belgi) va shaxsiy veb-sayt (domen nomi bilan). Havolalar serverda tekshirilgan, faqat https. */
function MemberLinks({ member }: { member: TeamMember }) {
  const socials = [
    member.telegram && { key: "telegram", label: "Telegram", href: teamProfileUrl("telegram", member.telegram), Icon: Telegram },
    member.instagram && { key: "instagram", label: "Instagram", href: teamProfileUrl("instagram", member.instagram), Icon: Instagram },
    member.youtube && { key: "youtube", label: "YouTube", href: member.youtube, Icon: YouTube },
    member.facebook && { key: "facebook", label: "Facebook", href: member.facebook, Icon: Facebook },
  ].filter((item) => !!item);
  if (!socials.length && !member.website) return null;
  return (
    <div className="ab-member-links">
      {socials.map(({ key, label, href, Icon }) => (
        <a key={key} className={`is-${key}`} href={href} target="_blank" rel="noopener noreferrer" aria-label={`${member.name} — ${label}`} title={label}>
          <Icon size={17} />
        </a>
      ))}
      {member.website && (
        <a className="is-website" href={member.website} target="_blank" rel="noopener noreferrer" aria-label={`${member.name} — veb-sayt: ${websiteLabel(member.website)}`}>
          <Globe size={15} /> <span>{websiteLabel(member.website)}</span> <ArrowUpRight size={14} />
        </a>
      )}
    </div>
  );
}

function TeamCard({ member }: { member: TeamMember }) {
  const [broken, setBroken] = useState(false);
  return (
    <li className={`ab-member${member.visible ? "" : " is-hidden"}`}>
      <div className="ab-member-media">
        {!member.visible && <span className="ab-member-hidden" title="Saytda ko‘rinmaydi — faqat admin ko‘radi"><EyeOff size={13} /> Yashirin</span>}
        {member.photoUrl && !broken ? (
          <img src={absoluteUrl(member.photoUrl)} alt={member.name} loading="lazy" onError={() => setBroken(true)} />
        ) : member.avatar ? (
          <TeamAvatarArt kind={member.avatar} className="ab-member-avatar" />
        ) : (
          <span className="ab-member-initials" aria-hidden="true">{initials(member.name)}</span>
        )}
        <div className="ab-member-caption">
          <h3>{member.name}</h3>
          {member.role && <span>{member.role}</span>}
        </div>
      </div>
      {member.bio && <p className="ab-member-bio">{member.bio}</p>}
      <MemberLinks member={member} />
    </li>
  );
}

/** Sobiq a'zo: ixcham gorizontal karta (rasm/avatar, ism, lavozim va davr, qisqa ma'lumot, havolalar). */
function AlumniCard({ member }: { member: TeamMember }) {
  const [broken, setBroken] = useState(false);
  const meta = [member.role, member.period].filter(Boolean);
  return (
    <li className={`ab-alumnus${member.visible ? "" : " is-hidden"}`}>
      <span className="ab-alumnus-photo">
        {member.photoUrl && !broken ? (
          <img src={absoluteUrl(member.photoUrl)} alt={member.name} loading="lazy" onError={() => setBroken(true)} />
        ) : member.avatar ? (
          <TeamAvatarArt kind={member.avatar} />
        ) : (
          <span aria-hidden="true">{initials(member.name)}</span>
        )}
      </span>
      <div className="ab-alumnus-body">
        <h4>{member.name}{!member.visible && <span className="ab-alumnus-hidden" title="Saytda ko‘rinmaydi — faqat admin ko‘radi"><EyeOff size={12} /> Yashirin</span>}</h4>
        {meta.length > 0 && <p className="ab-alumnus-meta">{meta.join(" · ")}</p>}
        {member.bio && <p className="ab-alumnus-bio">{member.bio}</p>}
        <MemberLinks member={member} />
      </div>
    </li>
  );
}

/**
 * Jamoa kartalari. Kompyuterda — to'r, telefonda — har biri bitta katta karta, barmoq bilan suriladi
 * (CSS scroll-snap); pastdagi nuqtalar joriy kartani ko'rsatadi va bosilganda o'shanga o'tadi.
 */
function TeamCarousel({ team }: { team: TeamMember[] }) {
  const track = useRef<HTMLUListElement>(null);
  const frame = useRef(0);
  const [active, setActive] = useState(0);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const onScroll = () => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const el = track.current;
      if (!el) return;
      const cards = Array.from(el.children) as HTMLElement[];
      const start = el.scrollLeft + (cards[0]?.offsetLeft ?? 0);
      let nearest = 0;
      cards.forEach((card, index) => {
        if (Math.abs(card.offsetLeft - start) < Math.abs(cards[nearest].offsetLeft - start)) nearest = index;
      });
      setActive(nearest);
    });
  };

  const goTo = (index: number) => {
    const el = track.current;
    const cards = el ? (Array.from(el.children) as HTMLElement[]) : [];
    if (!el || !cards[index]) return;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: cards[index].offsetLeft - cards[0].offsetLeft, behavior: smooth ? "smooth" : "auto" });
  };

  return (
    <>
      <ul ref={track} className={`ab-team-grid${team.length === 1 ? " is-single" : ""}`} onScroll={onScroll} aria-label="Jamoa a‘zolari">
        {team.map((member) => <TeamCard key={member.id} member={member} />)}
      </ul>
      {team.length > 1 && (
        <div className="ab-team-dots" role="group" aria-label="Jamoa a‘zolari bo‘yicha o‘tish">
          {team.map((member, index) => (
            <button key={member.id} type="button" aria-label={`${index + 1}-a‘zo: ${member.name}`} aria-current={index === active} onClick={() => goTo(index)} />
          ))}
        </div>
      )}
    </>
  );
}

/**
 * Haftalik muhokama chiptasi: chapda sana qirqimi (hafta kuni, kun, oy), o'ngda kitob raqami,
 * ikki vaqt mintaqasi va boshlanishigacha qolgan vaqt (daqiqa aniqligida).
 */
function SessionTicket({ journey, now, onOpenTalks }: { journey: Journey; now: number; onOpenTalks: () => void }) {
  const { live, next } = journey;
  const at = live !== null ? next.at - 7 * 86_400_000 : next.at;
  const day = new Date(at + 5 * 3_600_000);
  const left = splitCountdown(next.at - now);
  const localLine = localTimeLine(at);

  return (
    <section className={`ab-ticket${live !== null ? " is-live" : ""}`} aria-labelledby="ab-ticket-title">
      <div className="ab-ticket-card">
        <div className="ab-ticket-stub">
          <span>{uzDays[day.getUTCDay()]}</span>
          <strong>{day.getUTCDate()}</strong>
          <span>{uzMonths[day.getUTCMonth()]}</span>
        </div>
        <div className="ab-ticket-body">
          <span className="ab-eyebrow">Haftalik jonli muhokama</span>
          <h3 id="ab-ticket-title">{live !== null ? `${live}-kitob muhokamasi efirda` : `${next.n}-kitob muhokamasi`}</h3>
          <p>Har shanba bir hafta davomida o‘qilgan kitobni jonli suhbatda birgalikda tahlil qilamiz.</p>
          <ul className="ab-zones" aria-label="Boshlanish vaqti">
            <li><b>UZ</b><strong>{SESSION.uzTime}</strong><span>Toshkent</span></li>
            <li><b>KR</b><strong>{SESSION.korTime}</strong><span>Seul</span></li>
          </ul>
          {localLine && <small className="ab-ticket-local">{localLine}</small>}
          <div className="ab-ticket-foot">
            {live !== null ? (
              <span className="ab-live-badge"><i aria-hidden="true" /> Hozir efirda</span>
            ) : (
              <div className="ab-timer" role="timer" aria-label={`Boshlanishiga ${formatCountdown(next.at - now)} qoldi`}>
                {([[left.days, "kun"], [left.hours, "soat"], [left.minutes, "daqiqa"]] as const).map(([value, unit]) => (
                  <span key={unit}><strong>{String(value).padStart(2, "0")}</strong><small>{unit}</small></span>
                ))}
              </div>
            )}
            <button type="button" className="ab-ticket-go" onClick={onOpenTalks}>
              <Mic size={16} /> {live !== null ? "Suhbatga qo‘shilish" : "Suhbatlar bo‘limi"} <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

/** «Biz haqimizda»: tanishtiruv, hisoblangan yo'l, haftalik jadval va jamoa. */
export default function About({ onBack, onOpenTalks }: { onBack: () => void; onOpenTalks: () => void }) {
  const { journey, about, loading, now } = useJourney();
  const isAdmin = useViewer()?.role === "admin";
  // Admin yashirin a'zolarni ham ko'radi va shu sahifadan tahrirlaydi.
  const { value: everyone } = useTeam(isAdmin);
  const team = useMemo(() => everyone.filter((member) => !member.former), [everyone]);
  const alumni = useMemo(() => everyone.filter((member) => member.former), [everyone]);
  const [editing, setEditing] = useState<"team" | "about" | "journey" | { week: number; at: number } | null>(null);
  const journeyBooks = useJourneyBooks().value;
  const titles = useMemo(() => new Map(journeyBooks.map((entry) => [entry.number, entry])), [journeyBooks]);
  const { completed, elapsed, next, live } = journey;
  const paragraphs = about.intro.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);

  return (
    <div className="ab">
      <div className="ab-toolbar">
        <button type="button" className="ab-back" onClick={onBack}><ArrowLeft size={17} /> Orqaga</button>
        {isAdmin && (
          <span className="ab-admin-tools">
            <button type="button" onClick={() => setEditing("about")}><Pencil size={15} /> Matn va video</button>
            <button type="button" onClick={() => setEditing("team")}><Pencil size={15} /> Jamoa</button>
            <button type="button" onClick={() => setEditing("journey")}><ListPlus size={15} /> O‘tgan kitoblar</button>
          </span>
        )}
      </div>

      <section className="ab-hero">
        <div className="ab-hero-copy">
          <span className="ab-eyebrow">Bir Ilm kitobxonlar jamoasi</span>
          <h2>
            Har shanba — bitta kitob.
            <em>{formatSpan(elapsed)}dan beri.</em>
          </h2>
          {paragraphs.map((text, index) => (
            <p key={index}>{text}</p>
          ))}
          <span className={`ab-next${live !== null ? " is-live" : ""}`}>
            {live !== null ? <Radio size={16} /> : <CalendarDays size={16} />}
            {nextLabel(journey, now)}
          </span>
        </div>
        <IntroVideo key={about.videoUrl} url={about.videoUrl} loading={loading} />
      </section>

      <dl className="ab-stats">
        <div>
          <dt>Muhokama qilingan kitoblar</dt>
          <dd><CountUp value={completed} /></dd>
          <small>Har shanba — bitta kitob</small>
        </div>
        <div>
          <dt>Birgalikdagi yo‘l</dt>
          <dd>
            {elapsed.years}<span className="ab-unit">yil</span> {elapsed.months}<span className="ab-unit">oy</span>
          </dd>
          <small>{groupDigits(elapsed.totalDays)} kun</small>
        </div>
        <div>
          <dt>Yiliga o‘rtacha</dt>
          <dd>{journey.perYear}</dd>
          <small>ta kitob</small>
        </div>
        <div>
          <dt>Ilk muhokama</dt>
          <dd>{new Date(journey.start).getUTCFullYear()}</dd>
          <small>{uzDateTashkent(journey.start, false)}, shanba</small>
        </div>
      </dl>

      <SessionTicket journey={journey} now={now} onOpenTalks={onOpenTalks} />

      <section className="ab-journey" aria-labelledby="ab-journey-title">
        <span className="ab-eyebrow">Bir Ilm yo‘li</span>
        <h3 id="ab-journey-title">Yildan yilga o‘sib boryapmiz</h3>
        <Growth journey={journey} />

        <details className="ab-weeks">
          <summary>
            <span>Har bir haftani ko‘rish</span>
            <small>{completed} ta muhokama · navbatdagisi {next.n}-kitob{isAdmin ? ` · nomi yozilgani: ${titles.size}` : ""}</small>
            <ChevronDown size={18} aria-hidden="true" />
          </summary>
          <ul className="ab-legend" aria-label="Belgilar">
            <li><i className="ab-spine done tone-1" />Muhokama qilingan</li>
            <li><i className="ab-spine done milestone" />Har 50-kitob</li>
            <li><i className="ab-spine next" />Keyingi</li>
            <li><i className="ab-spine future" />Rejada</li>
          </ul>
          <Shelf shelf={journey.shelf} titles={titles} admin={isAdmin} onEdit={(cell) => cell.n !== null && setEditing({ week: cell.n, at: cell.at })} onImport={() => setEditing("journey")} />
        </details>

      </section>

      {(team.length > 0 || isAdmin) && (
        <section className="ab-team" aria-labelledby="ab-team-title">
          <div className="ab-team-head">
            <div>
              <span className="ab-eyebrow">Jamoa</span>
              <h3 id="ab-team-title">Loyihani yuritayotganlar</h3>
            </div>
            {isAdmin && <button type="button" className="ab-team-edit" onClick={() => setEditing("team")}><Pencil size={15} /> Tahrirlash</button>}
          </div>
          {isAdmin && team.some((member) => !member.visible) && (
            <p className="ab-team-hint"><EyeOff size={14} /> «Yashirin» kartalarni faqat adminlar ko‘radi. Saytda ko‘rsatish uchun: «Tahrirlash» → karta → «Saytda ko‘rinsin».</p>
          )}
          {team.length > 0 ? (
            <TeamCarousel team={team} />
          ) : (
            <button type="button" className="ab-team-empty" onClick={() => setEditing("team")}>
              <UserPlus size={22} />
              <strong>Hali jamoa a’zosi qo‘shilmagan</strong>
              <span>Birinchi kartani qo‘shing — u shu yerda ko‘rinadi.</span>
            </button>
          )}
        </section>
      )}

      {(alumni.length > 0 || (isAdmin && team.length > 0)) && (
        <section className="ab-team ab-alumni" aria-labelledby="ab-alumni-title">
          <div className="ab-team-head">
            <div>
              <span className="ab-eyebrow">Hissa qo‘shganlar</span>
              <h3 id="ab-alumni-title">Avval loyihada bo‘lganlar</h3>
            </div>
            {isAdmin && <button type="button" className="ab-team-edit" onClick={() => setEditing("team")}><Pencil size={15} /> Tahrirlash</button>}
          </div>
          {alumni.length > 0 ? (
            <>
              <p className="ab-alumni-lead">Loyihani boshlagan va turli davrlarda unga hissa qo‘shgan insonlar. Ularga rahmat.</p>
              <ul className="ab-alumni-list">{alumni.map((member) => <AlumniCard key={member.id} member={member} />)}</ul>
            </>
          ) : (
            <button type="button" className="ab-team-empty" onClick={() => setEditing("team")}>
              <UserPlus size={22} />
              <strong>Sobiq a’zolar hali qo‘shilmagan</strong>
              <span>Loyihani boshlaganlar va avval jamoada bo‘lganlarni shu yerga qo‘shing.</span>
            </button>
          )}
        </section>
      )}

      {isAdmin && (
        <Dialog open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null); }}>
          <DialogContent className="ab-edit-dialog" showCloseButton={false}>
            <div className="ab-edit-head">
              <DialogTitle>{editing === "about" ? "«Biz haqimizda» matni va videosi" : editing === "journey" ? "O‘tgan kitoblar ro‘yxati" : typeof editing === "object" && editing ? `${editing.week}-kitob nomi` : "Jamoa"}</DialogTitle>
              <button type="button" className="ab-admin-icon" aria-label="Yopish" onClick={() => setEditing(null)}><X size={18} /></button>
            </div>
            <DialogDescription className="sr-only">O‘zgarishlar saqlangan zahoti sahifada ko‘rinadi.</DialogDescription>
            {editing === "about" ? <AdminAbout />
              : editing === "journey" ? <JourneyImportForm anchor={about.anchor} entries={journeyBooks} onClose={() => setEditing(null)} />
              : typeof editing === "object" && editing ? <JourneyTitleForm key={editing.week} number={editing.week} at={editing.at} entry={titles.get(editing.week) ?? null} onClose={() => setEditing(null)} />
              : <AdminTeam />}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/** Bosh sahifadagi ixcham karta: kam joy oladi, lekin «Biz haqimizda»ga olib boradi. */
export function JourneyEntry({ onOpen }: { onOpen: () => void }) {
  const { journey } = useJourney();
  const { completed, elapsed, live, next } = journey;
  return (
    <button type="button" className="ab-entry" onClick={onOpen}>
      <span className="ab-entry-icon" aria-hidden="true"><LibraryBig size={20} /></span>
      <span className="ab-entry-copy">
        <span className="ab-eyebrow">Biz haqimizda</span>
        <strong>{completed} kitob · {formatSpan(elapsed)}</strong>
        <small>{live !== null ? `Hozir efirda · ${live}-kitob` : `${next.n}-kitob · shanba, ${SESSION.uzTime} UZB`}</small>
      </span>
      <ArrowRight size={18} className="ab-entry-go" aria-hidden="true" />
    </button>
  );
}
