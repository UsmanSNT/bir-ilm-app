"use client";

/**
 * Jonli viktorina xonasi (Kahoot uslubida): kutish xonasi → savol → natija → … → podium.
 * Boshlovchi (admin/moderator) o'yinni boshqaradi, o'yinchilar telefonlarida javob beradi.
 * Hamma holat serverdan keladi (`useQuizGame`); bu fayl faqat ko'rinish.
 */
import { useEffect, type ReactNode } from "react";
import { toast } from "sonner";
import { ArrowRight, Check, Flame, Hourglass, Play, RotateCcw, Sparkles, Trophy, Users, WifiOff, X, Zap } from "lucide-react";
import type { GameRow, GameView } from "@/shared/contract";
import { useQuizGame } from "@/lib/api/quiz-game-client";
import { CountdownRing, QuizChoices, formatPoints, type ChoiceState } from "./quiz-parts";

type Game = ReturnType<typeof useQuizGame>;

export default function QuizLive({ sessionId, onBack, onSolo }: { sessionId: string; onBack: () => void; onSolo: () => void }) {
  const game = useQuizGame(sessionId);
  const { view, notice } = game;

  useEffect(() => {
    if (notice) toast.error(notice.message);
  }, [notice]);

  if (game.fatal) {
    return (
      <Notice icon={<X size={26} />} title="Qo‘shilib bo‘lmadi" text={game.fatal}>
        <button type="button" className="qz-gold" onClick={onBack}>Orqaga</button>
      </Notice>
    );
  }
  if (game.replaced) {
    return (
      <Notice icon={<Users size={26} />} title="Boshqa qurilmada ochildi" text="Bitta hisob bir vaqtda faqat bitta qurilmada o‘ynaydi. Shu yerda davom etish uchun viktorinaga qayta kiring.">
        <button type="button" className="qz-gold" onClick={onBack}>Viktorinalarga qaytish</button>
      </Notice>
    );
  }
  if (!view) {
    return <Notice icon={<Hourglass size={26} />} title="Xonaga ulanmoqda…" text="Bir necha soniya kuting." busy />;
  }

  return (
    <div className="qz-live-room">
      {game.connection === "reconnecting" && (
        <p className="qz-offline" role="status">
          <WifiOff size={16} aria-hidden="true" /> Aloqa uzildi — qayta ulanmoqda…
        </p>
      )}
      {view.phase === "lobby" && <Lobby view={view} game={game} onSolo={onSolo} />}
      {view.phase === "question" && <Question view={view} game={game} />}
      {view.phase === "reveal" && <Reveal view={view} game={game} />}
      {view.phase === "ended" && <Podium view={view} game={game} onBack={onBack} />}
    </div>
  );
}

function Notice({ icon, title, text, busy = false, children }: { icon: ReactNode; title: string; text: string; busy?: boolean; children?: ReactNode }) {
  return (
    <section className="qz-stage qz-notice" aria-busy={busy || undefined} role={busy ? "status" : "alert"}>
      <span className="qz-notice-icon" aria-hidden="true">{icon}</span>
      <h2>{title}</h2>
      <p className="qz-stage-sub">{text}</p>
      {children}
    </section>
  );
}

const initial = (name: string) => (name.trim().slice(0, 1) || "K").toUpperCase();

/** Kutish xonasi: boshlovchiga kod va «Boshlash», o'yinchiga kutish. */
function Lobby({ view, game, onSolo }: { view: GameView; game: Game; onSolo: () => void }) {
  const more = view.playerCount - view.players.length;
  return (
    <section className="qz-stage qz-lobby" aria-labelledby="qz-lobby-title">
      <span className="qz-eyebrow">Jonli viktorina</span>
      <h2 id="qz-lobby-title">{view.title}</h2>
      {view.isHost && view.code && (
        <div className="qz-pin">
          <small>Xona kodi</small>
          <code aria-hidden="true">{view.code}</code>
          <span className="sr-only">{view.code.split("").join(" ")}</span>
        </div>
      )}
      <p className="qz-lobby-count">
        <Users size={17} aria-hidden="true" /> <b>{view.playerCount}</b> o‘yinchi tayyor
      </p>
      {view.players.length > 0 && (
        <ul className="qz-roster" aria-label="O‘yinchilar">
          {view.players.map((player) => (
            <li key={player.userId}>
              <span aria-hidden="true">{initial(player.name)}</span>
              {player.name}
            </li>
          ))}
          {more > 0 && <li className="qz-roster-more">+{more}</li>}
        </ul>
      )}
      {view.isHost ? (
        <>
          <button type="button" className="qz-gold" disabled={view.playerCount < 1} onClick={game.start}>
            <Play size={18} /> O‘yinni boshlash
          </button>
          <p className="qz-stage-sub">{view.playerCount < 1 ? "Birinchi o‘yinchi kirishini kuting" : "Hamma tayyor bo‘lsa, boshlang. Savollar hamma telefonda bir vaqtda ochiladi."}</p>
        </>
      ) : (
        <>
          <p className="qz-wait" role="status">
            <span className="qz-dots" aria-hidden="true"><i /><i /><i /></span>
            {view.hostOnline ? "Boshlovchi tez orada o‘yinni boshlaydi" : "Boshlovchi hali kirmadi"}
          </p>
          {!view.hostOnline && (
            <button type="button" className="qz-ghost" onClick={onSolo}>
              Kutmasdan o‘zim yechaman
            </button>
          )}
        </>
      )}
    </section>
  );
}

