CREATE TABLE `books` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`author` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`color` text DEFAULT '#0f4f45' NOT NULL,
	`pages` integer DEFAULT 320 NOT NULL,
	`active` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `comments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`book_id` text NOT NULL,
	`user_id` text NOT NULL,
	`user_name` text NOT NULL,
	`body` text NOT NULL,
	`demo` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_comments_book_created` ON `comments` (`book_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_comments_user` ON `comments` (`user_id`);--> statement-breakpoint
CREATE TABLE `reading_progress` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`book_id` text NOT NULL,
	`page` integer DEFAULT 0 NOT NULL,
	`total` integer DEFAULT 320 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_reading_progress_user_book` ON `reading_progress` (`user_id`,`book_id`);--> statement-breakpoint
CREATE INDEX `idx_reading_progress_book` ON `reading_progress` (`book_id`);--> statement-breakpoint
CREATE TABLE `user_activity` (
	`user_id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`score` integer DEFAULT 0 NOT NULL,
	`streak` integer DEFAULT 0 NOT NULL,
	`active_days` integer DEFAULT 0 NOT NULL,
	`comments_count` integer DEFAULT 0 NOT NULL,
	`books_finished` integer DEFAULT 0 NOT NULL,
	`pages_read` integer DEFAULT 0 NOT NULL,
	`last_active_date` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_user_activity_score` ON `user_activity` (`score`,`streak`,`pages_read`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text DEFAULT 'Kitobxon' NOT NULL,
	`email` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
