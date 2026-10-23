"use client";
/* eslint-disable @next/next/no-img-element -- YouTube muqovasi tashqi manzildan, optimizatsiya kerak emas */

import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { ArrowUpRight, CalendarDays, ChevronRight, LibraryBig, Play, Radio, Users } from "lucide-react";
import { parseVideoUrl } from "@/lib/about";
import {
  SESSION,
  UZ_WEEKDAYS,
  formatCountdown,
  formatSpan,
  formatUzDate,
  type Journey,
  type ShelfCell,
  type ShelfYear,
} from "@/lib/journey";
import { useJourney, useMinuteClock } from "./use-about";

const groupDigits = (value: number) => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

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
  return `${journey.next.n}-kitob · ${formatUzDate(journey.next.at, false)}, shanba · ${formatCountdown(journey.next.at - now)} qoldi`;
}

function IntroVideo({ url, loaded }: { url: string; loaded: boolean }) {
  const source = useMemo(() => (url ? parseVideoUrl(url) : null), [url]);
  const [playing, setPlaying] = useState(false);

  if (!loaded) return <div className="about-video is-loading" aria-hidden="true" />;
  if (!source) {
    return (
      <div className="about-video is-empty">
        <span className="about-video-play"><Play size={26} /></span>
        <strong>Tanishtiruv videosi</strong>
        <span>Tez orada shu yerda bo&apos;ladi</span>
      </div>
    );
  }
  if (source.kind === "file") {
    return (
      <div className="about-video">
        <video src={source.src} controls preload="metadata" playsInline aria-label="Bir Ilm tanishtiruv videosi" />
      </div>
    );
  }
  return (
    <div className="about-video">
      {playing ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${source.id}?autoplay=1&rel=0`}
          title="Bir Ilm tanishtiruv videosi"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      ) : (
        <button className="about-video-facade" onClick={() => setPlaying(true)} aria-label="Tanishtiruv videosini ijro etish">
          <img src={`https://i.ytimg.com/vi/${source.id}/hqdefault.jpg`} alt="" loading="lazy" />
          <span className="about-video-play"><Play size={26} /></span>
          <span className="about-video-caption">Bir Ilm bilan tanishing</span>
        </button>
      )}
    </div>
  );
}

const STATE_TEXT: Record<ShelfCell["state"], string> = {
  before: "",
  done: "muhokama qilingan · kitob nomi arxivga qo'shiladi",
  live: "hozir efirda",
  next: "keyingi muhokama",
  future: "rejada",
};

function spineStyle(n: number): CSSProperties {
  // Har bir kitobga barqaror, lekin har xil balandlik: javon tabiiy ko'rinadi.
  return { "--h": `${64 + ((n * 37) % 37)}%` } as CSSProperties;
}

