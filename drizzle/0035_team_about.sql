CREATE TABLE `site_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `team_members` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT '' NOT NULL,
	`bio` text DEFAULT '' NOT NULL,
	`photo_url` text,
	`telegram` text DEFAULT '' NOT NULL,
	`instagram` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`visible` integer DEFAULT true NOT NULL,
	`created_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_team_members_order` ON `team_members` (`sort_order`);--> statement-breakpoint
INSERT INTO `team_members` (`id`, `name`, `role`, `bio`, `sort_order`, `visible`) VALUES ('team_namuna', 'Ism Familiya', 'Loyiha asoschisi', 'Bu namuna karta. Boshqaruv → Jamoa bo''limida o''z ma''lumotingizni yozing, rasm qo''ying va «Saytda ko''rinsin»ni yoqing.', 1, 0);
