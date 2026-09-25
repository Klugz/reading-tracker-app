CREATE TABLE `books` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`author` text NOT NULL,
	`total_pages` integer NOT NULL,
	`current_page` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'reading' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_books_owner_status` ON `books` (`owner_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_books_owner_updated` ON `books` (`owner_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `goals` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`target_books` integer NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_goals_owner_end` ON `goals` (`owner_id`,`end_date`);
--> statement-breakpoint
PRAGMA optimize;
