/**
 * Jonli viktorina o'yinining motori: kutish xonasi → savol → natija → … → yakun.
 *
 * Bu fayl soket va bazadan mustaqil (faqat holat va qoidalar), shuning uchun soxta soat bilan to'liq
 * sinab ko'rish mumkin. Soket ulanishi, bazaga yozish va xona ro'yxati `quiz-game.ts` va `server/ws` da.
 *
 * Qoidalar:
 *  - o'yinni faqat boshlovchi (admin/moderator) boshqaradi; boshlovchi o'ynamaydi;
 *  - savol ochiq turganda to'g'ri javob hech kimga yuborilmaydi;
 *  - javob vaqti SERVER soati bo'yicha o'lchanadi; birinchi javob qoladi, o'zgartirib bo'lmaydi;
 *  - hamma (ulangan o'yinchilar) javob bersa yoki vaqt tugasa — natija ko'rsatiladi;
 *  - javob bermagan o'yinchining ketma-ket seriyasi uziladi;
 *  - ulanishi uzilgan o'yinchining balli saqlanadi, qaytib kirsa davom etadi.
 */
import {
  GAME_GRACE_MS,
  GAME_LOBBY_LIST_MAX,
  GAME_PLAYERS_MAX,
  GAME_ROWS_MAX,
  QUIZ_POINTS,
  questionPoints,
  type GameFastest,
  type GamePhase,
  type GameReveal,
  type GameRow,
  type GameView,
  type GameYou,
  type QuestionPoints,
} from "@/shared/contract";

export class GameError extends Error {}

export type Clock = {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
};

export const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export type GameQuestion = { prompt: string; choices: string[]; answer: number };
export type GameResult = { userId: string; score: number; correct: number };

export type GameHooks = {
  /** Bosqich o'zgardi (savol, natija, yakun): hamma ulanuvchiga yangi holat yuboriladi. */
  onPhase(): void;
  /** Kutish xonasi ro'yxati yoki boshlovchi holati o'zgardi (tez-tez bo'lishi mumkin: chaqiruvchi yig'ib yuborsin). */
  onRoster(): void;
  /** Javob berganlar soni o'zgardi. */
  onProgress(): void;
  /** Oxirgi savol ochilgach, natijalar yakuniy: saqlash uchun. */
  onResults(results: GameResult[], total: number): void;
};

export type GameInfo = { sessionId: string; quizId: string; title: string; code: string | null; total: number };

const NO_POINTS: QuestionPoints = { base: 0, bonus: 0, total: 0 };
const NAME_MAX = 40;

type Player = {
  userId: string;
  name: string;
  online: boolean;
  score: number;
  correct: number;
  streak: number;
  /** Joriy savol: tanlangan variant va javob vaqti. */
  choice: number | null;
  elapsedMs: number | null;
  /** Joriy savol natijasi (natija bosqichidan keyin to'ldiriladi). */
  outcome: { correct: boolean | null; points: QuestionPoints } | null;
};

export class QuizGame {
  phase: GamePhase = "lobby";
  /** Oxirgi harakat vaqti: eskirgan xonalarni tozalash uchun. */
  lastActivity: number;

  private questions: GameQuestion[] = [];
  private index = -1;
  private startedAt = 0;
  private endsAt = 0;
  private readonly players = new Map<string, Player>();
  private readonly hosts = new Set<string>();
  private timer: unknown = null;
  private reveal: GameReveal | null = null;
  private rows: GameRow[] = [];
  private ranks = new Map<string, number>();
  private resultsSent = false;

  readonly info: GameInfo;
  private readonly hooks: GameHooks;
  private readonly clock: Clock;

  // Konstruktor parametr xususiyatlari (`private x`) ishlatilmaydi: WS serveri bu faylni Node'ning
  // «faqat turlarni olib tashlash» rejimida ishga tushiradi va u bunday sintaksisni qo'llamaydi.
  constructor(info: GameInfo, hooks: GameHooks, clock: Clock = realClock) {
    this.info = info;
    this.hooks = hooks;
    this.clock = clock;
    this.lastActivity = clock.now();
  }

  // ── Ulanish ─────────────────────────────────────────────────────

  /** Boshlovchi yoki o'yinchi xonaga kirdi (qayta ulanish ham shu). */
  join(userId: string, name: string, host: boolean): void {
    this.touch();
    if (host) {
      this.hosts.add(userId);
    } else {
      const existing = this.players.get(userId);
      if (existing) {
        existing.online = true;
        existing.name = cleanName(name);
      } else {
        if (this.players.size >= GAME_PLAYERS_MAX) throw new GameError("Xona to'lgan.");
        this.players.set(userId, { userId, name: cleanName(name), online: true, score: 0, correct: 0, streak: 0, choice: null, elapsedMs: null, outcome: null });
        if (this.phase === "reveal" || this.phase === "ended") this.rank();
      }
    }
    this.hooks.onRoster();
  }

