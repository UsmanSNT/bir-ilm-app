ALTER TABLE `talk_participants` ADD `mic` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `talk_participants` ADD `rtc_session` text;--> statement-breakpoint
ALTER TABLE `talk_participants` ADD `pub_audio` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `talk_participants` ADD `pub_video` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `talk_participants` ADD `pub_screen` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `talk_rooms` ADD `recording` integer DEFAULT 0 NOT NULL;