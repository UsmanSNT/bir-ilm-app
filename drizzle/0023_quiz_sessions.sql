CREATE TABLE `quiz_results` (
	`id` text PRIMARY KEY NOT NULL,
	`quiz_id` text NOT NULL,
	`session_id` text,
	`user_id` text NOT NULL,
	`correct` integer NOT NULL,
	`total` integer NOT NULL,
	`score` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`quiz_id`) REFERENCES `quizzes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `quiz_sessions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_quiz_results_session` ON `quiz_results` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_quiz_results_user` ON `quiz_results` (`user_id`);--> statement-breakpoint
CREATE TABLE `quiz_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`quiz_id` text NOT NULL,
	`starts_at` text NOT NULL,
	`code` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`quiz_id`) REFERENCES `quizzes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_quiz_sessions_code` ON `quiz_sessions` (`code`);--> statement-breakpoint
CREATE INDEX `idx_quiz_sessions_quiz` ON `quiz_sessions` (`quiz_id`,`starts_at`);