  /** Ulanish uzildi. O'yinchining balli saqlanadi. */
  leave(userId: string, host: boolean): void {
    this.touch();
    if (host) {
      this.hosts.delete(userId);
    } else {
      const player = this.players.get(userId);
      if (!player) return;
      player.online = false;
    }
    this.hooks.onRoster();
    // Javob bermay qolgan oxirgi o'yinchi chiqib ketsa, qolganlar kutib o'tirmasin.
    if (this.phase === "question" && this.allAnswered()) this.revealNow();
  }

  // ── Boshlovchi buyruqlari ───────────────────────────────────────

  start(host: boolean, quiz: { title: string; questions: GameQuestion[] }): void {
    this.requireHost(host);
    if (this.phase !== "lobby") throw new GameError("O'yin allaqachon boshlangan.");
    if (this.onlineCount() < 1) throw new GameError("Boshlash uchun kamida bitta o'yinchi kerak.");
    if (quiz.questions.length < 1) throw new GameError("Viktorinada savol yo'q.");
    this.questions = quiz.questions;
    this.info.title = quiz.title;
    this.info.total = quiz.questions.length;
    this.openQuestion(0);
  }

  /** Vaqtni kutmay javobni ko'rsatish. */
  revealByHost(host: boolean): void {
    this.requireHost(host);
    if (this.phase !== "question") throw new GameError("Hozir ochiq savol yo'q.");
    this.revealNow();
  }

  next(host: boolean): void {
    this.requireHost(host);
    if (this.phase !== "reveal") throw new GameError("Avval javob ko'rsatilishini kuting.");
    this.touch();
    if (this.index >= this.questions.length - 1) {
      this.phase = "ended";
      this.hooks.onPhase();
    } else {
      this.openQuestion(this.index + 1);
    }
  }

  /** Tugagan o'yindan yangi kutish xonasiga: o'yinchilar qoladi, ballar nollanadi. */
  reset(host: boolean): void {
    this.requireHost(host);
    if (this.phase !== "ended") throw new GameError("Yangi o'yin faqat tugagandan keyin boshlanadi.");
    this.touch();
    this.clearTimer();
    for (const player of this.players.values()) {
      Object.assign(player, { score: 0, correct: 0, streak: 0, choice: null, elapsedMs: null, outcome: null });
    }
    this.phase = "lobby";
    this.index = -1;
    this.reveal = null;
    this.rows = [];
    this.ranks.clear();
    this.resultsSent = false;
    this.hooks.onPhase();
  }

  // ── O'yinchi javobi ─────────────────────────────────────────────

  /** `true` — javob qabul qilindi, `false` — avval javob berilgan (e'tiborsiz qoldirildi). */
  answer(userId: string, question: number, choice: number): boolean {
    const player = this.players.get(userId);
    if (!player) throw new GameError("Boshlovchi javob bermaydi.");
    if (this.phase !== "question" || question !== this.index) throw new GameError("Bu savol yopilgan.");
    const q = this.questions[this.index];
    if (!Number.isInteger(choice) || choice < 0 || choice >= q.choices.length) throw new GameError("Variant noto'g'ri.");
    if (player.choice !== null) return false;
    const now = this.clock.now();
    if (now > this.endsAt + GAME_GRACE_MS) throw new GameError("Vaqt tugadi.");
    this.touch();
    player.choice = choice;
    player.elapsedMs = Math.min(QUIZ_POINTS.limitMs, Math.max(0, now - this.startedAt));
    this.hooks.onProgress();
    if (this.allAnswered()) this.revealNow();
    return true;
  }

  // ── Holat ───────────────────────────────────────────────────────

  progress(): { answered: number; playerCount: number } {
    return { answered: this.answeredCount(), playerCount: this.onlineCount() };
  }

  hostOnline(): boolean {
    return this.hosts.size > 0;
  }

  /** `userId` ga mos holat. To'g'ri javob faqat natija bosqichida chiqadi. */
  view(userId: string, host: boolean): GameView {
    const showQuestion = this.phase === "question" || this.phase === "reveal";
    const q = showQuestion ? this.questions[this.index] : null;
    const resultsOut = this.phase === "reveal" || this.phase === "ended";
    const player = host ? undefined : this.players.get(userId);
    const you: GameYou | null = player
      ? {
          userId,
          rank: this.ranks.get(userId) ?? 0,
          score: player.score,
          streak: player.streak,
          choice: showQuestion ? player.choice : null,
          correct: this.phase === "reveal" ? (player.outcome?.correct ?? null) : null,
          points: this.phase === "reveal" ? (player.outcome?.points ?? NO_POINTS) : null,
        }
      : null;
    return {
      phase: this.phase,
      title: this.info.title,
      total: this.info.total,
      isHost: host,
      hostOnline: this.hostOnline(),
      code: host ? this.info.code : null,
      playerCount: this.onlineCount(),
      players: this.phase === "lobby" ? this.lobbyList() : [],
      now: this.clock.now(),
      question: q
        ? { index: this.index, prompt: q.prompt, choices: q.choices, startedAt: this.startedAt, endsAt: this.endsAt, limitMs: QUIZ_POINTS.limitMs }
        : null,
      answered: showQuestion ? this.answeredCount() : 0,
      you,
      reveal: this.phase === "reveal" ? this.reveal : null,
      rows: resultsOut ? this.rows : [],
      last: this.phase === "reveal" && this.index >= this.questions.length - 1,
    };
  }

