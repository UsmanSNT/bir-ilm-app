CREATE TABLE `wisdoms` (
	`id` text PRIMARY KEY NOT NULL,
	`text` text NOT NULL,
	`author` text DEFAULT 'Bir Ilm' NOT NULL,
	`featured_on` text,
	`created_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_wisdoms_created` ON `wisdoms` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_wisdoms_featured` ON `wisdoms` (`featured_on`);
--> statement-breakpoint
-- Boshlang'ich hikmatlar: ilovadagi avvalgi ro'yxat, o'sha tartibda (bugungi hikmat o'zgarmasin).
INSERT INTO `wisdoms` (`id`, `text`, `author`, `created_at`, `updated_at`) VALUES ('q7hocy', 'Har bir o‘qilgan sahifa yangi fikrga yo‘l ochadi.', 'Bir Ilm', '2026-01-01 00:00:00', '2026-01-01 00:00:00');
--> statement-breakpoint
INSERT INTO `wisdoms` (`id`, `text`, `author`, `created_at`, `updated_at`) VALUES ('atx1pe', 'Bugungi kichik qadam ertangi o‘zgarishning boshlanishi.', 'Bir Ilm', '2026-01-01 00:00:01', '2026-01-01 00:00:01');
--> statement-breakpoint
INSERT INTO `wisdoms` (`id`, `text`, `author`, `created_at`, `updated_at`) VALUES ('d1j461', 'O‘qish — o‘zingiz bilan qiladigan sokin suhbat.', 'Bir Ilm', '2026-01-01 00:00:02', '2026-01-01 00:00:02');
--> statement-breakpoint
INSERT INTO `wisdoms` (`id`, `text`, `author`, `created_at`, `updated_at`) VALUES ('gre9wv', 'Bir sahifa ham hisoblanadi. Muhimi, to‘xtamaslik.', 'Bir Ilm', '2026-01-01 00:00:03', '2026-01-01 00:00:03');
