/**
 * Jonli viktorina motori testi (soxta soat bilan, soket va bazasiz).
 * Ishga tushirish: `node tests/quiz-game-engine.mjs`
 */
import assert from "node:assert/strict";
import { statSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

const projectRoot = new URL("../", import.meta.url);

function isFile(url) {
  try {
    return statSync(fileURLToPath(url)).isFile();
  } catch {
    return false;
  }
}

function withExtension(url) {
  if (isFile(url)) return url;
  for (const candidate of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const attempt = `${url}${candidate}`;
    if (isFile(attempt)) return attempt;
  }
  return url;
}

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("@/")) return next(withExtension(new URL(specifier.slice(2), projectRoot).href), context);
    if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) return next(withExtension(new URL(specifier, context.parentURL).href), context);
    return next(specifier, context);
  },
});

const load = (path) => import(new URL(path, projectRoot).href);
const { QuizGame, GameError } = await load("server/services/quiz-game-engine.ts");
const { questionPoints, quizScoreBounds, QUIZ_POINTS } = await load("shared/contract/quiz.ts");

// ── Ball formulasi ──────────────────────────────────────────────────
{
  const L = QUIZ_POINTS.limitMs;
  assert.deepEqual(questionPoints(true, 0, 1), { base: 1000, bonus: 0, total: 1000 }, "Zumda javob — 1000");
  assert.equal(questionPoints(true, L / 2, 1).total, 750, "Vaqtning yarmida — 750");
  assert.equal(questionPoints(true, L, 1).total, 500, "Oxirgi soniyada — 500");
  assert.equal(questionPoints(true, L * 5, 1).total, 500, "Vaqtdan oshsa ham 500 dan pastga tushmaydi");
  assert.equal(questionPoints(true, Number.NaN, 1).total, 500, "Noto'g'ri vaqt eng kam ball beradi");
  assert.equal(questionPoints(false, 0, 3).total, 0, "Xato javob — 0");
  assert.deepEqual(questionPoints(true, 0, 2), { base: 1000, bonus: 50, total: 1050 }, "Ikkinchi ketma-ket: +50");
  assert.equal(questionPoints(true, 0, 6).bonus, 250, "Bonus +250 da to'xtaydi");
  assert.equal(questionPoints(true, 0, 40).bonus, 250);
  assert.deepEqual(quizScoreBounds(0), { min: 0, max: 0 });
  assert.deepEqual(quizScoreBounds(2), { min: 1000, max: 1000 + 1050 });
  console.log("PASS: Ball: 500–1000 tezlikka qarab, ketma-ket bonus +50…+250, xato 0, oraliq to'g'ri.");
}

// ── Soxta soat va yig'uvchi kancalar ────────────────────────────────
function makeClock() {
  let now = 1_000_000;
  let nextId = 1;
  const timers = new Map();
  return {
    now: () => now,
    setTimeout: (fn, ms) => { const id = nextId++; timers.set(id, { at: now + ms, fn }); return id; },
    clearTimeout: (id) => { timers.delete(id); },
    advance(ms) {
      const target = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = target;
    },
    pending: () => timers.size,
  };
}

function makeGame() {
  const clock = makeClock();
  const log = { phase: 0, roster: 0, progress: 0, results: null };
  const game = new QuizGame(
    { sessionId: "qs_test", quizId: "qz_test", title: "Sinov", code: "123456", total: 3 },
    {
      onPhase: () => { log.phase++; },
      onRoster: () => { log.roster++; },
      onProgress: () => { log.progress++; },
      onResults: (results, total) => { log.results = { results, total }; },
    },
    clock,
  );
  return { game, clock, log };
}

const quiz = {
  title: "Atom odatlar",
  questions: [
    { prompt: "1-savol", choices: ["a", "b", "c"], answer: 1 },
    { prompt: "2-savol", choices: ["a", "b"], answer: 0 },
    { prompt: "3-savol", choices: ["a", "b", "c", "d"], answer: 3 },
  ],
};
const throwsGame = (fn, re) => assert.throws(fn, (e) => e instanceof GameError && re.test(e.message));
const L = QUIZ_POINTS.limitMs;

// ── Kutish xonasi ───────────────────────────────────────────────────
{
  const { game } = makeGame();
  game.join("host", "Boshlovchi", true);
  game.join("ali", "Ali", false);
  game.join("vali", "Vali", false);
  let v = game.view("ali", false);
  assert.equal(v.phase, "lobby");
  assert.equal(v.playerCount, 2);
  assert.deepEqual(v.players.map((p) => p.name), ["Ali", "Vali"], "Boshlovchi o'yinchilar ro'yxatida emas");
  assert.equal(v.code, null, "Kodni faqat boshlovchi ko'radi");
  assert.equal(game.view("host", true).code, "123456");
  assert.equal(v.you.score, 0);
  assert.equal(game.view("host", true).you, null, "Boshlovchining «you»si yo'q");
  throwsGame(() => game.start(false, quiz), /boshlovchi/i);
  const empty = makeGame();
  empty.game.join("host", "B", true);
  throwsGame(() => empty.game.start(true, quiz), /kamida bitta/i);
  console.log("PASS: Kutish xonasi: ro'yxat, kod faqat boshlovchiga, o'yinchisiz yoki boshlovchisiz boshlanmaydi.");
}

