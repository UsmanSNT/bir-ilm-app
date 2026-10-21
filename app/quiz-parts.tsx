"use client";

/**
 * Mustaqil va jonli viktorinaning umumiy bo'laklari: variant tugmalari, taymer halqasi va ball ko'rsatkichi.
 * Faqat ko'rinish — holat va ma'lumot ota komponentda.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { Check, X } from "lucide-react";
import { QUIZ_POINTS, questionPoints } from "@/shared/contract";

/** Variant belgilari: test varaqlaridagidek A, B, C… (eng ko'pi 6 ta variant). */
const LETTERS = ["A", "B", "C", "D", "E", "F"];

export type ChoiceState = "idle" | "picked" | "correct" | "wrong" | "dim";

const STATE_LABEL: Partial<Record<ChoiceState, string>> = {
  picked: " — sizning javobingiz",
  correct: " — to‘g‘ri javob",
  wrong: " — noto‘g‘ri",
};

/**
 * Variantlar. Har biri alohida tugma: bosish javobni darhol qulflaydi (o'qlar bilan yurish tasodifan javob bermaydi).
 * `readOnly` — faqat ko'rsatish (boshlovchi ekrani); `locked` — javob berilgan, o'zgartirib bo'lmaydi.
 * `counts` berilsa, har bir variantni tanlaganlar soni va ulushi ko'rsatiladi.
 */
export function QuizChoices({
  choices,
  stateOf,
  onPick,
  readOnly = false,
  locked = false,
  counts,
  label,
}: {
  choices: string[];
  stateOf: (index: number) => ChoiceState;
  onPick?: (index: number) => void;
  readOnly?: boolean;
  locked?: boolean;
  counts?: number[];
  label: string;
}) {
  const top = counts ? Math.max(1, ...counts) : 1;
  return (
    <div className="qz-options" role="group" aria-label={label}>
      {choices.map((text, index) => {
        const state = stateOf(index);
        const inert = readOnly || locked;
        return (
          <button
            key={index}
            type="button"
            className={`qz-opt qz-opt-${index} is-${state}${inert ? " is-inert" : ""}`}
            aria-pressed={state === "picked" || undefined}
            aria-disabled={inert || undefined}
            onClick={() => {
              if (!inert) onPick?.(index);
            }}
            style={counts ? ({ "--qz-share": `${(counts[index] / top) * 100}%` } as CSSProperties) : undefined}
          >
            <span className="qz-mark" aria-hidden="true">{LETTERS[index] ?? index + 1}</span>
            <span className="qz-opt-text">{text}</span>
            <span className="qz-opt-tail" aria-hidden="true">
              {counts && <b>{counts[index]}</b>}
              {state === "correct" && <Check size={18} strokeWidth={3} />}
              {state === "wrong" && <X size={18} strokeWidth={3} />}
            </span>
            <span className="sr-only">
              {STATE_LABEL[state] ?? ""}
              {counts ? `, ${counts[index]} kishi tanlagan` : ""}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Savol vaqti: halqa silliq kamayadi (CSS animatsiyasi, har kadrda qayta chizilmaydi), raqam har chorak soniyada yangilanadi.
 * `offset` — server soati bilan qurilma soati orasidagi farq. Savol almashganda `key` bilan qayta yaratiladi.
 */
export function CountdownRing({ endsAt, limitMs, offset }: { endsAt: number; limitMs: number; offset: number }) {
  const [left, setLeft] = useState(() => Math.max(0, endsAt - (Date.now() + offset)));
  const [elapsedAtStart] = useState(() => Math.min(limitMs, Math.max(0, limitMs - left)));
  useEffect(() => {
    const tick = () => setLeft(Math.max(0, endsAt - (Date.now() + offset)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [endsAt, offset]);
  const secs = Math.ceil(left / 1000);
  return (
    <div className={`qz-timer${secs <= 5 ? " is-low" : ""}`} role="timer" aria-label={`${secs} soniya qoldi`}>
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r="21" className="qz-timer-bg" />
        <circle cx="24" cy="24" r="21" className="qz-timer-arc" style={{ animationDuration: `${limitMs}ms`, animationDelay: `-${elapsedAtStart}ms` }} />
      </svg>
      <b aria-hidden="true">{secs}</b>
    </div>
  );
}

/**
 * Mustaqil rejim: «hozir javob bersangiz» necha ball olasiz — vaqt o'tgan sari 1000 dan 500 gacha kamayadi.
 * `answeredAfter` berilsa (javob berildi), ko'rsatkich aynan javob vaqtidagi qiymatda to'xtaydi.
 */
export function PointsMeter({ startedAt, answeredAfter }: { startedAt: number; answeredAfter: number | null }) {
  const frozen = answeredAfter !== null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (frozen) return;
    const id = setInterval(() => setNow(Date.now()), 120);
    return () => clearInterval(id);
  }, [frozen]);
  const potential = questionPoints(true, answeredAfter ?? now - startedAt, 1).base;
  const share = ((potential - QUIZ_POINTS.min) / (QUIZ_POINTS.max - QUIZ_POINTS.min)) * 100;
  return (
    <div className={`qz-meter${frozen ? " is-frozen" : ""}`}>
      <div className="qz-meter-bar" aria-hidden="true"><span style={{ width: `${share}%` }} /></div>
      <p>
        <span>Tezroq javob — ko‘proq ball</span>
        <b aria-hidden="true">+{potential}</b>
      </p>
    </div>
  );
}

/** «950» → «950», «12500» → «12 500»: katta ballar o'qilishi oson bo'lsin (til sozlamasiga bog'liq emas). */
export const formatPoints = (value: number) => String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/** Aniqlik foiziga qarab baho. */
export function verdictFor(percent: number): { tone: "great" | "good" | "fair" | "low"; title: string } {
  if (percent >= 90) return { tone: "great", title: "Barakalla! A’lo natija" };
  if (percent >= 70) return { tone: "good", title: "Juda yaxshi!" };
  if (percent >= 50) return { tone: "fair", title: "Yaxshi natija" };
  return { tone: "low", title: "Yana bir bor urinib ko‘ring" };
}
