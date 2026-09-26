ALTER TABLE `login_codes` ADD `kind` text DEFAULT 'link' NOT NULL;--> statement-breakpoint
ALTER TABLE `login_codes` ADD `challenge` text;--> statement-breakpoint
ALTER TABLE `login_codes` ADD `payload` text;