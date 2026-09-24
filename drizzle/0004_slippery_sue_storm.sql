CREATE TABLE `live_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`user_id` text NOT NULL,
	`user_name` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `live_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_live_msg_session` ON `live_messages` (`session_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `live_participants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text DEFAULT 'Kitobxon' NOT NULL,
	`role` text DEFAULT 'listener' NOT NULL,
	`hand_raised` integer DEFAULT false NOT NULL,
	`joined_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `live_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_live_part_session_user` ON `live_participants` (`session_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_live_part_session` ON `live_participants` (`session_id`);--> statement-breakpoint
CREATE TABLE `live_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`book_title` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`scheduled_at` text NOT NULL,
	`started_at` text,
	`ended_at` text,
	`moderator_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`moderator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_live_sessions_status` ON `live_sessions` (`status`,`scheduled_at`);