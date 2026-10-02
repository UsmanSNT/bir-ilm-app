ALTER TABLE `books` ADD `cover_file` text;--> statement-breakpoint
ALTER TABLE `books` ADD `audio_file` text;--> statement-breakpoint
ALTER TABLE `books` ADD `audio_mime` text;--> statement-breakpoint
ALTER TABLE `books` ADD `audio_bytes` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `books` ADD `audio_seconds` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `books` ADD `created_by` text;--> statement-breakpoint
ALTER TABLE `books` ADD `updated_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `books` SET `updated_at` = `created_at`;