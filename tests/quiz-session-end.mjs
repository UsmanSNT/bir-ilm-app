/**
 * Jonli viktorina sessiyasini to'xtatish: holat hisobi.
 * Ishga tushirish: `node --experimental-strip-types tests/quiz-session-end.mjs`
 */
import assert from "node:assert/strict";
import { quizSessionStatus } from "../shared/contract/quiz.ts";

const start = Date.parse("2026-11-27T10:00:00.000Z");
const at = (ms) => start + ms;
const MIN = 60_000;

// Oddiy holatlar o'zgarmaydi.
assert.equal(quizSessionStatus(new Date(start).toISOString(), at(-20 * MIN)), "upcoming");
assert.equal(quizSessionStatus(new Date(start).toISOString(), at(-5 * MIN)), "open");
assert.equal(quizSessionStatus(new Date(start).toISOString(), at(200 * MIN)), "closed");

// To'xtatilgan sessiya vaqt oynasi ichida ham darhol yopiq.
const stopped = new Date(at(5 * MIN)).toISOString();
assert.equal(quizSessionStatus(new Date(start).toISOString(), at(4 * MIN), stopped), "open", "to'xtatishdan oldin ochiq");
assert.equal(quizSessionStatus(new Date(start).toISOString(), at(5 * MIN), stopped), "closed", "to'xtatilgan daqiqadan keyin yopiq");
assert.equal(quizSessionStatus(new Date(start).toISOString(), at(6 * MIN), stopped), "closed");

// Hali boshlanmagan sessiya to'xtatilsa ham yopiq.
const future = new Date(start + 60 * MIN).toISOString();
assert.equal(quizSessionStatus(future, at(0), new Date(at(0)).toISOString()), "closed");

// endedAt null bo'lsa eski xatti-harakat saqlanadi.
assert.equal(quizSessionStatus(new Date(start).toISOString(), at(5 * MIN), null), "open");

console.log("PASS: to'xtatilgan sessiya yopiladi; to'xtatilmagan holat o'zgarmaydi.");
console.log("\nHAMMASI O'TDI: viktorina sessiyasini to'xtatish.");
