ALTER TABLE `books` ADD `kind` text DEFAULT 'library' NOT NULL;
--> statement-breakpoint
-- Mavjud ma'lumot: audiosiz, narxi qo'yilgan kitoblar do'kon mahsulotiga aylanadi (cart/sharh/buyurtma id'si o'zgarmaydi).
UPDATE `books` SET `kind` = 'store', `active` = 0 WHERE `price` > 0 AND `audio_file` IS NULL AND NOT EXISTS (SELECT 1 FROM `book_tracks` WHERE `book_tracks`.`book_id` = `books`.`id`);
--> statement-breakpoint
-- Audiosi bor (kutubxona/suhbat) kitoblarda narx bo'lmaydi: do'konga alohida mahsulot sifatida qo'shiladi.
UPDATE `books` SET `price` = 0, `category` = '' WHERE `kind` = 'library';