// ── To'liq o'yin: tezlik, ketma-ket bonus, tartib ───────────────────
{
  const { game, clock, log } = makeGame();
  game.join("host", "Boshlovchi", true);
  game.join("ali", "Ali", false);
  game.join("vali", "Vali", false);
  game.join("gul", "Gul", false);
  game.start(true, quiz);
  assert.equal(game.phase, "question");

  // Savol ochiq: to'g'ri javob hech kimga ko'rinmaydi.
  for (const [id, host] of [["ali", false], ["host", true]]) {
    const view = game.view(id, host);
    assert.equal(view.question.index, 0);
    assert.equal(view.reveal, null);
    assert.ok(!JSON.stringify(view).includes('"answer"'), "Savol paytida to'g'ri javob yuborilmaydi");
    assert.equal(view.rows.length, 0);
  }

  // 1-savol (to'g'ri: 1). Ali 2 soniyada, Vali 10 soniyada to'g'ri, Gul xato.
  clock.advance(2_000);
  assert.equal(game.answer("ali", 0, 1), true);
  assert.equal(game.answer("ali", 0, 0), false, "Ikkinchi javob e'tiborga olinmaydi");
  assert.equal(game.view("ali", false).you.choice, 1);
  assert.equal(game.view("ali", false).you.correct, null, "Natija ochilmaguncha to'g'ri/xato bilinmaydi");
  clock.advance(8_000);
  game.answer("vali", 0, 1);
  assert.equal(game.phase, "question", "Hamma javob bermaguncha natija ochilmaydi");
  assert.deepEqual(game.progress(), { answered: 2, playerCount: 3 });
  throwsGame(() => game.answer("gul", 1, 0), /yopilgan/i);
  throwsGame(() => game.answer("gul", 0, 9), /noto'g'ri/i);
  throwsGame(() => game.answer("host", 0, 0), /boshlovchi/i);
  clock.advance(1_000);
  game.answer("gul", 0, 2);
  assert.equal(game.phase, "reveal", "Oxirgi o'yinchi javob berishi bilan natija ochiladi");
  assert.equal(clock.pending(), 0, "Natijadan keyin savol taymeri qolmaydi");

  let v = game.view("ali", false);
  assert.equal(v.reveal.answer, 1);
  assert.deepEqual(v.reveal.counts, [0, 2, 1]);
  assert.equal(v.reveal.correctCount, 2);
  assert.equal(v.reveal.wrongCount, 1);
  assert.equal(v.you.correct, true);
  assert.deepEqual(v.you.points, { base: 950, bonus: 0, total: 950 }, "2 soniya: 1000 − 500·(2/20) = 950");
  assert.equal(v.reveal.fastest[0].name, "Ali");
  assert.equal(game.view("gul", false).you.correct, false);
  assert.equal(game.view("gul", false).you.points.total, 0);
  assert.deepEqual(v.rows.map((r) => [r.name, r.rank, r.score]), [["Ali", 1, 950], ["Vali", 2, 750], ["Gul", 3, 0]]);
  console.log("PASS: 1-savol: tezroq javob ko'proq ball, xato 0, javobni o'zgartirib bo'lmaydi, natija hamma javob berganda ochiladi.");

  // 2-savol (to'g'ri: 0). Ali yana to'g'ri (ketma-ket), Vali javob bermaydi, Gul to'g'ri.
  game.next(true);
  assert.equal(game.phase, "question");
  assert.equal(game.view("ali", false).you.choice, null, "Yangi savolda eski javob tozalanadi");
  game.answer("ali", 1, 0);
  game.answer("gul", 1, 0);
  clock.advance(L + 799);
  assert.equal(game.phase, "question", "Vaqt + kechikish zahirasi tugamaguncha natija ochilmaydi");
  clock.advance(1);
  assert.equal(game.phase, "reveal", "Vaqt tugasa, javob bermaganlarsiz ham natija ochiladi");
  v = game.view("vali", false);
  assert.equal(v.you.correct, null, "Javob bermagan — null");
  assert.equal(v.reveal.skippedCount, 1);
  v = game.view("ali", false);
  assert.equal(v.you.points.bonus, 50, "Ketma-ket ikkinchi to'g'ri javob: +50");
  assert.equal(game.view("gul", false).you.points.bonus, 0, "Gulning seriyasi 1-savolda xato bilan uzilgan");
  assert.equal(game.view("vali", false).you.streak, 0, "Javob bermagan o'yinchining seriyasi uziladi");
  assert.equal(log.results, null, "Oxirgi savolgacha natija saqlanmaydi");
  console.log("PASS: 2-savol: vaqt tugashi, javobsiz o'yinchi 0 ball va seriyasi uzilishi, ketma-ket bonus.");

  // 3-savol (oxirgi, to'g'ri: 3): hamma xato yoki javobsiz; boshlovchi vaqtni kutmay ochadi.
  game.next(true);
  game.answer("ali", 2, 3);
  assert.equal(game.phase, "question");
  throwsGame(() => game.next(true), /avval/i);
  throwsGame(() => game.revealByHost(false), /boshlovchi/i);
  game.revealByHost(true);
  assert.equal(game.phase, "reveal");
  assert.equal(game.view("ali", false).last, true);
  assert.ok(log.results, "Oxirgi savol ochilishi bilan yakuniy natija saqlashga beriladi");
  assert.equal(log.results.total, 3);
  const byUser = Object.fromEntries(log.results.results.map((r) => [r.userId, r]));
  assert.equal(byUser.ali.correct, 3);
  assert.equal(byUser.vali.correct, 1);
  assert.equal(byUser.gul.correct, 1);
  // Ali: 950 + (1000 + 50) + (1000 + 100); Vali: faqat 1-savol (10 soniyada) = 750; Gul: faqat 2-savol (zumda) = 1000.
  assert.equal(byUser.ali.score, 950 + 1050 + 1100);
  assert.equal(byUser.vali.score, 750);
  assert.equal(byUser.gul.score, 1000);
  game.next(true);
  assert.equal(game.phase, "ended");
  v = game.view("ali", false);
  assert.equal(v.rows[0].name, "Ali");
  assert.equal(v.you.rank, 1);
  assert.equal(v.reveal, null);
  console.log("PASS: Oxirgi savol: boshlovchi vaqtni kutmay ochadi, yakuniy natija bir marta saqlashga beriladi, o'rinlar to'g'ri.");

  // Yangi o'yin: o'yinchilar qoladi, ballar nollanadi.
  throwsGame(() => game.reset(false), /boshlovchi/i);
  game.reset(true);
  assert.equal(game.phase, "lobby");
  assert.equal(game.view("ali", false).you.score, 0);
  assert.equal(game.view("ali", false).players.length, 3);
  console.log("PASS: «Yangi o'yin»: o'yinchilar saqlanadi, ballar nollanadi.");
}