  dispose(): void {
    this.clearTimer();
  }

  // ── Ichki ───────────────────────────────────────────────────────

  private requireHost(host: boolean) {
    if (!host) throw new GameError("O'yinni faqat boshlovchi boshqaradi.");
  }

  private touch() {
    this.lastActivity = this.clock.now();
  }

  private clearTimer() {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
  }

  private onlineCount(): number {
    let n = 0;
    for (const p of this.players.values()) if (p.online) n++;
    return n;
  }

  private answeredCount(): number {
    let n = 0;
    for (const p of this.players.values()) if (p.choice !== null) n++;
    return n;
  }

  /** Ulangan o'yinchilarning hammasi javob berdimi (ulangan o'yinchi bo'lmasa — yo'q). */
  private allAnswered(): boolean {
    let online = 0;
    for (const p of this.players.values()) {
      if (!p.online) continue;
      online++;
      if (p.choice === null) return false;
    }
    return online > 0;
  }

  private lobbyList(): { userId: string; name: string }[] {
    const list: { userId: string; name: string }[] = [];
    for (const p of this.players.values()) {
      if (!p.online) continue;
      list.push({ userId: p.userId, name: p.name });
      if (list.length >= GAME_LOBBY_LIST_MAX) break;
    }
    return list;
  }

  private openQuestion(index: number) {
    this.clearTimer();
    this.index = index;
    this.startedAt = this.clock.now();
    this.endsAt = this.startedAt + QUIZ_POINTS.limitMs;
    this.reveal = null;
    for (const p of this.players.values()) {
      p.choice = null;
      p.elapsedMs = null;
      p.outcome = null;
    }
    this.phase = "question";
    this.timer = this.clock.setTimeout(() => this.revealNow(), QUIZ_POINTS.limitMs + GAME_GRACE_MS);
    this.touch();
    this.hooks.onPhase();
  }

  /** Savolni yopib, har bir o'yinchining javobini baholaydi va ballarni qo'shadi. */
  private revealNow() {
    if (this.phase !== "question") return;
    this.clearTimer();
    this.touch();
    const q = this.questions[this.index];
    const counts = q.choices.map(() => 0);
    const fastest: GameFastest[] = [];
    let correctCount = 0;
    let wrongCount = 0;
    let skippedCount = 0;
    for (const p of this.players.values()) {
      if (p.choice === null) {
        p.streak = 0;
        p.outcome = { correct: null, points: NO_POINTS };
        skippedCount++;
        continue;
      }
      counts[p.choice]++;
      if (p.choice === q.answer) {
        p.streak++;
        p.correct++;
        const points = questionPoints(true, p.elapsedMs ?? QUIZ_POINTS.limitMs, p.streak);
        p.score += points.total;
        p.outcome = { correct: true, points };
        correctCount++;
        fastest.push({ userId: p.userId, name: p.name, points: points.total, elapsedMs: p.elapsedMs ?? QUIZ_POINTS.limitMs });
      } else {
        p.streak = 0;
        p.outcome = { correct: false, points: NO_POINTS };
        wrongCount++;
      }
    }
    fastest.sort((a, b) => a.elapsedMs - b.elapsedMs);
    this.reveal = { answer: q.answer, counts, correctCount, wrongCount, skippedCount, fastest: fastest.slice(0, 5) };
    this.rank();
    this.phase = "reveal";
    // Oxirgi savoldan keyin natijalar yakuniy: boshlovchi tugmani bosishini kutmasdan saqlanadi.
    if (this.index >= this.questions.length - 1) this.sendResults();
    this.hooks.onPhase();
  }

  /** Ballar bo'yicha tartib; teng ballar bir xil o'rinni egallaydi (1, 2, 2, 4). */
  private rank() {
    const sorted = [...this.players.values()].sort((a, b) => b.score - a.score || b.correct - a.correct || a.name.localeCompare(b.name));
    this.ranks.clear();
    const rows: GameRow[] = [];
    let rank = 0;
    let prev = -1;
    sorted.forEach((p, i) => {
      if (p.score !== prev) {
        rank = i + 1;
        prev = p.score;
      }
      this.ranks.set(p.userId, rank);
      if (i < GAME_ROWS_MAX) {
        rows.push({ userId: p.userId, name: p.name, rank, score: p.score, delta: p.outcome?.points.total ?? 0, correct: p.outcome?.correct ?? null, streak: p.streak });
      }
    });
    this.rows = rows;
  }

  private sendResults() {
    if (this.resultsSent) return;
    this.resultsSent = true;
    const results = [...this.players.values()].map((p) => ({ userId: p.userId, score: p.score, correct: p.correct }));
    this.hooks.onResults(results, this.questions.length);
  }
}

function cleanName(name: string): string {
  const trimmed = name.trim().slice(0, NAME_MAX);
  return trimmed || "Kitobxon";
}
