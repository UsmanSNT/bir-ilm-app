CREATE TABLE `book_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`user_id` text NOT NULL,
	`rating` integer NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_reviews_book_user` ON `book_reviews` (`book_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_reviews_book_created` ON `book_reviews` (`book_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `media_uploads` (
	`key` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_media_user_created` ON `media_uploads` (`user_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `reading_posts` ADD `media_key` text;--> statement-breakpoint
ALTER TABLE `reading_posts` ADD `media_type` text;--> statement-breakpoint
ALTER TABLE `reading_posts` ADD `design` text;