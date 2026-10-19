"use client";

/**
 * Mustaqil viktorina: boshlash → savollar → natija.
 *
 * Har bir javobdan keyin darhol to'g'ri/xato ko'rsatiladi, ball tezlikka qarab hisoblanadi (500–1000) va
 * ketma-ket to'g'ri javoblar bonus beradi. Natija oynasida har bir savol uchun olingan ball ko'rinadi,
 * shuning uchun umumiy ball qayerdan chiqqani tushunarli. Ballar formulasi jonli o'yindagi bilan bir xil.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowRight, BookOpen, Check, Flame, RotateCcw, Sparkles, X, Zap } from "lucide-react";
import { questionPoints, type QuestionPoints } from "@/shared/contract";
import type { Quiz, QuizQuestion } from "./quiz-data";
import { PointsMeter, QuizChoices, formatPoints, verdictFor, type ChoiceState } from "./quiz-parts";
import { QuizIntro } from "./quiz-ui";

export type SoloRow = { correct: boolean; points: QuestionPoints; elapsedMs: number };
export type SoloResult = { correct: number; total: number; score: number; rows: SoloRow[]; best: number; record: boolean };

/** Har safar savollar tartibi aralashtiriladi (Fisher–Yates). */
function shuffled(questions: QuizQuestion[]): QuizQuestion[] {
  const list = [...questions];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/** Oxirgi savollardagi ketma-ket to'g'ri javoblar soni. */
function trailingStreak(rows: SoloRow[]): number {
  let n = 0;
  for (let i = rows.length - 1; i >= 0 && rows[i].correct; i--) n++;
  return n;
}

function speedWord(ms: number): string {
  if (ms < 3_000) return "Chaqmoqdek tez!";
  if (ms < 8_000) return "Tez va to‘g‘ri!";
  return "To‘g‘ri!";
}

export default function QuizPlay({
  quiz,
  cover,
  best,
  live,
  onFinish,
  onBack,
}: {
  quiz: Quiz;
  cover: ReactNode;
  /** Shu qurilmadagi eng yaxshi ball. */
  best: number | null;
  /** Jonli viktorina vaqtida (xona kodi bilan) yechilmoqda. */
  live: boolean;
  /** Oxirgi savoldan keyin bir marta chaqiriladi (natijani saqlash uchun). */
  onFinish: (result: SoloResult) => void;
  onBack: () => void;
}) {
  const [stage, setStage] = useState<"intro" | "play" | "result">("intro");
  const [questions, setQuestions] = useState(() => shuffled(quiz.questions));
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [rows, setRows] = useState<SoloRow[]>([]);
  const [startedAt, setStartedAt] = useState(0);
  const [result, setResult] = useState<SoloResult | null>(null);
  const card = useRef<HTMLFormElement>(null);
  const nextButton = useRef<HTMLButtonElement>(null);

  // Keyingi savolga o'tilganda savol kartasi navbar ortida qolib ketgan bo'lsa — ko'rsatamiz.
  useEffect(() => {
    const node = card.current;
    if (!node || step === 0) return;
    const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--app-header-h")) || 0;
    if (node.getBoundingClientRect().top >= header) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  }, [step]);

  // Javobdan keyin klaviatura bilan «Keyingisi» ga o'tish uchun fokus shu tugmaga ko'chadi.
  useEffect(() => {
    if (picked !== null) nextButton.current?.focus({ preventScroll: true });
  }, [picked]);

  function begin(list: QuizQuestion[]) {
    setQuestions(list);
    setStep(0);
    setPicked(null);
    setRows([]);
    setResult(null);
    setStartedAt(Date.now());
    setStage("play");
  }

  function pick(index: number) {
    if (picked !== null) return;
    const answer = Number(questions[step].answer);
    const correct = index === answer;
    const elapsedMs = Date.now() - startedAt;
    const points = questionPoints(correct, elapsedMs, correct ? trailingStreak(rows) + 1 : 0);
    setPicked(index);
    setRows((list) => [...list, { correct, points, elapsedMs }]);
  }

  function advance() {
    if (picked === null) return;
    if (step + 1 < questions.length) {
      setStep(step + 1);
      setPicked(null);
      setStartedAt(Date.now());
      return;
    }
    const score = rows.reduce((sum, row) => sum + row.points.total, 0);
    const done: SoloResult = {
      correct: rows.filter((row) => row.correct).length,
      total: questions.length,
      score,
      rows,
      best: Math.max(best ?? 0, score),
      record: best != null && score > best,
    };
    setResult(done);
    setStage("result");
    onFinish(done);
  }

  if (stage === "intro") {
    return (
      <QuizIntro
        cover={cover}
        title={quiz.title}
        author={quiz.author}
        questions={quiz.questions.length}
        minutes={quiz.minutes}
        best={best}
        live={live}
        onStart={() => begin(questions)}
      />
    );
  }

  if (stage === "result" && result) {
    return <SoloResultView result={result} onRetry={() => begin(shuffled(quiz.questions))} onBack={onBack} />;
  }

  const question = questions[step];
  const answer = Number(question.answer);
  const last = rows.length > step ? rows[step] : null;
  const streak = trailingStreak(rows);
  const total = rows.reduce((sum, row) => sum + row.points.total, 0);
  const stateOf = (index: number): ChoiceState => {
    if (picked === null) return "idle";
    if (index === answer) return "correct";
    return index === picked ? "wrong" : "dim";
  };

  return (
    <form ref={card} className="qz-play" onSubmit={(event) => { event.preventDefault(); advance(); }}>
      <div className="qz-play-head">
        <span className="qz-step" aria-hidden="true">{step + 1}</span>
        <p aria-live="polite">
          <b>Savol {step + 1}</b> / {questions.length}
        </p>
        {streak >= 2 && (
          <span className="qz-streak" title="Ketma-ket to‘g‘ri javoblar">
            <Flame size={15} aria-hidden="true" /> {streak}
            <span className="sr-only"> ketma-ket to‘g‘ri javob</span>
          </span>
        )}
        <span className="qz-score">{formatPoints(total)}<small> ball</small></span>
      </div>
      <div
        className="qz-track"
        role="progressbar"
        aria-label="Viktorina jarayoni"
        aria-valuemin={1}
        aria-valuemax={questions.length}
        aria-valuenow={step + 1}
        aria-valuetext={`${questions.length} savoldan ${step + 1}-savol`}
      >
        <span style={{ width: `${((step + 1) / questions.length) * 100}%` }} />
      </div>

      <div key={step} className="qz-question">
        <h2 id="qz-question-text">{question.prompt}</h2>
        <PointsMeter key={step} startedAt={startedAt} answeredAfter={last ? last.elapsedMs : null} />
        <QuizChoices
          label={question.prompt}
          choices={question.choices.map((choice) => choice.text)}
          stateOf={stateOf}
          locked={picked !== null}
          onPick={pick}
        />
      </div>

      {last && (
        <div className={`qz-feedback ${last.correct ? "is-ok" : "is-bad"}`} role="status">
          <span className="qz-feedback-icon" aria-hidden="true">{last.correct ? <Check size={22} strokeWidth={3} /> : <X size={22} strokeWidth={3} />}</span>
          <div>
            <strong>{last.correct ? speedWord(last.elapsedMs) : "Noto‘g‘ri"}</strong>
            <small>
              {last.correct
                ? <>tezlik {last.points.base}{last.points.bonus > 0 && <> · <Flame size={12} aria-hidden="true" /> ketma-ket {last.points.bonus}</>}</>
                : <>To‘g‘ri javob: {question.choices[answer]?.text}</>}
            </small>
          </div>
          <b className="qz-gain">{last.correct ? `+${last.points.total}` : "0"}</b>
        </div>
      )}

      <button ref={nextButton} type="submit" className="qz-gold" disabled={picked === null}>
        {picked === null ? "Variantni tanlang" : step + 1 === questions.length ? "Natijani ko‘rish" : "Keyingisi"} <ArrowRight size={18} />
      </button>
    </form>
  );
}

/** Natija: aniqlik halqasi, ball tafsiloti (har bir savol uchun) va keyingi qadamlar. */
function SoloResultView({ result, onRetry, onBack }: { result: SoloResult; onRetry: () => void; onBack: () => void }) {
  const percent = Math.round((result.correct / result.total) * 100);
  const { tone, title } = verdictFor(percent);
  return (
    <section className={`qz-stage qz-result is-${tone}`} aria-labelledby="qz-result-title">
      <div className="qz-ring-wrap">
        {(tone === "great" || tone === "good") && <span className="qz-sparks" aria-hidden="true"><i /><i /><i /><i /></span>}
        <div className="qz-ring" style={{ "--qz-pct": `${percent}%` } as CSSProperties} role="img" aria-label={`${result.total} savoldan ${result.correct} tasi to‘g‘ri`}>
          <span><b>{result.correct}</b><small>/{result.total}</small></span>
        </div>
      </div>
      {result.record && <span className="qz-record"><Sparkles size={13} /> Yangi rekord</span>}
      <h2 id="qz-result-title">{title}</h2>
      <dl className="qz-facts">
        <div><dt>Ball</dt><dd>{formatPoints(result.score)}</dd></div>
        <div><dt>Aniqlik</dt><dd>{percent}%</dd></div>
        <div><dt>Eng yaxshi</dt><dd>{formatPoints(result.best)}</dd></div>
      </dl>
      <div className="qz-breakdown">
        <h3>Ball qayerdan?</h3>
        <ol>
          {result.rows.map((row, index) => (
            <li key={index} className={row.correct ? "is-ok" : "is-bad"}>
              <span className="qz-breakdown-n">{index + 1}</span>
              <span className="qz-breakdown-icon" aria-hidden="true">{row.correct ? <Zap size={14} /> : <X size={14} strokeWidth={3} />}</span>
              <b>{row.correct ? `+${row.points.total}` : "0"}</b>
              <span className="sr-only">{row.correct ? `${index + 1}-savol to‘g‘ri, ${row.points.total} ball` : `${index + 1}-savol noto‘g‘ri, 0 ball`}</span>
            </li>
          ))}
        </ol>
        <p>To‘g‘ri javob 500–1000 ball: qanchalik tez, shuncha ko‘p. Ketma-ket to‘g‘ri javoblar +50 dan +250 gacha bonus beradi.</p>
      </div>
      <button className="qz-gold" type="button" onClick={onRetry}>
        <RotateCcw size={18} /> Qayta urinish
      </button>
      <button className="qz-ghost" type="button" onClick={onBack}>
        <BookOpen size={17} /> Viktorinalarga qaytish
      </button>
    </section>
  );
}
