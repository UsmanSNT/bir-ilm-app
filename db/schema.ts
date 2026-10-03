import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const readingPosts = sqliteTable("reading_posts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  book: text("book").notNull(),
  body: text("body").notNull(),
  /** post — oddiy post; announcement — admin/moderator e'loni (bosh sahifadagi yangiliklarda). */
  kind: text("kind", { enum: ["post", "announcement"] }).notNull().default("post"),
  /** post — lentadagi qisqa post; article — sarlavhali uzun maqola; card — rangli karta (stikerlar bilan). */
  format: text("format", { enum: ["post", "article", "card"] }).notNull().default("post"),
  /** Maqola yoki e'lon sarlavhasi (oddiy postda bo'sh bo'lishi mumkin). */
  title: text("title").notNull().default(""),
  /**
   * Formatlangan matn — `shared/contract/community.ts` dagi bloklar (JSON).
   * null — eski post: `body` oddiy matn sifatida ko'rsatiladi.
   * `body` doim to'ldiriladi (matnli nusxa: qidiruv, e'lonlar, eski mijozlar uchun).
   */
  content: text("content"),
  /** Karta dizayni (JSON, `cardDesignSchema`); faqat format = card. */
  design: text("design"),
  editedAt: text("edited_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  index("idx_posts_kind").on(t.kind, t.createdAt),
  index("idx_posts_created").on(t.createdAt),
  index("idx_posts_user").on(t.userId),
  // Lenta (created_at, id) juftligi bo'yicha tartiblanadi va shu juftlik
  // kursor sifatida ishlatiladi, shuning uchun indeks ham kompozit.
  index("idx_posts_feed").on(t.createdAt, t.id),
  index("idx_posts_user_feed").on(t.userId, t.createdAt, t.id),
]);

