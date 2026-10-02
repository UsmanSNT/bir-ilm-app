CREATE TABLE `talk_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_id` text NOT NULL,
	`user_id` text,
	`kind` text DEFAULT 'text' NOT NULL,
	`body` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `talk_rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_talk_messages_room` ON `talk_messages` (`room_id`,`id`);--> statement-breakpoint
CREATE INDEX `idx_talk_messages_user` ON `talk_messages` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `talk_participants` (
	`room_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'listener' NOT NULL,
	`hand` integer DEFAULT 0 NOT NULL,
	`joined_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_seen` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `talk_rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_talk_participant` ON `talk_participants` (`room_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_talk_participants_seen` ON `talk_participants` (`room_id`,`last_seen`);--> statement-breakpoint
CREATE TABLE `talk_rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`book` text NOT NULL,
	`starts_at` text NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`host_id` text,
	`started_at` text,
	`ended_at` text
);
