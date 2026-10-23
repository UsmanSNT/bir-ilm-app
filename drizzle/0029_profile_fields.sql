ALTER TABLE `users` ADD `username` text;--> statement-breakpoint
ALTER TABLE `users` ADD `birth_date` text;--> statement-breakpoint
ALTER TABLE `users` ADD `gender` text;--> statement-breakpoint
ALTER TABLE `users` ADD `profession` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_username` ON `users` (`username`);