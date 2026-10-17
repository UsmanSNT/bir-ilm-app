CREATE TABLE `store_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`sender` text NOT NULL,
	`sender_id` text NOT NULL,
	`kind` text DEFAULT 'text' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`order_id` text,
	`book_id` text,
	`book_title` text,
	`image_file` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_store_messages_user` ON `store_messages` (`user_id`,`id`);--> statement-breakpoint
CREATE TABLE `store_threads` (
	`user_id` text PRIMARY KEY NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_message_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_preview` text DEFAULT '' NOT NULL,
	`admin_unread` integer DEFAULT 0 NOT NULL,
	`user_unread` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_store_threads_last` ON `store_threads` (`last_message_at`);