ALTER TABLE `quizzes` ADD `time_seconds` integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE `quizzes` ADD `play_mode` text DEFAULT 'group' NOT NULL;