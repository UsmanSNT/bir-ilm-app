"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, LibraryBig, Play, Radio } from "lucide-react";
import { absoluteUrl } from "@/lib/api/config";
import { useAbout, useTeam } from "@/lib/api/site-client";
import { resolveAboutVideo, teamProfileUrl, videoEmbedUrl, videoThumbnail, type TeamMember } from "@/shared/contract";
import {
  SESSION,
  computeJourney,
  formatCountdown,
  formatSpan,
  type Journey,
  type ShelfCell,
  type ShelfYear,
} from "@/shared/journey";
import { Instagram, Telegram } from "./brand-icons";
import { StarMedal } from "./quiz-ui";
import { useNow } from "./talk-format";
import { uzDateTashkent, uzDays } from "./uz-date";

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
  done: "muhokama qilingan · kitob nomi arxivga qo'shiladi",
  live: "hozir efirda",
  next: "keyingi muhokama",
  future: "rejada",
};

/** Har kitobga barqaror, lekin har xil balandlik — javon tabiiy ko'rinadi. */
const spineStyle = (n: number) => ({ "--h": `${64 + ((n * 37) % 37)}%` }) as CSSProperties;
const isMilestone = (n: number | null) => n !== null && (n === 1 || n % 50 === 0);

function Shelf({ shelf }: { shelf: ShelfYear[] }) {
  const [active, setActive] = useState<ShelfCell | null>(null);

  const rows = useMemo(
    () =>
      shelf.map((year, yearIndex) => (
        <div className="ab-shelf-row" key={year.year}>
          <div className="ab-shelf-label">
            <strong>{year.year}</strong>
            <span>{year.held} kitob{year.planned ? ` · ${year.planned} rejada` : ""}</span>
          </div>
          <div
            className="ab-shelf-books"
            role="img"
            aria-label={`${year.year}-yil: ${year.held} ta kitob muhokama qilingan${year.planned ? `, ${year.planned} ta rejada` : ""}`}
          >
            {year.cells.map((cell, cellIndex) => (
              <span
                key={cell.at}
                data-k={`${yearIndex}:${cellIndex}`}
                className={`ab-spine ${cell.state}${isMilestone(cell.n) ? " milestone" : ""}${cell.n !== null ? ` tone-${cell.n % 4}` : ""}`}
                style={cell.n !== null ? spineStyle(cell.n) : undefined}
              />
            ))}
          </div>
        </div>
      )),
    [shelf],
  );

  const pick = (event: PointerEvent<HTMLDivElement>) => {
    const key = (event.target as HTMLElement).dataset.k;
    if (!key) return;
    const [yearIndex, cellIndex] = key.split(":").map(Number);
    const cell = shelf[yearIndex]?.cells[cellIndex];
    if (cell && cell.n !== null) setActive(cell);
  };

  return (
    <div className="ab-shelf" onPointerOver={pick} onPointerDown={pick} onPointerLeave={() => setActive(null)}>
      <p className="ab-shelf-readout" aria-live="polite">
        {active && active.n !== null ? (
          <>
            <strong>#{active.n}</strong> · {uzDateTashkent(active.at)} · {STATE_TEXT[active.state]}
          </>
        ) : (
          "Har bir chiziq — bitta shanba va bitta kitob. Ustiga olib boring yoki bosing."
        )}
      </p>
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
  return `Sizning vaqtingizda: ${uzDays[local.getDay()].toLowerCase()}, ${time}`;
}

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase()).join("") || "B";

