export type QuizChoice = {
  id: string;
  text: string;
};

export type QuizQuestion = {
  prompt: string;
  choices: QuizChoice[];
  answer: string;
};

export type Quiz = {
  id: string;
  title: string;
  author: string;
  minutes: number;
  tone: "cream" | "rose" | "ink";
  questions: QuizQuestion[];
};

const choice = (items: string[], answer: number): Pick<QuizQuestion, "choices" | "answer"> => ({
  choices: items.map((text, index) => ({ id: String(index), text })),
  answer: String(answer),
});

export const quizzes: Quiz[] = [
  {
    id: "atomic-habits",
    title: "Atom odatlar",
    author: "James Clear",
    minutes: 5,
    tone: "cream",
    questions: [
      { prompt: "«Atom odatlar» kitobining muallifi kim?", ...choice(["Cal Newport", "James Clear", "Morgan Housel", "Simon Sinek"], 1) },
      { prompt: "Kitobning asosiy g‘oyasi qaysi?", ...choice(["Faqat katta maqsadlar natija beradi", "Kichik odatlar katta o‘zgarishga olib keladi", "Motivatsiya har doim yetarli", "Odatni bir kunda butunlay almashtirish mumkin"], 1) },
      { prompt: "Odat halqasi necha bosqichdan iborat?", ...choice(["2", "3", "4", "6"], 2) },
      { prompt: "Odat halqasining birinchi bosqichi nima?", ...choice(["Mukofot", "Signal", "Jazo", "Tanaffus"], 1) },
      { prompt: "«Ikki daqiqa qoidasi» nimani anglatadi?", ...choice(["Har kuni ikki daqiqa dam olish", "Yangi odatni juda kichik qadamdan boshlash", "Kitobni ikki daqiqada tugatish", "Xatoni ikki marta takrorlash"], 1) },
      { prompt: "Muhit odatga qanday ta’sir qiladi?", ...choice(["Hech qanday ta’siri yo‘q", "Signalni ko‘rinadigan yoki yashirin qiladi", "Faqat irodani o‘lchaydi", "Odatni o‘zi yaratmaydi va o‘zgartirmaydi"], 1) },
      { prompt: "Yomon odatni susaytirishning bir usuli qaysi?", ...choice(["Mukofotini oshirish", "Uni har kuni eslatib turish", "Signalni yashirish va qiyinlashtirish", "Boshqalarni majburlash"], 2) },
      { prompt: "Har kuni 1% yaxshilanish g‘oyasi nimaga olib keladi?", ...choice(["Sezilarli uzoq muddatli o‘sish", "Hech qanday o‘zgarish yo‘q", "Faqat bir haftalik natija", "Darhol mukammallik"], 0) },
      { prompt: "Kimlikka bog‘langan odat qanday ifodalanadi?", ...choice(["«Men o‘qiydigan odamman»", "Faqat sahifa sonini sanash", "Boshqalarni nusxalash", "Mukofotni yashirish"], 0) },
      { prompt: "Barqaror o‘zgarish odatda nimadan boshlanadi?", ...choice(["Bir martalik katta harakat", "Kichik va takrorlanadigan qadam", "Tasodifiy motivatsiya", "Boshqalar nazorati"], 1) },
    ],
  },
  {
    id: "otkan-kunlar",
    title: "O‘tkan kunlar",
    author: "Abdulla Qodiriy",
    minutes: 7,
    tone: "rose",
    questions: [
      { prompt: "«O‘tkan kunlar» romanining muallifi kim?", ...choice(["Cho‘lpon", "Abdulla Qodiriy", "Oybek", "G‘afur G‘ulom"], 1) },
      { prompt: "Asar qanday janrda yozilgan?", ...choice(["She’r", "Drama", "Roman", "Maqol"], 2) },
      { prompt: "Bosh qahramonning ismi nima?", ...choice(["Otabek", "Homid", "Hasanali", "Yusufbek"], 0) },
      { prompt: "Otabekning sevgilisi kim?", ...choice(["Zaynab", "Kumush", "Oftob", "Ra’no"], 1) },
      { prompt: "Otabekning otasi kim?", ...choice(["Mirzakarim", "Yusufbek hoji", "Homid", "Hasanali"], 1) },
      { prompt: "Voqealar asosan qaysi shaharlar bilan bog‘liq?", ...choice(["Buxoro va Xiva", "Toshkent va Marg‘ilon", "Samarqand va Qo‘qon", "Andijon va Namangan"], 1) },
      { prompt: "Otabekka majburan nikohlangan qiz kim?", ...choice(["Kumush", "Zaynab", "Oftob", "Saodat"], 1) },
      { prompt: "Otabekning sodiq xizmatkori kim?", ...choice(["Homid", "Hasanali", "Yusufbek", "Mirzakarim"], 1) },
      { prompt: "Roman qaysi davr hayotini tasvirlaydi?", ...choice(["X asr", "XV asr", "XIX asr", "XXI asr"], 2) },
      { prompt: "Kumush qaysi shahardan?", ...choice(["Xiva", "Buxoro", "Marg‘ilon", "Samarqand"], 2) },
      { prompt: "Asar o‘zbek adabiyotida nima sifatida tanilgan?", ...choice(["Ilk romanlardan biri", "Ilk she’riy doston", "Tarjima qissa", "Zamonaviy memuar"], 0) },
      { prompt: "Roman markazida qaysi to‘qnashuv turadi?", ...choice(["Sevgi va eski odatlar", "Dengiz sayohati", "Zavod ishchilari", "Kosmik ekspeditsiya"], 0) },
    ],
  },
  {
    id: "alchemist",
    title: "Alkimyogar",
    author: "Paulo Coelho",
    minutes: 4,
    tone: "ink",
    questions: [
      { prompt: "«Alkimyogar» muallifi kim?", ...choice(["Paulo Coelho", "George Orwell", "Franz Kafka", "Hector Garcia"], 0) },
      { prompt: "Asosiy qahramon kim?", ...choice(["Santyago", "Gregor", "Otabek", "Winston"], 0) },
      { prompt: "U dastlab nima bilan shug‘ullanadi?", ...choice(["Dengizchi", "Cho‘pon", "Shifokor", "Rassom"], 1) },
      { prompt: "Kitobning takroriy g‘oyasi qaysi?", ...choice(["Shaxsiy afsonaga ergashish", "Hokimiyatni saqlash", "Pulni yashirish", "Shahardan qochish"], 0) },
    ],
  },
];

export const quizLeaders = [
  { id: "dilshoda", name: "Dilshoda", score: 320 },
  { id: "bekzod", name: "Bekzod", score: 275 },
  { id: "sevara", name: "Sevara", score: 240 },
  { id: "aziza", name: "Aziza", score: 210 },
  { id: "javohir", name: "Javohir", score: 180 },
];

export const wisdom = [
  "Har bir o‘qilgan sahifa yangi fikrga yo‘l ochadi.",
  "Bugungi kichik qadam ertangi o‘zgarishning boshlanishi.",
  "O‘qish — o‘zingiz bilan qiladigan sokin suhbat.",
  "Bir sahifa ham hisoblanadi. Muhimi, to‘xtamaslik.",
];

export const LIVE_ROOM = "123456";
