CREATE TABLE `post_media` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`post_id` text,
	`kind` text NOT NULL,
	`mime` text NOT NULL,
	`file` text,
	`bytes` integer NOT NULL,
	`width` integer DEFAULT 0 NOT NULL,
	`height` integer DEFAULT 0 NOT NULL,
	`seconds` integer DEFAULT 0 NOT NULL,
	`role` text DEFAULT 'attachment' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`post_id`) REFERENCES `reading_posts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_post_media_post` ON `post_media` (`post_id`,`position`);--> statement-breakpoint
CREATE INDEX `idx_post_media_user` ON `post_media` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `post_reactions` (
	`post_id` text NOT NULL,
	`user_id` text NOT NULL,
	`emoji` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `reading_posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_reactions_post_user` ON `post_reactions` (`post_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_reactions_post` ON `post_reactions` (`post_id`,`emoji`);--> statement-breakpoint
ALTER TABLE `reading_posts` ADD `format` text DEFAULT 'post' NOT NULL;--> statement-breakpoint
ALTER TABLE `reading_posts` ADD `title` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `reading_posts` ADD `content` text;--> statement-breakpoint
ALTER TABLE `reading_posts` ADD `edited_at` text;--> statement-breakpoint
UPDATE `reading_posts` SET `title` = `book`, `book` = '' WHERE `kind` = 'announcement';