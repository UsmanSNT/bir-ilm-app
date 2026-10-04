"use client";

import { useState } from "react";
import { CalendarClock, ChevronLeft, ChevronRight } from "lucide-react";

const MONTHS = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];
const MONTHS_SHORT = ["yan", "fev", "mar", "apr", "may", "iyun", "iyul", "avg", "sen", "okt", "noy", "dek"];
const WEEKDAYS_SHORT = ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"];
const WEEKDAYS = ["yakshanba", "dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba"];
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

const pad = (n: number) => String(n).padStart(2, "0");
const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** `YYYY-MM-DDTHH:mm` (datetime-local qiymati) → Date (mahalliy vaqt). */
function parse(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])) : null;
}

export function formatWhen(value: string): string {
  const d = parse(value);
  return d ? `${d.getDate()}-${MONTHS_SHORT[d.getMonth()]}, ${WEEKDAYS[d.getDay()]} · ${pad(d.getHours())}:${pad(d.getMinutes())}` : "";
}

/**
 * Sana va vaqtni tanlash: avval sana (kalendar) → «Keyingi» → soat va daqiqa (24 soatlik) → «Saqlash».
 * Qiymat `datetime-local` bilan bir xil ko'rinishda (`YYYY-MM-DDTHH:mm`), shuning uchun mavjud kodga mos.
 */
export default function DateTimeField({ value, onChange, min, disabled, label, placeholder = "Sana va vaqtni tanlang" }: {
  value: string;
  onChange: (value: string) => void;
  /** Eng erta ruxsat etilgan vaqt (`YYYY-MM-DDTHH:mm`). */
  min?: string;
  disabled?: boolean;
  label: string;
  placeholder?: string;
}) {
  const current = parse(value);
  const minDate = min ? parse(min) : null;
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"date" | "time">("date");
  const [day, setDay] = useState<Date | null>(null);
  const [cursor, setCursor] = useState(() => new Date((current ?? new Date()).getFullYear(), (current ?? new Date()).getMonth(), 1));
  const [hour, setHour] = useState(10);
  const [minute, setMinute] = useState(0);

  const start = () => {
    const base = current ?? new Date();
    setDay(current ? new Date(current.getFullYear(), current.getMonth(), current.getDate()) : null);
    setCursor(new Date(base.getFullYear(), base.getMonth(), 1));
    setHour(current ? current.getHours() : 10);
    setMinute(current ? Math.round(current.getMinutes() / 5) * 5 % 60 : 0);
    setStep("date");
    setOpen(true);
  };

  const dayAllowed = (d: Date) => !minDate || dateKey(d) >= dateKey(minDate);
  const timeAllowed = (h: number, m: number) => {
    if (!day || !minDate || dateKey(day) !== dateKey(minDate)) return true;
    return h * 60 + m >= minDate.getHours() * 60 + minDate.getMinutes();
  };
  const hourAllowed = (h: number) => MINUTES.some((m) => timeAllowed(h, m));

  // Kalendar: dushanbadan boshlanadi.
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const total = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells: Array<Date | null> = [...Array.from({ length: offset }, () => null), ...Array.from({ length: total }, (_, i) => new Date(cursor.getFullYear(), cursor.getMonth(), i + 1))];
  const today = dateKey(new Date());

  const save = () => {
    if (!day) return;
    // Tanlangan vaqt o'tib ketgan bo'lsa (bugun uchun) — eng yaqin ruxsat etilgan vaqt olinadi.
    let h = hour;
    let m = minute;
    if (!timeAllowed(h, m)) {
      h = Array.from({ length: 24 }, (_, i) => i).find(hourAllowed) ?? hour;
      m = MINUTES.find((x) => timeAllowed(h, x)) ?? 0;
    }
    onChange(`${dateKey(day)}T${pad(h)}:${pad(m)}`);
    setOpen(false);
  };

  return (
    <div className="dtf">
      <button type="button" className="dtf-field" aria-label={label} aria-expanded={open} disabled={disabled} onClick={() => (open ? setOpen(false) : start())}>
        <CalendarClock size={18} aria-hidden="true" />
        <span className={current ? "" : "is-empty"}>{current ? formatWhen(value) : placeholder}</span>
      </button>

      {open && (
        <div className="dtf-panel" role="group" aria-label={step === "date" ? "Sanani tanlang" : "Vaqtni tanlang"}>
          {step === "date" ? (
            <>
              <div className="dtf-month">
                <button type="button" aria-label="Oldingi oy" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><ChevronLeft size={18} /></button>
                <strong>{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</strong>
                <button type="button" aria-label="Keyingi oy" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><ChevronRight size={18} /></button>
              </div>
              <div className="dtf-grid dtf-weekdays" aria-hidden="true">{WEEKDAYS_SHORT.map((w) => <span key={w}>{w}</span>)}</div>
              <div className="dtf-grid">
                {cells.map((d, i) => d ? (
                  <button
                    key={i}
                    type="button"
                    className={`dtf-day${day && dateKey(day) === dateKey(d) ? " is-on" : ""}${dateKey(d) === today ? " is-today" : ""}`}
                    disabled={!dayAllowed(d)}
                    aria-pressed={Boolean(day && dateKey(day) === dateKey(d))}
                    onClick={() => setDay(d)}
                  >{d.getDate()}</button>
                ) : <span key={i} />)}
              </div>
              <div className="dtf-actions">
                <button type="button" className="dtf-btn" onClick={() => setOpen(false)}>Bekor qilish</button>
                <button type="button" className="dtf-btn is-primary" disabled={!day} onClick={() => setStep("time")}>Keyingi</button>
              </div>
            </>
          ) : (
            <>
              <p className="dtf-picked">{day ? `${day.getDate()}-${MONTHS_SHORT[day.getMonth()]}, ${WEEKDAYS[day.getDay()]}` : ""} · <b>{pad(hour)}:{pad(minute)}</b></p>
              <span className="dtf-label">Soat</span>
              <div className="dtf-times">
                {Array.from({ length: 24 }, (_, h) => (
                  <button key={h} type="button" className={`dtf-time${hour === h ? " is-on" : ""}`} disabled={!hourAllowed(h)} aria-pressed={hour === h} onClick={() => setHour(h)}>{pad(h)}</button>
                ))}
              </div>
              <span className="dtf-label">Daqiqa</span>
              <div className="dtf-times dtf-minutes">
                {MINUTES.map((m) => (
                  <button key={m} type="button" className={`dtf-time${minute === m ? " is-on" : ""}`} disabled={!timeAllowed(hour, m)} aria-pressed={minute === m} onClick={() => setMinute(m)}>{pad(m)}</button>
                ))}
              </div>
              <div className="dtf-actions">
                <button type="button" className="dtf-btn" onClick={() => setStep("date")}>Orqaga</button>
                <button type="button" className="dtf-btn is-primary" onClick={save}>Saqlash</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
