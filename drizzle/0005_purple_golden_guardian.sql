CREATE TABLE `reading_deadline_events` (
	`id` text PRIMARY KEY NOT NULL,
	`teacher_id` text NOT NULL,
	`class_assignment_id` text,
	`assignment_id` text,
	`previous_deadline` text,
	`deadline` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`teacher_id`) REFERENCES `reading_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`class_assignment_id`) REFERENCES `reading_class_books`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assignment_id`) REFERENCES `reading_assignments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_deadline_class` ON `reading_deadline_events` (`class_assignment_id`);--> statement-breakpoint
CREATE INDEX `idx_deadline_assignment` ON `reading_deadline_events` (`assignment_id`);--> statement-breakpoint
ALTER TABLE `reading_assignments` ADD `class_assignment_id` text REFERENCES reading_class_books(id);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_assignment_class_student` ON `reading_assignments` (`class_assignment_id`,`student_id`);--> statement-breakpoint
ALTER TABLE `reading_class_books` ADD `deadline` text;--> statement-breakpoint
ALTER TABLE `reading_class_books` ADD `deadline_initialized` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `reading_class_books` ADD `version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `reading_events` ADD `kind` text DEFAULT 'progress' NOT NULL;--> statement-breakpoint
ALTER TABLE `reading_events` ADD `actor_id` text REFERENCES reading_users(id);--> statement-breakpoint
ALTER TABLE `reading_events` ADD `reason` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `reading_events` ADD `completion_deadline` text;--> statement-breakpoint
ALTER TABLE `reading_events` ADD `deadline_recorded` integer DEFAULT 0 NOT NULL;