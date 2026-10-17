ALTER TABLE `store_orders` ADD `admin_unread` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `store_orders` ADD `user_unread` integer DEFAULT 0 NOT NULL;
