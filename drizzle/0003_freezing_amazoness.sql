CREATE TABLE `reading_class_books` (
	`id` text PRIMARY KEY NOT NULL,
	`class_id` text NOT NULL,
	`book_id` text NOT NULL,
	`assigned_at` text NOT NULL,
	FOREIGN KEY (`class_id`) REFERENCES `reading_classes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_class_books_pair` ON `reading_class_books` (`class_id`,`book_id`);--> statement-breakpoint
CREATE TABLE `reading_class_members` (
	`id` text PRIMARY KEY NOT NULL,
	`class_id` text NOT NULL,
	`student_id` text NOT NULL,
	`joined_at` text NOT NULL,
	FOREIGN KEY (`class_id`) REFERENCES `reading_classes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `reading_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_class_member_pair` ON `reading_class_members` (`class_id`,`student_id`);--> statement-breakpoint
CREATE INDEX `idx_class_members_student` ON `reading_class_members` (`student_id`);--> statement-breakpoint
CREATE TABLE `reading_classes` (
	`id` text PRIMARY KEY NOT NULL,
	`teacher_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`archived_at` text,
	`deleted_at` text,
	`created_at` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`mutation_key` text,
	FOREIGN KEY (`teacher_id`) REFERENCES `reading_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_classes_teacher` ON `reading_classes` (`teacher_id`);--> statement-breakpoint
DROP INDEX `idx_assignment_pair`;--> statement-breakpoint
ALTER TABLE `reading_assignments` ADD `class_id` text REFERENCES reading_classes(id);--> statement-breakpoint
ALTER TABLE `reading_assignments` ADD `origin_key` text DEFAULT 'individual' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_assignment_origin` ON `reading_assignments` (`book_id`,`student_id`,`origin_key`);--> statement-breakpoint
CREATE INDEX `idx_assignments_class` ON `reading_assignments` (`class_id`);