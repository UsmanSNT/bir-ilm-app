CREATE TABLE `live_recordings` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`file` text NOT NULL,
	`mime` text NOT NULL,
	`bytes` integer DEFAULT 0 NOT NULL,
	`seconds` integer DEFAULT 0 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `live_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_live_recordings_session` ON `live_recordings` (`session_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `live_sessions` ADD `recording_by` text;--> statement-breakpoint
ALTER TABLE `live_sessions` ADD `archive_file` text;--> statement-breakpoint
ALTER TABLE `live_sessions` ADD `archive_mime` text;--> statement-breakpoint
ALTER TABLE `live_sessions` ADD `archive_bytes` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `live_sessions` ADD `archive_seconds` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `live_sessions` ADD `archived_at` text;