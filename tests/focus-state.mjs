import assert from "node:assert/strict";
import { finishPhase } from "../app/focus-state.ts";

const original = { minutes: 25, remaining: 1, endAt: 1000, sessionId: "work-session", pending: [] };
const work = finishPhase(original);
assert.equal(work.next.phase, "break");
assert.equal(work.next.remaining, 300);
assert.equal(work.next.endAt, null);
assert.deepEqual(work.completed, { sessionId: "work-session", minutes: 25 });
const rest = finishPhase({ ...work.next, endAt: 2000 });
assert.equal(rest.completed, undefined);
assert.equal(rest.next.minutes, 25);
assert.equal(rest.next.remaining, 1500);
assert.equal(rest.next.pending.length, 1);
assert.equal(rest.next.endAt, null);
assert.equal(finishPhase(finishPhase({ ...original, minutes: 45 }).next).next.minutes, 45);
assert.equal(original.pending.length, 0);
console.log("PASS: work-to-break, break-to-work, no break credit, duration retained, no auto-start.");
