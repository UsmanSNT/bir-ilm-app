import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const readingPosts = sqliteTable("reading_posts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  book: text("book").notNull(),
  body: text("body").notNull(),
  /** post — oddiy post; announcement — admin/moderator e'loni (bosh sahifadagi yangiliklarda). */
  kind: text("kind", { enum: ["post", "announcement"] }).notNull().default("post"),
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
  provider: text("provider", { enum: ["google", "telegram"] }).notNull(),
  /** Provayderdagi doimiy ID (Google `sub`, Telegram `id`). */
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
  createdBy: text("created_by"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

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
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  index("idx_live_sessions_status").on(t.status, t.scheduledAt),
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
