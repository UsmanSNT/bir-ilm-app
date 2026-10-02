CREATE TABLE `oauth_identities` (
	`provider` text NOT NULL,
	`subject` text NOT NULL,
	`user_id` text NOT NULL,
	`email` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_oauth_provider_subject` ON `oauth_identities` (`provider`,`subject`);--> statement-breakpoint
CREATE INDEX `idx_oauth_user` ON `oauth_identities` (`user_id`);