/** Ochiq savol: vaqt, variantlar. O'yinchi bossa javob qulflanadi; boshlovchi faqat ko'radi va javobni ochadi. */
function Question({ view, game }: { view: GameView; game: Game }) {
  const q = view.question;
  if (!q) return null;
  const mine = game.mine && game.mine.question === q.index ? game.mine.choice : null;
  const chosen = view.you?.choice ?? mine;
  const answered = game.progress?.answered ?? view.answered;
  const players = game.progress?.playerCount ?? view.playerCount;
  const stateOf = (index: number): ChoiceState => (chosen === index ? "picked" : chosen !== null ? "dim" : "idle");
  return (
    <section className="qz-play qz-live-q" aria-labelledby="qz-question-text">
      <div className="qz-play-head">
        <span className="qz-step" aria-hidden="true">{q.index + 1}</span>
        <p aria-live="polite">
          <b>Savol {q.index + 1}</b> / {view.total}
        </p>
        <CountdownRing key={q.index} endsAt={q.endsAt} limitMs={q.limitMs} offset={game.offset} />
      </div>
      <div key={q.index} className="qz-question">
        <h2 id="qz-question-text">{q.prompt}</h2>
        <QuizChoices
          label="Variantlar"
          choices={q.choices}
          stateOf={stateOf}
          readOnly={view.isHost}
          locked={chosen !== null}
          onPick={(choice) => game.answer(q.index, choice)}
        />
      </div>
      <div className="qz-answered" role="status">
        <div className="qz-answered-bar" aria-hidden="true"><span style={{ width: `${players ? (answered / players) * 100 : 0}%` }} /></div>
        <p>
          {chosen !== null && !view.isHost && <><Check size={15} aria-hidden="true" /> Javobingiz qabul qilindi · </>}
          <b>{answered}</b> / {players} javob berdi
        </p>
      </div>
      {view.isHost ? (
        <button type="button" className="qz-gold" onClick={game.reveal}>
          Javobni ko‘rsatish <ArrowRight size={18} />
        </button>
      ) : chosen === null ? (
        <p className="qz-hint"><Zap size={15} aria-hidden="true" /> Tez javob bering — ko‘proq ball olasiz</p>
      ) : null}
    </section>
  );
}

function rowTone(row: GameRow): string {
  return row.correct === true ? "is-ok" : row.correct === false ? "is-bad" : "is-skip";
}

function Standings({ rows, you }: { rows: GameRow[]; you: string | null }) {
  return (
    <ol className="qz-board">
      {rows.map((row) => (
        <li key={row.userId} className={`${rowTone(row)}${row.userId === you ? " is-me" : ""}`}>
          <span className={`qz-rank qz-rank-${Math.min(row.rank, 4)}`}>{row.rank}</span>
          <strong>
            {row.name}
            {row.streak >= 2 && <span className="qz-row-streak"><Flame size={12} aria-hidden="true" />{row.streak}</span>}
          </strong>
          <span className="qz-row-delta">
            {row.correct === true && <><Check size={13} strokeWidth={3} aria-hidden="true" />+{row.delta}</>}
            {row.correct === false && <X size={13} strokeWidth={3} aria-hidden="true" />}
            {row.correct === null && <span aria-hidden="true">–</span>}
            <span className="sr-only">{row.correct === true ? `to‘g‘ri, ${row.delta} ball` : row.correct === false ? "noto‘g‘ri" : "javob bermadi"}</span>
          </span>
          <em>{formatPoints(row.score)}</em>
        </li>
      ))}
    </ol>
  );
}

