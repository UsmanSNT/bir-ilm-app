CREATE TABLE `admins` (
	`email` text PRIMARY KEY NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `team_members` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT '' NOT NULL,
	`bio` text DEFAULT '' NOT NULL,
	`photo` text DEFAULT '' NOT NULL,
	`telegram` text DEFAULT '' NOT NULL,
	`instagram` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`visible` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_team_order` ON `team_members` (`visible`,`sort_order`);--> statement-breakpoint
INSERT INTO `team_members` (`id`, `name`, `role`, `bio`, `sort_order`) VALUES ('seed-founder', 'Ism Familiya', 'Loyiha asoschisi', 'Bu karta namuna. Admin paneldan o''zingiz haqingizdagi ma''lumotni kiriting.', 1);
