CREATE TABLE `post_reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`post_id` text NOT NULL,
	`user_id` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `reading_posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_reports_post_user` ON `post_reports` (`post_id`,`user_id`);--> statement-breakpoint
ALTER TABLE `reading_posts` ADD `kind` text DEFAULT 'post' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_posts_kind` ON `reading_posts` (`kind`,`created_at`);