/** Natija: to'g'ri javob, kim qanday javob bergani, tezlikka qarab ball va umumiy tartib. */
function Reveal({ view, game }: { view: GameView; game: Game }) {
  const q = view.question;
  const reveal = view.reveal;
  if (!q || !reveal) return null;
  const you = view.you;
  const stateOf = (index: number): ChoiceState => (index === reveal.answer ? "correct" : you?.choice === index ? "wrong" : "dim");
  const outcome = you?.correct;
  return (
    <section className="qz-play qz-live-r" aria-labelledby="qz-question-text">
      <div className="qz-play-head">
        <span className="qz-step" aria-hidden="true">{q.index + 1}</span>
        <p aria-live="polite">
          <b>Savol {q.index + 1}</b> / {view.total} · natija
        </p>
      </div>
      <h2 id="qz-question-text" className="qz-reveal-prompt">{q.prompt}</h2>
      <QuizChoices label="Variantlar va tanlaganlar soni" choices={q.choices} stateOf={stateOf} counts={reveal.counts} readOnly />

      {you && (
        <div className={`qz-feedback ${outcome === true ? "is-ok" : "is-bad"}`} role="status">
          <span className="qz-feedback-icon" aria-hidden="true">{outcome === true ? <Check size={22} strokeWidth={3} /> : outcome === false ? <X size={22} strokeWidth={3} /> : <Hourglass size={20} />}</span>
          <div>
            <strong>{outcome === true ? "To‘g‘ri!" : outcome === false ? "Noto‘g‘ri" : "Javob bermadingiz"}</strong>
            <small>
              {outcome === true && you.points
                ? <>tezlik {you.points.base}{you.points.bonus > 0 && <> · <Flame size={12} aria-hidden="true" /> ketma-ket {you.points.bonus}</>}</>
                : outcome === false ? <>To‘g‘ri javob: {String.fromCharCode(65 + reveal.answer)}</> : <>Vaqt tugadi</>}
            </small>
          </div>
          <b className="qz-gain">{outcome === true && you.points ? `+${you.points.total}` : "0"}</b>
        </div>
      )}
      {you && (
        <p className="qz-you-line">
          <Trophy size={15} aria-hidden="true" /> {you.rank}-o‘rin · <b>{formatPoints(you.score)}</b> ball
          {you.streak >= 2 && <span className="qz-streak"><Flame size={14} aria-hidden="true" /> {you.streak}</span>}
        </p>
      )}

      <div className="qz-tally">
        <span className="is-ok"><Check size={14} strokeWidth={3} aria-hidden="true" /> {reveal.correctCount} to‘g‘ri</span>
        <span className="is-bad"><X size={14} strokeWidth={3} aria-hidden="true" /> {reveal.wrongCount} xato</span>
        <span className="is-skip"><Hourglass size={13} aria-hidden="true" /> {reveal.skippedCount} javobsiz</span>
      </div>

      {reveal.fastest.length > 0 && (
        <div className="qz-fastest">
          <h3><Zap size={15} aria-hidden="true" /> Eng tez to‘g‘ri javob berganlar</h3>
          <ol>
            {reveal.fastest.map((f, i) => (
              <li key={f.userId}>
                <span>{i + 1}</span>
                <strong>{f.name}</strong>
                <em>{(f.elapsedMs / 1000).toFixed(1)} s</em>
                <b>+{f.points}</b>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="qz-boardwrap">
        <h3>Umumiy ballar</h3>
        <Standings rows={view.rows} you={you?.userId ?? null} />
      </div>

      {view.isHost ? (
        <button type="button" className="qz-gold" onClick={game.next}>
          {view.last ? "Yakuniy natijalar" : "Keyingi savol"} <ArrowRight size={18} />
        </button>
      ) : (
        <p className="qz-wait" role="status">
          <span className="qz-dots" aria-hidden="true"><i /><i /><i /></span>
          Boshlovchi davom ettirishini kutamiz
        </p>
      )}
    </section>
  );
}

/** Yakun: eng yaxshi uchtalik podiumda va qolganlar ro'yxati. */
function Podium({ view, game, onBack }: { view: GameView; game: Game; onBack: () => void }) {
  const top = view.rows.slice(0, 3);
  // Podium tartibi: 2-o'rin, 1-o'rin, 3-o'rin (o'rtadagi eng baland).
  const stage = [top[1], top[0], top[2]].filter((row): row is GameRow => Boolean(row));
  const you = view.you;
  const celebrate = Boolean(you && you.rank > 0 && you.rank <= 3);
  return (
    <section className="qz-stage qz-podium" aria-labelledby="qz-podium-title">
      <span className="qz-eyebrow">Yakuniy natijalar</span>
      <h2 id="qz-podium-title">{view.title}</h2>
      {celebrate && <span className="qz-sparks qz-sparks-wide" aria-hidden="true"><i /><i /><i /><i /></span>}
      <ol className="qz-steps">
        {stage.map((row) => (
          <li key={row.userId} className={`qz-step-${row.rank}`}>
            <span className="qz-step-name">{row.name}</span>
            <span className="qz-step-score">{formatPoints(row.score)}</span>
            <span className="qz-step-block"><b>{row.rank}</b></span>
          </li>
        ))}
      </ol>
      {view.rows.length > 3 && <Standings rows={view.rows.slice(3)} you={you?.userId ?? null} />}
      {you && (
        <p className="qz-you-line is-final">
          <Sparkles size={15} aria-hidden="true" /> Siz {you.rank}-o‘rindasiz · <b>{formatPoints(you.score)}</b> ball
        </p>
      )}
      {view.isHost && (
        <button type="button" className="qz-gold" onClick={game.reset}>
          <RotateCcw size={18} /> Yangi o‘yin
        </button>
      )}
      <button type="button" className="qz-ghost" onClick={onBack}>
        Viktorinalarga qaytish
      </button>
    </section>
  );
}
