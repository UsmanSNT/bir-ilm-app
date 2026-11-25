PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_journey_books` (
	`number` integer PRIMARY KEY NOT NULL,
	`discussed_on` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`author` text DEFAULT '' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`moderator` text DEFAULT '' NOT NULL,
	`cover_file` text,
	`book_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_journey_books`("number", "discussed_on", "title", "author", "summary", "moderator", "cover_file", "book_id", "created_at", "updated_at") SELECT "number", "discussed_on", "title", "author", '', '', NULL, "book_id", "created_at", "updated_at" FROM `journey_books`;--> statement-breakpoint
DROP TABLE `journey_books`;--> statement-breakpoint
ALTER TABLE `__new_journey_books` RENAME TO `journey_books`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_journey_books_book` ON `journey_books` (`book_id`);