export const postReplies = sqliteTable("post_replies", {
  id: text("id").primaryKey(),
  postId: text("post_id").notNull().references(() => readingPosts.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [index("idx_replies_post").on(t.postId, t.createdAt)]);

/** Postga shikoyat: bir foydalanuvchi bir postga bir marta. */
export const postReports = sqliteTable("post_reports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  postId: text("post_id").notNull().references(() => readingPosts.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reason: text("reason").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [uniqueIndex("idx_reports_post_user").on(t.postId, t.userId)]);

/**
 * Post rasmlari va videolari. Avval yuklanadi (post_id = null), post joylanganda
 * unga bog'lanadi. Fayl: BIR_ILM_MEDIA_DIR/posts/<id>.<kengaytma>.
 */
export const postMedia = sqliteTable("post_media", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  postId: text("post_id").references(() => readingPosts.id, { onDelete: "set null" }),
  kind: text("kind", { enum: ["image", "video"] }).notNull(),
  mime: text("mime").notNull(),
  /** Fayl nomi; yuklash tugamaguncha null. */
  file: text("file"),
  bytes: integer("bytes").notNull(),
  width: integer("width").notNull().default(0),
  height: integer("height").notNull().default(0),
  seconds: integer("seconds").notNull().default(0),
  /** attachment — post tepasidagi albom; inline — matn ichidagi rasm/video. */
  role: text("role", { enum: ["attachment", "inline"] }).notNull().default("attachment"),
  position: integer("position").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  index("idx_post_media_post").on(t.postId, t.position),
  index("idx_post_media_user").on(t.userId, t.createdAt),
]);

/** Reaksiya: bir foydalanuvchi bir postga bitta (Telegram kabi — bosilsa almashadi). */
export const postReactions = sqliteTable("post_reactions", {
  postId: text("post_id").notNull().references(() => readingPosts.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  emoji: text("emoji").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  uniqueIndex("idx_reactions_post_user").on(t.postId, t.userId),
  index("idx_reactions_post").on(t.postId, t.emoji),
]);

export const readerFollows = sqliteTable("reader_follows", {
  followerId: text("follower_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  followedId: text("followed_id").notNull().references(() => users.id, { onDelete: "cascade" }),
}, (t) => [uniqueIndex("idx_follow_pair").on(t.followerId, t.followedId), index("idx_follow_target").on(t.followedId)]);

export const focusSessions = sqliteTable("focus_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  minutes: integer("minutes").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [index("idx_focus_user").on(t.userId)]);

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull().default("Kitobxon"),
  email: text("email"),
  bio: text("bio").notNull().default(""),
  /** user | moderator | admin */
  role: text("role", { enum: ["user", "moderator", "admin"] }).notNull().default("user"),
  avatarUrl: text("avatar_url"),
  /** Shaxsiy sahifa orqa foni: /media/profile/<fayl>. */
  coverUrl: text("cover_url"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

/**
 * Kirish (login) sessiyalari: token xeshi → foydalanuvchi.
 * Bu yerda bo'lmagan token eski mehmon tartibida `reader_<xesh>` bo'lib qoladi.
 */
export const userSessions = sqliteTable("user_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [index("idx_sessions_user").on(t.userId)]);

/**
 * Bir martalik kirish kodlari (faqat xeshi saqlanadi):
 *   link    — boshqa qurilmani ulash, 6 xonali, 10 daqiqa;
 *   flow    — ilova brauzerda Google/Telegram oqimini boshladi (qaysi ilova foydalanuvchisi uchun);
 *   handoff — brauzer kirishni tugatdi, ilova tokenni `challenge` tasdig'i bilan oladi.
 */
export const loginCodes = sqliteTable("login_codes", {
  codeHash: text("code_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  kind: text("kind", { enum: ["link", "flow", "handoff"] }).notNull().default("link"),
  /** Ilova oqimi: SHA-256(verifier) — kodni ushlab olgan boshqa ilova uni ishlata olmaydi. */
  challenge: text("challenge"),
  /** handoff: tasdiqlangan Google/Telegram profili (JSON) — akkaunt ilova kodni qaytarganda bog'lanadi. */
  payload: text("payload"),
},(t) => [index("idx_login_codes_user").on(t.userId)]);

/** Google / Telegram hisoblari — bitta foydalanuvchiga bir nechtasi bog'lanishi mumkin. */
export const authAccounts = sqliteTable("auth_accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  provider: text("provider", { enum: ["google", "telegram", "email"] }).notNull(),
  /** Provayderdagi doimiy ID (Google `sub`, Telegram `id`, email — kichik harfdagi manzil). */
  subject: text("subject").notNull(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  email: text("email"),
  displayName: text("display_name").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  uniqueIndex("idx_auth_provider_subject").on(t.provider, t.subject),
  index("idx_auth_user").on(t.userId),
]);

export const books = sqliteTable("books", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  author: text("author").notNull(),
  summary: text("summary").notNull().default(""),
  color: text("color").notNull().default("#0f4f45"),
  pages: integer("pages").notNull().default(320),
  /** Haftaning kitobi (bosh sahifa va profilda ko'rinadi). Bir vaqtda bittasi. */
  active: integer("active", { mode: "boolean" }).notNull().default(false),
  /** Media fayllar nomi (BIR_ILM_MEDIA_DIR/books/<id>/ ichida); null — yuklanmagan. */
  coverFile: text("cover_file"),
  audioFile: text("audio_file"),
  audioMime: text("audio_mime"),
  audioBytes: integer("audio_bytes").notNull().default(0),
  audioSeconds: integer("audio_seconds").notNull().default(0),
  /**
   * library — suhbat/kutubxona kitobi (audio, haftaning kitobi); store — sotuv uchun alohida mahsulot
   * (o'z muqovasi, tavsifi, narxi). Ikkalasi aralashmaydi.
   */
  kind: text("kind", { enum: ["library", "store"] }).notNull().default("library"),
  /** Do'kondagi narx (Koreya woni, ₩). 0 — sotuvda emas. Faqat kind=store uchun. */
  price: integer("price").notNull().default(0),
  /** Do'kon janri (filtr uchun). */
  category: text("category").notNull().default(""),
  createdBy: text("created_by"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

/**
 * Audiokitob qismlari (boblar) — tartib bilan ketma-ket ijro etiladi.
 * Fayl: BIR_ILM_MEDIA_DIR/books/<kitob-id>/<file>. Jami hajm va soni BOOK_LIMITS'da.
 */
export const bookTracks = sqliteTable("book_tracks", {
  id: text("id").primaryKey(),
  bookId: text("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  position: integer("position").notNull().default(0),
  title: text("title").notNull().default(""),
  file: text("file").notNull(),
  mime: text("mime").notNull(),
  bytes: integer("bytes").notNull().default(0),
  seconds: integer("seconds").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [index("idx_book_tracks_book").on(t.bookId, t.position)]);

export const readingProgress = sqliteTable(
  "reading_progress",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    bookId: text("book_id").notNull(),
    page: integer("page").notNull().default(0),
    total: integer("total").notNull().default(320),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_reading_progress_user_book").on(table.userId, table.bookId),
    index("idx_reading_progress_book").on(table.bookId),
  ],
);

export const comments = sqliteTable(
  "comments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    bookId: text("book_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userName: text("user_name").notNull(),
    body: text("body").notNull(),
    demo: integer("demo", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_comments_book_created").on(table.bookId, table.createdAt),
    index("idx_comments_user").on(table.userId),
  ],
);

// ── Jonli suhbat ────────────────────────────────────────────────────

export const liveSessions = sqliteTable("live_sessions", {
  id: text("id").primaryKey(),
  /** Kitob nomi — suhbat mavzusi. */
  bookTitle: text("book_title").notNull(),
  /** Suhbat sarlavhasi. */
  title: text("title").notNull(),
  /** planned → live → ended */
  status: text("status", { enum: ["planned", "live", "ended"] }).notNull().default("planned"),
  /** Rejalashtirilgan vaqt (ISO 8601). */
  scheduledAt: text("scheduled_at").notNull(),
  /** Boshlangan vaqt (moderator "boshlash" bosganda). */
  startedAt: text("started_at"),
  /** Tugagan vaqt. */
  endedAt: text("ended_at"),
  /** Moderator userId. */
  moderatorId: text("moderator_id").notNull().references(() => users.id),
  /** Hozir yozib olayotgan admin (null — yozilmayapti). */
  recordingBy: text("recording_by"),
  /**
   * Ishlov berilgan, hammaga ochiq audio («O'tgan suhbatlar»). Fayl:
   * BIR_ILM_MEDIA_DIR/live/<id>/archive.<kengaytma>. Yo'q bo'lsa — tugagan suhbat faqat adminlarga ko'rinadi.
   */
  archiveFile: text("archive_file"),
  archiveMime: text("archive_mime"),
  archiveBytes: integer("archive_bytes").notNull().default(0),
  archiveSeconds: integer("archive_seconds").notNull().default(0),
  archivedAt: text("archived_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  index("idx_live_sessions_status").on(t.status, t.scheduledAt),
]);

/** Suhbatning xom yozuvlari (faqat admin/moderator ko'radi va yuklab oladi). */
export const liveRecordings = sqliteTable("live_recordings", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => liveSessions.id, { onDelete: "cascade" }),
  /** rec-<id>.<kengaytma>, suhbat papkasida. */
  file: text("file").notNull(),
  mime: text("mime").notNull(),
  bytes: integer("bytes").notNull().default(0),
  seconds: integer("seconds").notNull().default(0),
  createdBy: text("created_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  index("idx_live_recordings_session").on(t.sessionId, t.createdAt),
]);

export const liveParticipants = sqliteTable("live_participants", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: text("session_id").notNull().references(() => liveSessions.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull().default("Kitobxon"),
  /** listener | speaker | moderator */
  role: text("role", { enum: ["listener", "speaker", "moderator"] }).notNull().default("listener"),
  /** Qo'l ko'tarilganmi? */
  handRaised: integer("hand_raised", { mode: "boolean" }).notNull().default(false),
  joinedAt: text("joined_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  uniqueIndex("idx_live_part_session_user").on(t.sessionId, t.userId),
  index("idx_live_part_session").on(t.sessionId),
]);

export const liveMessages = sqliteTable("live_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: text("session_id").notNull().references(() => liveSessions.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  userName: text("user_name").notNull(),
  body: text("body").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  index("idx_live_msg_session").on(t.sessionId, t.createdAt),
]);

// ── Foydalanuvchi faolligi ──────────────────────────────────────────

export const userActivity = sqliteTable(
  "user_activity",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    score: integer("score").notNull().default(0),
    streak: integer("streak").notNull().default(0),
    activeDays: integer("active_days").notNull().default(0),
    commentsCount: integer("comments_count").notNull().default(0),
    booksFinished: integer("books_finished").notNull().default(0),
    pagesRead: integer("pages_read").notNull().default(0),
    lastActiveDate: text("last_active_date"),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_user_activity_score").on(table.score, table.streak, table.pagesRead),
  ],
);

// ── Book Store ──────────────────────────────────────────────────────

/** Savat: har foydalanuvchi uchun bitta; narx bu yerda saqlanmaydi — har doim kitobdan olinadi. */
export const storeCartItems = sqliteTable("store_cart_items", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  bookId: text("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  qty: integer("qty").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [uniqueIndex("idx_store_cart_user_book").on(t.userId, t.bookId)]);

/**
 * Buyurtmalar. `id` mijozda yaratiladi (takroriy yuborish xavfsiz — idempotent).
 * Summalar serverda, bazadagi narxlardan hisoblanadi. To'lov hozircha yetkazishda / admin bog'lanadi.
 */
export const storeOrders = sqliteTable("store_orders", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  telegram: text("telegram").notNull().default(""),
  address: text("address").notNull(),
  note: text("note").notNull().default(""),
  payment: text("payment", { enum: ["cash", "click", "payme", "uzum", "card", "chat"] }).notNull(),
  status: text("status", { enum: ["new", "confirmed", "shipped", "delivered", "cancelled"] }).notNull().default("new"),
  total: integer("total").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  index("idx_store_orders_user").on(t.userId, t.createdAt),
  index("idx_store_orders_status").on(t.status, t.createdAt),
]);

/** Buyurtma qatorlari: nom va narx buyurtma paytidagi holatda muzlatiladi (kitob o'chsa ham qoladi). */
export const storeOrderItems = sqliteTable("store_order_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: text("order_id").notNull().references(() => storeOrders.id, { onDelete: "cascade" }),
  bookId: text("book_id").notNull(),
  title: text("title").notNull(),
  qty: integer("qty").notNull(),
  price: integer("price").notNull(),
}, (t) => [index("idx_store_order_items_order").on(t.orderId)]);

/** Kitob sharhlari: har kitobxon har kitobga bitta (qayta yozsa yangilanadi). */
export const bookReviews = sqliteTable("book_reviews", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bookId: text("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  rating: integer("rating").notNull(),
  body: text("body").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  uniqueIndex("idx_book_reviews_book_user").on(t.bookId, t.userId),
  index("idx_book_reviews_book").on(t.bookId, t.updatedAt),
]);

// ── Email va parol ──────────────────────────────────────────────────

/** Parol xeshi (PBKDF2-SHA256, tuz va iteratsiya soni xesh ichida). Hisob — `auth_accounts` (provider = email). */
export const userPasswords = sqliteTable("user_passwords", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  hash: text("hash").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

/** Ikki bosqichli himoya: foydalanuvchi o'zi qo'ygan xavfsizlik kodi (faqat xeshi). */
export const userSecurityCodes = sqliteTable("user_security_codes", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  hash: text("hash").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

/** Birinchi bosqichdan o'tgan, kodi kutilayotgan kirishlar: token xeshi, qisqa muddat, urinishlar cheklangan. */
export const loginChallenges = sqliteTable("login_challenges", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  attempts: integer("attempts").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [index("idx_login_challenges_user").on(t.userId)]);

/** Parolni tiklash havolalari: faqat token xeshi, bir martalik, qisqa muddatli. */
export const passwordResets = sqliteTable("password_resets", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [index("idx_password_resets_user").on(t.userId)]);

/**
 * Do'kon chati: har xaridorga bitta yozishma (savollar va buyurtmalar bir joyda).
 * To'lov ilovada emas: admin shu chatda hisob raqam yuboradi, xaridor chek rasmini shu yerga tashlaydi.
 */
export const storeThreads = sqliteTable("store_threads", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  lastMessageAt: text("last_message_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  lastPreview: text("last_preview").notNull().default(""),
  /** Admin hali o'qimagan xaridor xabarlari soni. */
  adminUnread: integer("admin_unread").notNull().default(0),
  /** Xaridor hali o'qimagan admin xabarlari soni. */
  userUnread: integer("user_unread").notNull().default(0),
}, (t) => [index("idx_store_threads_last").on(t.lastMessageAt)]);

export const storeMessages = sqliteTable("store_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** Yozishma egasi (xaridor). */
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sender: text("sender", { enum: ["user", "admin"] }).notNull(),
  /** Xabarni yozgan hisob (admin javobida — qaysi admin). */
  senderId: text("sender_id").notNull(),
  kind: text("kind", { enum: ["text", "order", "image"] }).notNull().default("text"),
  body: text("body").notNull().default(""),
  orderId: text("order_id"),
  /** Savol qaysi kitob haqida (ixtiyoriy). */
  bookId: text("book_id"),
  bookTitle: text("book_title"),
  imageFile: text("image_file"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [index("idx_store_messages_user").on(t.userId, t.id)]);

/** Bir Ilm'ning ijtimoiy tarmoq havolalari (telegram, youtube, instagram, facebook) — admin kiritadi. */
export const siteLinks = sqliteTable("site_links", {
  key: text("key", { enum: ["telegram", "youtube", "instagram", "facebook"] }).primaryKey(),
  url: text("url").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

/**
 * Qisqa videolar: faqat havola saqlanadi (video serverga yuklanmaydi). Ilovada tashqi pleyer (iframe) bilan ijro etiladi.
 * `externalId` — platformadagi identifikator (YouTube: 11 belgi, Instagram: post kodi; Facebook'da bo'sh).
 */
export const videoLinks = sqliteTable("video_links", {
  id: text("id").primaryKey(),
  platform: text("platform", { enum: ["youtube", "instagram", "facebook"] }).notNull(),
  url: text("url").notNull(),
  externalId: text("external_id").notNull().default(""),
  title: text("title").notNull().default(""),
  createdBy: text("created_by"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [index("idx_video_links_created").on(t.createdAt)]);
