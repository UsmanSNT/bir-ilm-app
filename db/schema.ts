import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const readingPosts = sqliteTable("reading_posts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  book: text("book").notNull(),
  body: text("body").notNull(),
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
