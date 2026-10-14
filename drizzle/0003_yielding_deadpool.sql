CREATE TABLE `site_visitors` (
	`id` text PRIMARY KEY NOT NULL,
	`first_seen` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_seen` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`visits` integer DEFAULT 1 NOT NULL,
	`country` text,
	`device` text
);
--> statement-breakpoint
CREATE INDEX `idx_visitors_last_seen` ON `site_visitors` (`last_seen`);--> statement-breakpoint
ALTER TABLE `users` ADD `auth_id` text;--> statement-breakpoint
ALTER TABLE `users` ADD `registered_at` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_auth` ON `users` (`auth_id`);