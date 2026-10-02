CREATE TABLE `book_tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`file` text NOT NULL,
	`mime` text NOT NULL,
	`bytes` integer DEFAULT 0 NOT NULL,
	`seconds` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_book_tracks_book` ON `book_tracks` (`book_id`,`position`);--> statement-breakpoint
-- Oldingi yagona audio fayl 1-qism bo'lib qoladi.
INSERT INTO `book_tracks` (`id`, `book_id`, `position`, `title`, `file`, `mime`, `bytes`, `seconds`)
SELECT lower(hex(randomblob(8))), `id`, 0, '1-qism', `audio_file`, coalesce(`audio_mime`, 'audio/mpeg'), `audio_bytes`, `audio_seconds`
FROM `books` WHERE `audio_file` IS NOT NULL;--> statement-breakpoint
UPDATE `books` SET `audio_file` = NULL WHERE `audio_file` IS NOT NULL;
