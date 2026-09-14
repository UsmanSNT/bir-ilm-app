export type Book = {
  id: string;
  title: string;
  author: string;
  summary: string;
  color: string;
  pages: number;
};

export type CommunityComment = {
  id: number;
  name: string;
  text: string;
  demo?: boolean;
  createdAt?: string;
};

export type LeaderboardMember = {
  id: string;
  name: string;
  pages: number;
  books: number;
  comments: number;
  streak: number;
  score: number;
  trend: string;
};

export const activeBookId = "atomic-habits";

export const books: Book[] = [
  {
    id: "atomic-habits",
    title: "Atom odatlar",
    author: "James Clear",
    summary: "Kichik odatlar orqali kundalik hayotni yaxshilash.",
    color: "#0f4f45",
    pages: 320,
  },
  {
    id: "alchemist",
    title: "Alkimyogar",
    author: "Paulo Coelho",
    summary: "Orzular va o'z yo'lini izlash haqidagi roman.",
    color: "#294256",
    pages: 208,
  },
  {
    id: "otkan-kunlar",
    title: "O'tkan kunlar",
    author: "Abdulla Qodiriy",
    summary: "Otabek va Kumush taqdiri orqali tarixiy hayot tasviri.",
    color: "#b66c5f",
    pages: 432,
  },
  {
    id: "1984",
    title: "1984",
    author: "George Orwell",
    summary: "Nazorat, erkinlik va mustaqil fikrlash haqidagi roman.",
    color: "#5b8ea3",
    pages: 328,
  },
  {
    id: "ikigai",
    title: "Ikigai",
    author: "Hector Garcia, Francesc Miralles",
    summary: "Hayot mazmuni va kundalik odatlar haqida.",
    color: "#8b7a42",
    pages: 224,
  },
  {
    id: "deep-work",
    title: "Deep Work",
    author: "Cal Newport",
    summary: "Diqqatni jamlash va chalg'ituvchilarsiz ishlash.",
    color: "#217b66",
    pages: 304,
  },
  {
    id: "money-psychology",
    title: "Pul psixologiyasi",
    author: "Morgan Housel",
    summary: "Pulga munosabat va inson xulqi haqida.",
    color: "#475569",
    pages: 256,
  },
  {
    id: "metamorphosis",
    title: "Evrilish",
    author: "Franz Kafka",
    summary: "Gregor Zamzaning kutilmagan o'zgarishi haqidagi qissa.",
    color: "#9b5f73",
    pages: 96,
  },
  {
    id: "start-with-why",
    title: "Start with Why",
    author: "Simon Sinek",
    summary: "Maqsad va yetakchilik haqida.",
    color: "#b7832c",
    pages: 256,
  },
];

export const seedComments: CommunityComment[] = [
  {
    id: 1,
    name: "Aziza",
    text: "Odatni muhit bilan bog'lash qiziq fikr. Siz nimalarni sinab ko'rdingiz?",
    demo: true,
    createdAt: "2026-09-08T09:00:00.000Z",
  },
  {
    id: 2,
    name: "Javohir",
    text: "Kitobni ko'rinadigan joyga qo'yishdan boshladim. Telefon yonida emas, stol ustida turibdi.",
    demo: true,
    createdAt: "2026-09-08T13:20:00.000Z",
  },
  {
    id: 3,
    name: "Madina",
    text: "Yomon odatni yo'qotishda birinchi qadam nima bo'lardi?",
    demo: true,
    createdAt: "2026-09-09T07:45:00.000Z",
  },
];

export const seedLeaderboard: LeaderboardMember[] = [
  {
    id: "aziza",
    name: "Aziza",
    pages: 286,
    books: 4,
    comments: 12,
    streak: 11,
    score: 920,
    trend: "+12",
  },
  {
    id: "javohir",
    name: "Javohir",
    pages: 260,
    books: 3,
    comments: 9,
    streak: 8,
    score: 810,
    trend: "+8",
  },
  {
    id: "madina",
    name: "Madina",
    pages: 238,
    books: 3,
    comments: 14,
    streak: 7,
    score: 790,
    trend: "+15",
  },
  {
    id: "sarvar",
    name: "Sarvar",
    pages: 192,
    books: 2,
    comments: 6,
    streak: 5,
    score: 610,
    trend: "+4",
  },
];
