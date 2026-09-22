export type Chapter = {
  title: string;
  seconds: number;
  page: number;
};

export type LibraryMeta = {
  id: string;
  audio: boolean;
  text: boolean;
  totalSeconds: number;
  sizeMb: number;
  fresh?: boolean;
  highlight?: boolean;
  chapters: Chapter[];
  sample: string[];
};

const sample = [
  "Har kuni mutolaa uchun ozgina vaqt ajrating. Bir necha sahifa ham yangi fikrlar bilan tanishish uchun imkon beradi. Muhimi, bu vaqtni o‘zingiz uchun qadrlashdir.",
  "Mutolaa bizga o‘ylash, anglash va o‘zimiz bilan samimiy suhbatlashish imkonini beradi. Kichik qadamlar ham katta o‘zgarishlar sari olib borishi mumkin. Asosiysi, muntazamlik va qiziqishdir.",
];

export const library: LibraryMeta[] = [
  {
    id: "atomic-habits",
    audio: true,
    text: true,
    totalSeconds: 12 * 3600 + 28 * 60,
    sizeMb: 180,
    highlight: true,
    chapters: [
      { title: "Yaxshiroq hayot sari", seconds: 8 * 60 + 24, page: 1 },
      { title: "Odatlar qanday ishlaydi?", seconds: 10 * 60 + 15, page: 12 },
      { title: "Kichik qadamlar", seconds: 28 * 60 + 10, page: 24 },
      { title: "Odatni takrorlash", seconds: 12 * 60 + 8, page: 86 },
    ],
    sample,
  },
  {
    id: "otkan-kunlar",
    audio: true,
    text: true,
    totalSeconds: 20 * 3600 + 16 * 60,
    sizeMb: 160,
    highlight: true,
    chapters: [
      { title: "Toshkentda tong", seconds: 20 * 60 + 16, page: 1 },
      { title: "Mehmondorchilik", seconds: 16 * 60 + 40, page: 48 },
      { title: "Yo‘lga chiqish", seconds: 18 * 60 + 5, page: 120 },
    ],
    sample,
  },
  {
    id: "dunyoning-ishlari",
    audio: true,
    text: true,
    totalSeconds: 10 * 3600 + 42 * 60,
    sizeMb: 140,
    highlight: true,
    chapters: [
      { title: "Kundalik savol", seconds: 10 * 60 + 42, page: 1 },
      { title: "Tanlov narxi", seconds: 12 * 60 + 20, page: 40 },
      { title: "Ertangi qadam", seconds: 9 * 60 + 15, page: 90 },
    ],
    sample,
  },
  {
    id: "alchemist",
    audio: true,
    text: true,
    totalSeconds: 7 * 3600 + 36 * 60,
    sizeMb: 110,
    highlight: true,
    chapters: [
      { title: "Tush va yo‘l", seconds: 7 * 60 + 36, page: 1 },
      { title: "Cho‘l karvoni", seconds: 14 * 60 + 10, page: 36 },
      { title: "Xazina", seconds: 11 * 60 + 2, page: 88 },
    ],
    sample,
  },
  {
    id: "kecha-va-kunduz",
    audio: true,
    text: true,
    totalSeconds: 18 * 3600 + 40 * 60,
    sizeMb: 130,
    highlight: true,
    chapters: [
      { title: "Tong oldidan", seconds: 18 * 60 + 40, page: 1 },
      { title: "Shahar ovozi", seconds: 15 * 60 + 12, page: 54 },
      { title: "Kunduz", seconds: 13 * 60 + 48, page: 140 },
    ],
    sample,
  },
  {
    id: "mehrobdan-chayon",
    audio: true,
    text: true,
    totalSeconds: 18 * 3600 + 40 * 60,
    sizeMb: 120,
    highlight: true,
    chapters: [
      { title: "Hovli", seconds: 18 * 60 + 40, page: 1 },
      { title: "Xat", seconds: 12 * 60 + 30, page: 62 },
      { title: "Qaror", seconds: 16 * 60 + 5, page: 150 },
    ],
    sample,
  },
  {
    id: "ikigai",
    audio: true,
    text: true,
    totalSeconds: 5 * 3600 + 12 * 60,
    sizeMb: 86,
    fresh: true,
    chapters: [
      { title: "Maqsad", seconds: 9 * 60 + 20, page: 1 },
      { title: "Kundalik ritm", seconds: 11 * 60, page: 30 },
    ],
    sample,
  },
  {
    id: "deep-work",
    audio: true,
    text: true,
    totalSeconds: 8 * 3600 + 4 * 60,
    sizeMb: 102,
    fresh: true,
    chapters: [
      { title: "Chuqur ish", seconds: 12 * 60 + 40, page: 1 },
      { title: "E’tibor", seconds: 10 * 60 + 5, page: 28 },
    ],
    sample,
  },
  {
    id: "money-psychology",
    audio: false,
    text: true,
    totalSeconds: 0,
    sizeMb: 18,
    fresh: true,
    chapters: [{ title: "Yetarli degan narsa", seconds: 0, page: 1 }],
    sample,
  },
  {
    id: "1984",
    audio: false,
    text: true,
    totalSeconds: 0,
    sizeMb: 22,
    chapters: [{ title: "Kundalik", seconds: 0, page: 1 }],
    sample,
  },
];

export type Spot = { chapter: number; at: number };

export const seedProgress: Record<string, Spot> = {
  "atomic-habits": { chapter: 2, at: 12 * 60 + 34 },
  "otkan-kunlar": { chapter: 0, at: 6 * 60 + 20 },
  "dunyoning-ishlari": { chapter: 0, at: 10 * 60 },
  alchemist: { chapter: 0, at: 3 * 60 + 15 },
  "kecha-va-kunduz": { chapter: 0, at: 5 * 60 + 10 },
  "mehrobdan-chayon": { chapter: 0, at: 8 * 60 },
};

export const seedDownloads = library.filter((item) => item.highlight).map((item) => item.id);

export function clock(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  return `${mins}:${String(safe % 60).padStart(2, "0")}`;
}

export function lengthLabel(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  if (hours <= 0) return `${mins} daq`;
  return `${hours}s ${mins} daq`;
}