// ── Qayta ulanish, ulanishi uzilganlar, kech kelganlar ──────────────
{
  const { game } = makeGame();
  game.join("host", "B", true);
  game.join("ali", "Ali", false);
  game.join("vali", "Vali", false);
  game.start(true, quiz);
  game.answer("ali", 0, 1);
  // Vali ulanishi uzildi: Ali javob bergan, shuning uchun kutilmaydi.
  game.leave("vali", false);
  assert.equal(game.phase, "reveal", "Javob bermagan o'yinchi chiqib ketsa, qolganlar kutmaydi");
  game.next(true);
  game.answer("ali", 1, 0);
  assert.equal(game.phase, "reveal", "Faqat ulangan o'yinchilar hisobga olinadi");
  // Vali qaytdi: ballari saqlangan.
  game.join("vali", "Vali", false);
  assert.equal(game.view("vali", false).you.score, 0);
  assert.equal(game.view("ali", false).you.score > 1000, true);
  // Kech kelgan yangi o'yinchi 3-savolga javob bera oladi.
  game.next(true);
  game.join("zafar", "Zafar", false);
  assert.equal(game.view("zafar", false).question.index, 2);
  assert.equal(game.answer("zafar", 2, 3), true);
  // Qayta ulangan o'yinchi tanlagan javobini ko'radi.
  assert.equal(game.view("zafar", false).you.choice, 3);
  console.log("PASS: Ulanishi uzilganlar kutilmaydi, ballar qaytganda saqlanadi, kech kelgan qatnashadi, javob qayta ulanganda tiklanadi.");
}

// ── Chegaralar va tenglik ───────────────────────────────────────────
{
  const { game } = makeGame();
  game.join("host", "B", true);
  for (let i = 0; i < 300; i++) game.join(`u${i}`, `U${i}`, false);
  assert.throws(() => game.join("extra", "Extra", false), (e) => e instanceof GameError && /to'lgan/.test(e.message));
  game.join("u5", "Qayta", false); // mavjud o'yinchi qayta kirishi mumkin
  assert.equal(game.view("u5", false).you.rank, 0);

  const tie = makeGame();
  tie.game.join("host", "B", true);
  for (const id of ["a", "b", "c"]) tie.game.join(id, id.toUpperCase(), false);
  tie.game.start(true, quiz);
  tie.game.answer("a", 0, 1);
  tie.game.answer("b", 0, 1);
  tie.game.answer("c", 0, 0);
  // a va b bir xil zumda javob bergan: teng ball, teng o'rin.
  const ranks = tie.game.view("c", false).rows.map((r) => [r.name, r.rank]);
  assert.deepEqual(ranks, [["A", 1], ["B", 1], ["C", 3]]);
  console.log("PASS: Xona 300 o'yinchi bilan cheklangan; teng ball bir xil o'rin (1, 1, 3).");
}

console.log("\nHAMMASI O'TDI: viktorina o'yini motori.");
