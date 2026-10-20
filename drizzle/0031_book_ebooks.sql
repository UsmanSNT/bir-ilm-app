CREATE TABLE `book_ebooks` (
	`book_id` text PRIMARY KEY NOT NULL,
	`body` text NOT NULL,
	`chars` integer DEFAULT 0 NOT NULL,
	`updated_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