function TeamCard({ member }: { member: TeamMember }) {
  const [broken, setBroken] = useState(false);
  return (
    <li className="ab-member">
      <div className="ab-member-photo">
        {member.photoUrl && !broken ? (
          <img src={absoluteUrl(member.photoUrl)} alt={member.name} loading="lazy" onError={() => setBroken(true)} />
        ) : (
          <span aria-hidden="true">{initials(member.name)}</span>
        )}
      </div>
      <div className="ab-member-body">
        <h3>{member.name}</h3>
        {member.role && <span className="ab-member-role">{member.role}</span>}
        {member.bio && <p>{member.bio}</p>}
        {(member.telegram || member.instagram) && (
          <div className="ab-member-links">
            {member.telegram && (
              <a className="is-telegram" href={teamProfileUrl("telegram", member.telegram)} target="_blank" rel="noopener noreferrer" aria-label={`${member.name} — Telegram`}>
                <Telegram size={16} /> Telegram
              </a>
            )}
            {member.instagram && (
              <a className="is-instagram" href={teamProfileUrl("instagram", member.instagram)} target="_blank" rel="noopener noreferrer" aria-label={`${member.name} — Instagram`}>
                <Instagram size={16} /> Instagram
              </a>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

/** «Biz haqimizda»: tanishtiruv, hisoblangan yo'l, haftalik jadval va jamoa. */
export default function About({ onBack }: { onBack: () => void }) {
  const { journey, about, loading, now } = useJourney();
  const { value: team } = useTeam();
  const { completed, elapsed, next, live } = journey;
  const paragraphs = about.intro.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const localLine = localTimeLine(next.at);

  return (
    <div className="ab">
      <button type="button" className="ab-back" onClick={onBack}><ArrowLeft size={17} /> Orqaga</button>

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
          <dt>kitob muhokama qilindi</dt>
          <dd><CountUp value={completed} /></dd>
          <small>1-kitobdan {completed}-kitobgacha</small>
        </div>
        <div>
          <dt>bosib o‘tilgan yo‘l</dt>
          <dd>
            {elapsed.years}<span className="ab-unit">yil</span> {elapsed.months}<span className="ab-unit">oy</span>
          </dd>
          <small>{groupDigits(elapsed.totalDays)} kun</small>
        </div>
        <div>
          <dt>kitob — yiliga o‘rtacha</dt>
          <dd>≈{journey.perYear}</dd>
          <small>har hafta bittadan</small>
        </div>
        <div>
          <dt>yildan beri</dt>
          <dd>{new Date(journey.start).getUTCFullYear()}</dd>
          <small>taxminan {uzDateTashkent(journey.start, false)}, shanba</small>
        </div>
      </dl>

      <section className="ab-schedule">
        <div className="ab-schedule-copy">
          <span className="ab-eyebrow">Haftalik muhokama</span>
          <h3>Har shanba</h3>
          <p>Hafta davomida o‘qilgan kitob shanba kuni jonli suhbatda birgalikda tahlil qilinadi.</p>
        </div>
        <div className="ab-clocks">
          <div><span>UZB</span><strong>{SESSION.uzTime}</strong><small>Toshkent</small></div>
          <div><span>KOR</span><strong>{SESSION.korTime}</strong><small>Seul</small></div>
        </div>
        <div className="ab-countdown">
          {live !== null ? (
            <strong className="is-live"><Radio size={18} /> Hozir efirda: {live}-kitob</strong>
          ) : (
            <>
              <span>{next.n}-kitob muhokamasigacha</span>
              <strong>{formatCountdown(next.at - now)}</strong>
            </>
          )}
          {localLine && <small>{localLine}</small>}
        </div>
      </section>

      <section className="ab-journey" aria-labelledby="ab-journey-title">
        <span className="ab-eyebrow">Bir Ilm yo‘li</span>
        <h3 id="ab-journey-title">{completed} kitob · {formatSpan(elapsed)}</h3>
        <ul className="ab-legend" aria-label="Belgilar">
          <li><i className="ab-spine done tone-1" />Muhokama qilingan</li>
          <li><i className="ab-spine done milestone" />Har 50-kitob</li>
          <li><i className="ab-spine next" />Keyingi</li>
          <li><i className="ab-spine future" />Rejada</li>
        </ul>
        <Shelf shelf={journey.shelf} />

        <ol className="ab-milestones">
          {journey.milestones.map((milestone) => (
            <li className={milestone.state} key={milestone.n}>
              <span className="ab-star" aria-hidden="true" />
              <strong>{milestone.n === 1 ? "Ilk kitob" : `${milestone.n}-kitob`}</strong>
              <small>{uzDateTashkent(milestone.at)}</small>
              {milestone.state !== "done" && (
                <em>{milestone.state === "live" ? "Hozir efirda" : milestone.state === "next" ? "Keyingi muhokama" : "Oldinda"}</em>
              )}
            </li>
          ))}
        </ol>

        <p className="ab-note">
          Hisob taxminiy: birinchi muhokama {uzDateTashkent(journey.start)} deb va har shanba uzluksiz o‘tkazilgan deb olingan.
          Aniq kitoblar ro‘yxati arxivga qo‘shilgach, har bir kitob o‘z nomi bilan ko‘rinadi.
        </p>
      </section>

      {team.length > 0 && (
        <section className="ab-team" aria-labelledby="ab-team-title">
          <span className="ab-eyebrow">Jamoa</span>
          <h3 id="ab-team-title">Loyihani yuritayotganlar</h3>
          <ul className="ab-team-grid">
            {team.map((member) => <TeamCard key={member.id} member={member} />)}
          </ul>
        </section>
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
