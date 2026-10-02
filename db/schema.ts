import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const readingPosts = sqliteTable("reading_posts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  book: text("book").notNull(),
  body: text("body").notNull(),
  kind: text("kind").notNull().default("review"),
  mediaKey: text("media_key"),
  mediaType: text("media_type"),
  design: text("design"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [index("idx_posts_created").on(t.createdAt), index("idx_posts_user").on(t.userId)]);

export const postReplies = sqliteTable("post_replies", {
  id: text("id").primaryKey(),
  postId: text("post_id").notNull().references(() => readingPosts.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [index("idx_replies_post").on(t.postId, t.createdAt)]);

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
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const books = sqliteTable("books", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  author: text("author").notNull(),
  summary: text("summary").notNull().default(""),
  color: text("color").notNull().default("#0f4f45"),
  pages: integer("pages").notNull().default(320),
  active: integer("active", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
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

export const storeCartItems = sqliteTable("store_cart_items", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  bookId: text("book_id").notNull(),
  qty: integer("qty").notNull(),
}, (t) => [uniqueIndex("idx_store_cart_user_book").on(t.userId, t.bookId)]);

export const storeCartMeta = sqliteTable("store_cart_meta", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  promo: text("promo").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const storeOrders = sqliteTable("store_orders", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  address: text("address").notNull(),
  payment: text("payment").notNull(),
  promo: text("promo").notNull().default(""),
  subtotal: integer("subtotal").notNull(),
  discount: integer("discount").notNull().default(0),
  total: integer("total").notNull(),
  status: text("status").notNull().default("pending_payment"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [index("idx_store_orders_user").on(t.userId, t.createdAt)]);

export const storeOrderItems = sqliteTable("store_order_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: text("order_id").notNull().references(() => storeOrders.id, { onDelete: "cascade" }),
  bookId: text("book_id").notNull(),
  title: text("title").notNull(),
  qty: integer("qty").notNull(),
  price: integer("price").notNull(),
}, (t) => [index("idx_store_order_items_order").on(t.orderId)]);

export const postLikes = sqliteTable("post_likes", {
  postId: text("post_id").notNull().references(() => readingPosts.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
}, (t) => [uniqueIndex("idx_post_likes_pair").on(t.postId, t.userId)]);

export const mediaUploads = sqliteTable("media_uploads", {
  key: text("key").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  size: integer("size").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [index("idx_media_user_created").on(t.userId, t.createdAt)]);

export const bookReviews = sqliteTable("book_reviews", {
  id: text("id").primaryKey(),
  bookId: text("book_id").notNull(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  rating: integer("rating").notNull(),
  body: text("body").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [uniqueIndex("idx_reviews_book_user").on(t.bookId, t.userId), index("idx_reviews_book_created").on(t.bookId, t.createdAt)]);

export const accounts = sqliteTable("accounts", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  login: text("login").notNull(),
  passwordHash: text("password_hash").notNull(),
  salt: text("salt").notNull(),
  iterations: integer("iterations").notNull(),
  email: text("email"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [uniqueIndex("idx_accounts_login").on(t.login), uniqueIndex("idx_accounts_email").on(t.email).where(sql`email IS NOT NULL`)]);

export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  expiresAt: text("expires_at").notNull(),
}, (t) => [index("idx_sessions_user").on(t.userId)]);

export const authAttempts = sqliteTable("auth_attempts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  login: text("login").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [index("idx_auth_attempts_login").on(t.login, t.createdAt)]);

export const oauthIdentities = sqliteTable("oauth_identities", {
  provider: text("provider").notNull(),
  subject: text("subject").notNull(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  email: text("email"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [uniqueIndex("idx_oauth_provider_subject").on(t.provider, t.subject), index("idx_oauth_user").on(t.userId)]);

export const passwordResets = sqliteTable("password_resets", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [index("idx_password_resets_user").on(t.userId)]);

export const talkRooms = sqliteTable("talk_rooms", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  book: text("book").notNull(),
  startsAt: text("starts_at").notNull(),
  status: text("status").notNull().default("scheduled"),
  hostId: text("host_id"),
  recording: integer("recording").notNull().default(0),
  startedAt: text("started_at"),
  endedAt: text("ended_at"),
});

export const talkParticipants = sqliteTable("talk_participants", {
  roomId: text("room_id").notNull().references(() => talkRooms.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("listener"),
  hand: integer("hand").notNull().default(0),
  mic: integer("mic").notNull().default(0),
  rtcSession: text("rtc_session"),
  pubAudio: integer("pub_audio").notNull().default(0),
  pubVideo: integer("pub_video").notNull().default(0),
  pubScreen: integer("pub_screen").notNull().default(0),
  joinedAt: text("joined_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  lastSeen: text("last_seen").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [uniqueIndex("idx_talk_participant").on(t.roomId, t.userId), index("idx_talk_participants_seen").on(t.roomId, t.lastSeen)]);

export const talkMessages = sqliteTable("talk_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  roomId: text("room_id").notNull().references(() => talkRooms.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  kind: text("kind").notNull().default("text"),
  body: text("body").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [index("idx_talk_messages_room").on(t.roomId, t.id), index("idx_talk_messages_user").on(t.userId, t.createdAt)]);
