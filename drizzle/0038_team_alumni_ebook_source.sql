ALTER TABLE `book_ebooks` ADD `source_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `book_ebooks` ADD `source_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `team_members` ADD `avatar` text;--> statement-breakpoint
ALTER TABLE `team_members` ADD `former` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `team_members` ADD `period` text DEFAULT '' NOT NULL;