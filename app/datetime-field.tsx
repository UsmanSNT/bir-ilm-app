"use client";

import { useState } from "react";
import { CalendarClock, ChevronLeft, ChevronRight } from "lucide-react";

const MONTHS = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];
const MONTHS_SHORT = ["yan", "fev", "mar", "apr", "may", "iyun", "iyul", "avg", "sen", "okt", "noy", "dek"];
const WEEKDAYS_SHORT = ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"];
const WEEKDAYS = ["yakshanba", "dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba"];
const pad = (n: number) => String(n).padStart(2, "0");
const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const clampPart = (text: string, max: number) => Math.min(Math.max(Number(text) || 0, 0), max);

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
  const [hourText, setHourText] = useState("10");
  const [minuteText, setMinuteText] = useState("00");
  const hour = clampPart(hourText, 23);
  const minute = clampPart(minuteText, 59);

  const start = () => {
    const base = current ?? new Date();
    setDay(current ? new Date(current.getFullYear(), current.getMonth(), current.getDate()) : null);
    setCursor(new Date(base.getFullYear(), base.getMonth(), 1));
    setHourText(pad(current ? current.getHours() : 10));
    setMinuteText(pad(current ? current.getMinutes() : 0));
    setStep("date");
    setOpen(true);
  };

  const dayAllowed = (d: Date) => !minDate || dateKey(d) >= dateKey(minDate);
  const timeAllowed = (h: number, m: number) => {
    if (!day || !minDate || dateKey(day) !== dateKey(minDate)) return true;
    return h * 60 + m >= minDate.getHours() * 60 + minDate.getMinutes();
  };
  const timeOk = timeAllowed(hour, minute);

  // Kalendar: dushanbadan boshlanadi.
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const total = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells: Array<Date | null> = [...Array.from({ length: offset }, () => null), ...Array.from({ length: total }, (_, i) => new Date(cursor.getFullYear(), cursor.getMonth(), i + 1))];
  const today = dateKey(new Date());

  const save = () => {
    if (!day) return;
    // Tanlangan vaqt min'dan oldin bo'lsa (bugun uchun) — eng erta ruxsat etilgan vaqt olinadi.
    const time = timeOk || !minDate ? { h: hour, m: minute } : { h: minDate.getHours(), m: minDate.getMinutes() };
    onChange(`${dateKey(day)}T${pad(time.h)}:${pad(time.m)}`);
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
              <div className="dtf-clock" role="group" aria-label="Soat va daqiqa">
                <input
                  className="dtf-num"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={2}
                  aria-label="Soat (00–23)"
                  value={hourText}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => setHourText(e.target.value.replace(/\D/g, "").slice(0, 2))}
                  onBlur={() => setHourText(pad(hour))}
                />
                <span className="dtf-colon" aria-hidden="true">:</span>
                <input
                  className="dtf-num"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={2}
                  aria-label="Daqiqa (00–59)"
                  value={minuteText}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => setMinuteText(e.target.value.replace(/\D/g, "").slice(0, 2))}
                  onBlur={() => setMinuteText(pad(minute))}
                />
              </div>
              {!timeOk && minDate && (
                <p className="dtf-hint" role="status">{`Bu vaqt o'tib ketgan. Saqlanganda eng yaqin ruxsat etilgan vaqt — ${pad(minDate.getHours())}:${pad(minDate.getMinutes())} — olinadi.`}</p>
              )}
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
