/**
 * Jonli viktorina o'yini (Kahoot uslubida): hamma bir vaqtda bir savolga javob beradi,
 * vaqt tugagach yoki hamma javob bergach to'g'ri javob, kim qanday javob bergani va ballar ko'rsatiladi.
 *
 * Barcha hisob-kitob SERVERDA: to'g'ri javob savol ochiq turganda mijozga yuborilmaydi,
 * ball esa serverdagi vaqtga qarab hisoblanadi (mijoz o'ziga ball yoza olmaydi).
 * Xabarlar `qz:` prefiksi bilan jonli suhbat xabarlaridan ajratilgan (bitta WebSocket server).
 */
import type { QuestionPoints } from "./quiz";

export type GamePhase = "lobby" | "question" | "reveal" | "ended";

/** Ro'yxatda ko'rinadigan o'yinchilar soni: ko'p bo'lsa, qolgani sanoqda ko'rsatiladi. */
export const GAME_LOBBY_LIST_MAX = 60;
/** Natijalar jadvalida ko'rsatiladigan qatorlar. */
export const GAME_ROWS_MAX = 10;
/** Bitta xonadagi o'yinchilar chegarasi. */
export const GAME_PLAYERS_MAX = 300;
/** Savol vaqti tugagach, tarmoq kechikishi uchun javob qabul qilinadigan qo'shimcha vaqt. */
export const GAME_GRACE_MS = 800;

export type GameClientMessage =
  | { type: "qz:join"; sessionId: string; token: string }
  | { type: "qz:leave" }
  /** `question` — savol tartib raqami (eskirgan javob boshqa savolga yozilmasligi uchun), `choice` — variant raqami. */
  | { type: "qz:answer"; question: number; choice: number }
  /** Boshlovchi: kutish xonasidan birinchi savolga. */
  | { type: "qz:start" }
  /** Boshlovchi: vaqtni kutmay javobni ko'rsatish. */
  | { type: "qz:reveal" }
  /** Boshlovchi: keyingi savol (oxirgisidan keyin — yakuniy natija). */
  | { type: "qz:next" }
  /** Boshlovchi: tugagan o'yindan yangi kutish xonasiga. */
  | { type: "qz:reset" };

export type GameQuestionView = {
  /** 0 dan. */
  index: number;
  prompt: string;
  choices: string[];
  /** Server soati (epoch ms): savol ochilgan va tugaydigan vaqt. */
  startedAt: number;
  endsAt: number;
  limitMs: number;
};

export type GameRow = {
  userId: string;
  name: string;
  rank: number;
  score: number;
  /** Shu savolda olingan ball (javob bermagan yoki xato bo'lsa 0). */
  delta: number;
  /** true — to'g'ri, false — xato, null — javob bermagan. */
  correct: boolean | null;
  streak: number;
};

export type GameFastest = { userId: string; name: string; points: number; elapsedMs: number };

export type GameYou = {
  userId: string;
  rank: number;
  score: number;
  streak: number;
  /** Tanlangan variant (savol ochiq turganda ham o'ziga ko'rinadi, qayta ulanganda tiklanadi). */
  choice: number | null;
  /** Natija bosqichida: to'g'rimi va qancha ball (tezlik + ketma-ket bonus). */
  correct: boolean | null;
  points: QuestionPoints | null;
};

export type GameReveal = {
  /** To'g'ri variant raqami. */
  answer: number;
  /** Har bir variantni tanlaganlar soni. */
  counts: number[];
  correctCount: number;
  wrongCount: number;
  skippedCount: number;
  /** Eng tez to'g'ri javob berganlar (eng ko'pi 5 ta). */
  fastest: GameFastest[];
};

/** Har bir ulanuvchiga alohida tayyorlanadigan to'liq holat. Mijoz uni to'g'ridan-to'g'ri ko'rsatadi. */
export type GameView = {
  phase: GamePhase;
  title: string;
  /** Savollar soni. */
  total: number;
  isHost: boolean;
  hostOnline: boolean;
  /** Xona kodi — faqat boshlovchiga (ekranga chiqarish uchun). */
  code: string | null;
  playerCount: number;
  /** Kutish xonasida o'yinchilar ro'yxati; boshqa bosqichlarda bo'sh. */
  players: { userId: string; name: string }[];
  /** Server vaqti (epoch ms): mijoz soati bilan farqini bilish uchun. */
  now: number;
  question: GameQuestionView | null;
  /** Shu savolga javob berganlar soni. */
  answered: number;
  /** Boshlovchida null. */
  you: GameYou | null;
  /** Faqat natija bosqichida (`reveal`, oxirgi savoldan keyin ham). */
  reveal: GameReveal | null;
  /** Natija bosqichi va yakunda: ballar jadvali (eng yaxshi 10 ta). */
  rows: GameRow[];
  /** Natija bosqichida: bu oxirgi savolmi (keyingi tugma «Natijalar» bo'ladi). */
  last: boolean;
};

export type GameServerMessage =
  | { type: "qz:view"; view: GameView }
  | { type: "qz:progress"; answered: number; playerCount: number }
  /** Javobingiz qabul qilindi. */
  | { type: "qz:ack"; question: number; choice: number }
  /** `fatal` — qayta ulanishning foydasi yo'q (kirish yopiq, hisob kerak va h.k.). */
  | { type: "qz:error"; message: string; fatal?: boolean }
  | { type: "qz:kicked"; reason: "replaced" };
