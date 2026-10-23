CREATE TABLE `journey_books` (
	`number` integer PRIMARY KEY NOT NULL,
	`discussed_on` text NOT NULL,
	`title` text NOT NULL,
	`author` text DEFAULT '' NOT NULL,
	`book_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_journey_books_book` ON `journey_books` (`book_id`);--> statement-breakpoint
ALTER TABLE `books` ADD `active_since` text;--> statement-breakpoint
-- Avval belgilangan suhbatlar ham ro'yxatga tushadi: kutubxonadagi kitob nomiga mos har bir suhbat o'z shanbasiga
-- (Toshkent sanasi bo'yicha shu kun yoki keyingi shanba) yoziladi. Tartib raqami «Biz haqimizda» tayanch nuqtasidan.
-- Bir shanbada bir nechta suhbat bo'lsa, eng kechgisi qoladi.
INSERT OR REPLACE INTO `journey_books` (`number`, `discussed_on`, `title`, `author`, `book_id`)
SELECT `anchor_number` + CAST(round((julianday(`saturday`) - julianday(`anchor_date`)) / 7) AS INTEGER), `saturday`, `title`, `author`, `id`
FROM (
  SELECT b.`id`, b.`title`, b.`author`, s.`scheduled_at`,
    date(s.`scheduled_at`, '+5 hours', '+' || ((13 - CAST(strftime('%w', s.`scheduled_at`, '+5 hours') AS INTEGER)) % 7) || ' days') AS `saturday`,
    COALESCE(CASE WHEN json_valid(a.`value`) THEN json_extract(a.`value`, '$.anchor.number') END, 248) AS `anchor_number`,
    COALESCE(CASE WHEN json_valid(a.`value`) THEN json_extract(a.`value`, '$.anchor.date') END, '2026-10-24') AS `anchor_date`
  FROM `live_sessions` s
  JOIN `books` b ON b.`kind` = 'library' AND lower(trim(b.`title`)) = lower(trim(s.`book_title`))
  LEFT JOIN `site_settings` a ON a.`key` = 'about'
)
WHERE `anchor_number` + CAST(round((julianday(`saturday`) - julianday(`anchor_date`)) / 7) AS INTEGER) >= 1
ORDER BY `scheduled_at`;
