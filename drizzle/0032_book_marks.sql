CREATE TABLE `book_marks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`book_id` text NOT NULL,
	`kind` text NOT NULL,
	`block` integer NOT NULL,
	`start` integer NOT NULL,
	`end` integer NOT NULL,
	`quote` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_book_marks_user_book` ON `book_marks` (`user_id`,`book_id`,`block`,`start`);