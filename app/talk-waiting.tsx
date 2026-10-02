"use client";

import { CalendarClock, Clock3, Play } from "lucide-react";
import { WEEKDAYS, clock, countdownParts, dayMonth, useNow } from "./talk-format";

const two = (n: number) => String(n).padStart(2, "0");

/** Kechikish matni: "3 daqiqa", "1 soat 5 daqiqa". */
function lateText(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "";
  const h = Math.floor(minutes / 60);
  return h ? `${h} soat ${minutes % 60} daqiqa` : `${minutes} daqiqa`;
}

/**
 * Suhbat hali boshlanmagan: aniq xabar va boshlanishigacha jonli hisoblagich.
 * Alohida komponent — soniyalik yangilanish butun suhbat oynasini qayta chizmasin.
 */
export default function TalkWaiting({ scheduledAt, bookTitle, title, canStart, busy = false, onStart }: {
  scheduledAt: string;
  bookTitle: string;
  title: string;
  canStart: boolean;
  busy?: boolean;
  onStart: () => void;
}) {
  const now = useNow(1000);
  const c = countdownParts(scheduledAt, now);
  const when = new Date(scheduledAt);
  const late = lateText(c.lateMs);
  const spoken = c.done
    ? "Boshlanish vaqti keldi"
    : `Boshlanishiga ${c.days ? `${c.days} kun ` : ""}${c.hours} soat ${c.minutes} daqiqa qoldi`;

  const tiles: [number, string][] = [
    ...(c.days ? ([[c.days, "kun"]] as [number, string][]) : []),
    [c.hours, "soat"],
    [c.minutes, "daqiqa"],
    [c.seconds, "soniya"],
  ];

  return (
    <section className="live-waiting" aria-label="Suhbat hali boshlanmagan">
      <p className="live-waiting-state"><Clock3 size={16} aria-hidden="true" />Suhbat hali boshlanmagan</p>
      <p className="live-waiting-title">{bookTitle}{title ? ` — ${title}` : ""}</p>
      <p className="live-waiting-when"><CalendarClock size={15} aria-hidden="true" />{WEEKDAYS[when.getDay()]}, {dayMonth(when)} · {clock(when)}</p>

      {c.done ? (
        <div className="live-waiting-due" role="status">
          <strong>Boshlanish vaqti keldi</strong>
          <span>{canStart ? "Tayyor bo‘lsangiz, suhbatni boshlang." : "Admin suhbatni boshlashini kutyapmiz…"}{late ? ` (kechikish: ${late})` : ""}</span>
        </div>
      ) : (
        <>
          <div className="live-waiting-timer" role="timer" aria-label={spoken}>
            {tiles.map(([value, label]) => (
              <span key={label} aria-hidden="true"><b>{two(value)}</b><small>{label}</small></span>
            ))}
          </div>
          <p className="live-waiting-hint">{canStart ? "Vaqt kelganda yoki tayyor bo‘lganda suhbatni boshlang." : "Admin boshlagach, shu yerda «Kirish» tugmasi chiqadi."}</p>
        </>
      )}

      {canStart && (
        <button type="button" className="live-waiting-start" onClick={onStart} disabled={busy}><Play size={16} aria-hidden="true" />{busy ? "Boshlanmoqda…" : "Suhbatni boshlash"}</button>
      )}
    </section>
  );
}

/** Kichik oyna (mini panel) va kartalar uchun: jonli qisqa hisoblagich. */
export function TalkCountdownText({ scheduledAt, prefix = "", doneText = "Boshlanishi kutilmoqda" }: { scheduledAt: string; prefix?: string; doneText?: string }) {
  const now = useNow(1000);
  const c = countdownParts(scheduledAt, now);
  if (c.done) return <>{doneText}</>;
  const time = c.hours || c.days ? `${two(c.hours)}:${two(c.minutes)}:${two(c.seconds)}` : `${two(c.minutes)}:${two(c.seconds)}`;
  return <>{prefix}{c.days ? `${c.days} kun ` : ""}{time}</>;
}