function Shelf({ shelf }: { shelf: ShelfYear[] }) {
  const [active, setActive] = useState<ShelfCell | null>(null);

  const rows = useMemo(
    () =>
      shelf.map((year, yearIndex) => (
        <div className="shelf-row" key={year.year}>
          <div className="shelf-label">
            <strong>{year.year}</strong>
            <span>
              {year.held} kitob{year.planned ? ` · ${year.planned} rejada` : ""}
            </span>
          </div>
          <div
            className="shelf-books"
            role="img"
            aria-label={`${year.year}-yil: ${year.held} ta kitob muhokama qilingan${year.planned ? `, ${year.planned} ta rejada` : ""}`}
          >
            {year.cells.map((cell, cellIndex) => (
              <span
                key={cell.at}
                data-k={`${yearIndex}:${cellIndex}`}
                className={`spine ${cell.state}${cell.n !== null && (cell.n === 1 || cell.n % 50 === 0) ? " milestone" : ""}${cell.n !== null ? ` tone-${cell.n % 4}` : ""}`}
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
    <div className="shelf" onPointerOver={pick} onPointerDown={pick} onPointerLeave={() => setActive(null)}>
      <p className="shelf-readout" aria-live="polite">
        {active && active.n !== null ? (
          <>
            <strong>#{active.n}</strong> · {formatUzDate(active.at)} · {STATE_TEXT[active.state]}
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
  // Toshkent (UTC+5) va Seul (UTC+9) foydalanuvchilariga takror ko'rsatmaymiz.
  if (offset === -300 || offset === -540) return null;
  const time = `${String(local.getHours()).padStart(2, "0")}:${String(local.getMinutes()).padStart(2, "0")}`;
  return `Sizning vaqtingizda: ${UZ_WEEKDAYS[local.getDay()]}, ${time}`;
}

export default function About({ onTeam }: { onTeam: () => void }) {
  const { journey, settings, loaded } = useJourney();
  const now = useMinuteClock();
  const { completed, elapsed, next, live } = journey;
  const paragraphs = settings.intro.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const localLine = localTimeLine(next.at);

  return (
    <div className="about">
      <section className="about-hero">
        <div className="about-hero-copy">
          <span className="about-kicker">BIZ HAQIMIZDA</span>
          <h2>
            Har shanba — bitta kitob.
            <br />
            <em>{formatSpan(elapsed)}dan beri.</em>
          </h2>
          {paragraphs.map((text, index) => (
            <p key={index}>{text}</p>
          ))}
          <span className={`about-next${live !== null ? " is-live" : ""}`}>
            {live !== null ? <Radio size={16} /> : <CalendarDays size={16} />}
            {nextLabel(journey, now)}
          </span>
        </div>
        <IntroVideo key={settings.videoUrl} url={settings.videoUrl} loaded={loaded} />
      </section>

      <dl className="about-stats">
        <div>
          <dt>kitob muhokama qilindi</dt>
          <dd><CountUp value={completed} /></dd>
          <small>1-kitobdan {completed}-kitobgacha</small>
        </div>
        <div>
          <dt>bosib o&apos;tilgan yo&apos;l</dt>
          <dd>
            {elapsed.years}<span className="unit">yil</span> {elapsed.months}<span className="unit">oy</span>
          </dd>
          <small>{groupDigits(elapsed.totalDays)} kun</small>
        </div>
        <div>
          <dt>kitob — yiliga o&apos;rtacha</dt>
          <dd>≈{journey.perYear}</dd>
          <small>har hafta bittadan</small>
        </div>
        <div>
          <dt>yildan beri</dt>
          <dd>{new Date(journey.start).getUTCFullYear()}</dd>
          <small>taxminan {formatUzDate(journey.start, false)}, shanba</small>
        </div>
      </dl>

      <section className="about-schedule">
        <div className="about-schedule-copy">
          <span className="about-kicker">HAFTALIK MUHOKAMA</span>
          <h3>Har shanba</h3>
          <p>Hafta davomida o&apos;qilgan kitob shanba kuni jonli suhbatda birgalikda tahlil qilinadi.</p>
        </div>
        <div className="about-clocks">
          <div>
            <span>UZB</span>
            <strong>{SESSION.uzTime}</strong>
            <small>Toshkent</small>
          </div>
          <div>
            <span>KOR</span>
            <strong>{SESSION.korTime}</strong>
            <small>Seul</small>
          </div>
        </div>
        <div className="about-countdown">
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

      <section className="about-journey" aria-labelledby="about-journey-title">
        <header>
          <span className="about-kicker">BIR ILM YO&apos;LI</span>
          <h3 id="about-journey-title">
            {completed} kitob · {formatSpan(elapsed)}
          </h3>
        </header>
        <ul className="shelf-legend" aria-label="Belgilar">
          <li><i className="spine done tone-1" />Muhokama qilingan</li>
          <li><i className="spine done milestone" />Har 50-kitob</li>
          <li><i className="spine next" />Keyingi</li>
          <li><i className="spine future" />Rejada</li>
        </ul>
        <Shelf shelf={journey.shelf} />

        <ol className="about-milestones">
          {journey.milestones.map((milestone) => (
            <li className={milestone.state} key={milestone.n}>
              <span className="dot" aria-hidden="true" />
              <strong>{milestone.n === 1 ? "Ilk kitob" : `${milestone.n}-kitob`}</strong>
              <small>{formatUzDate(milestone.at)}</small>
              {milestone.state !== "done" && (
                <em>{milestone.state === "live" ? "Hozir efirda" : milestone.state === "next" ? "Keyingi muhokama" : "Oldinda"}</em>
              )}
            </li>
          ))}
        </ol>

        <p className="about-note">
          Hisob taxminiy: birinchi muhokama {formatUzDate(journey.start)} deb va har shanba uzluksiz o&apos;tkazilgan deb olingan.
          Aniq kitoblar ro&apos;yxati arxivga qo&apos;shilgach, har bir kitob o&apos;z nomi bilan ko&apos;rinadi.
        </p>
      </section>

      <button className="about-team-cta" onClick={onTeam}>
        <span className="about-team-icon"><Users size={22} /></span>
        <span>
          <strong>Loyihani kimlar yuritadi?</strong>
          <small>Bir Ilm jamoasi bilan tanishing</small>
        </span>
        <ArrowUpRight size={20} />
      </button>
    </div>
  );
}

/** Bosh sahifadagi ixcham qator: joy egallamaydi, lekin "Biz haqimizda"ga olib boradi. */
export function JourneyStrip({ onOpen }: { onOpen: () => void }) {
  const { journey } = useJourney();
  const { completed, elapsed, live, next } = journey;
  return (
    <button className="journey-strip" onClick={onOpen}>
      <span className="journey-strip-icon"><LibraryBig size={20} /></span>
      <span className="journey-strip-text">
        <strong>{completed} kitob · {formatSpan(elapsed)}</strong>
        <small>{live !== null ? `Hozir efirda · ${live}-kitob` : `${next.n}-kitob · shanba ${SESSION.uzTime} UZB · ${SESSION.korTime} KOR`}</small>
      </span>
      <span className="journey-strip-cta">Biz haqimizda <ChevronRight size={16} /></span>
    </button>
  );
}

export function JourneyRailCard({ onOpen }: { onOpen: () => void }) {
  const { journey } = useJourney();
  return (
    <button className="rail-journey" onClick={onOpen}>
      <span>BIR ILM YO&apos;LI</span>
      <strong>{journey.completed}</strong>
      <small>kitob · {formatSpan(journey.elapsed)}</small>
      <em>Biz haqimizda <ChevronRight size={14} /></em>
    </button>
  );
}
