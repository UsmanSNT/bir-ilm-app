/** Suhbat boshlanish hisoblagichi (sof funksiyalar). `node tests/talk-countdown.mjs` */
import assert from "node:assert/strict";
import { countdownParts, countdownShort } from "../app/talk-format.ts";

const T0 = Date.parse("2026-10-04T13:00:00.000Z");
const at = (ms) => new Date(T0).toISOString() && T0 + ms;

// 2 kun 3 soat 4 daqiqa 5 soniya qolgan.
let c = countdownParts(new Date(T0).toISOString(), T0 - ((2 * 24 + 3) * 3600 + 4 * 60 + 5) * 1000);
assert.deepEqual([c.done, c.days, c.hours, c.minutes, c.seconds], [false, 2, 3, 4, 5]);

// 1 soniya qolgan — hali boshlanmagan; ayni vaqtda — boshlangan.
assert.equal(countdownParts(new Date(T0).toISOString(), T0 - 1000).done, false);
assert.equal(countdownParts(new Date(T0).toISOString(), T0 - 1000).seconds, 1);
assert.equal(countdownParts(new Date(T0).toISOString(), T0).done, true);

// Soniyaning bir qismi yuqoriga yaxlitlanadi (0 ko'rsatib turib "boshlandi" demasin).
c = countdownParts(new Date(T0).toISOString(), T0 - 400);
assert.deepEqual([c.done, c.seconds], [false, 1]);

// Kechikish.
c = countdownParts(new Date(T0).toISOString(), T0 + 125_000);
assert.equal(c.done, true);
assert.equal(c.lateMs, 125_000);
assert.equal(countdownParts(new Date(T0).toISOString(), T0 - 5000).lateMs, 0);

// Noto'g'ri sana: yiqilmaydi, "boshlangan" deb hisoblanadi, kechikish 0.
c = countdownParts("sana-emas", T0);
assert.deepEqual([c.done, c.lateMs], [true, 0]);

// Chegara: 59:59 → 1 soat emas, 59 daqiqa 59 soniya; 60:00 → 1 soat.
c = countdownParts(new Date(T0).toISOString(), T0 - 3599_000);
assert.deepEqual([c.hours, c.minutes, c.seconds], [0, 59, 59]);
c = countdownParts(new Date(T0).toISOString(), T0 - 3600_000);
assert.deepEqual([c.hours, c.minutes, c.seconds], [1, 0, 0]);

// Qisqa ko'rinish.
assert.equal(countdownShort(new Date(T0).toISOString(), T0 - 725_000), "12:05");
assert.equal(countdownShort(new Date(T0).toISOString(), T0 - (3600 + 125) * 1000), "01:02:05");
assert.equal(countdownShort(new Date(T0).toISOString(), T0 - (86_400 + 3600) * 1000), "1 kun 01:00:00");
assert.equal(countdownShort(new Date(T0).toISOString(), T0 + 1), "Boshlanishi kutilmoqda");

console.log("PASS: hisoblagich: kun/soat/daqiqa/soniya, chegaralar, kechikish, noto'g'ri sana, qisqa ko'rinish.");
