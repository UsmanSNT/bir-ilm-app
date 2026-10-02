CREATE TABLE `post_likes` (
	`post_id` text NOT NULL,
	`user_id` text NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `reading_posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_post_likes_pair` ON `post_likes` (`post_id`,`user_id`);--> statement-breakpoint
ALTER TABLE `reading_posts` ADD `kind` text DEFAULT 'review' NOT NULL;