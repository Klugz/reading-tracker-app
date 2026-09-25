CREATE TABLE `reading_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`teacher_id` text NOT NULL,
	`student_id` text NOT NULL,
	`book_id` text NOT NULL,
	`assigned_at` text NOT NULL,
	`deadline` text,
	`progress` integer DEFAULT 0 NOT NULL,
	`started_at` text,
	`updated_at` text,
	`completed_at` text,
	`version` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`teacher_id`) REFERENCES `reading_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `reading_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_assignment_pair` ON `reading_assignments` (`book_id`,`student_id`);--> statement-breakpoint
CREATE INDEX `idx_assignment_teacher` ON `reading_assignments` (`teacher_id`);--> statement-breakpoint
CREATE INDEX `idx_assignment_student` ON `reading_assignments` (`student_id`);--> statement-breakpoint
CREATE TABLE `teacher_students` (
	`id` text PRIMARY KEY NOT NULL,
	`teacher_id` text NOT NULL,
	`student_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`teacher_id`) REFERENCES `reading_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `reading_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_links_teacher` ON `teacher_students` (`teacher_id`);--> statement-breakpoint
CREATE INDEX `idx_links_student` ON `teacher_students` (`student_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_links_pair` ON `teacher_students` (`teacher_id`,`student_id`);--> statement-breakpoint
CREATE TABLE `reading_events` (
	`id` text PRIMARY KEY NOT NULL,
	`assignment_id` text NOT NULL,
	`progress` integer NOT NULL,
	`previous_progress` integer NOT NULL,
	`created_at` text NOT NULL,
	`version` integer NOT NULL,
	FOREIGN KEY (`assignment_id`) REFERENCES `reading_assignments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_events_assignment_date` ON `reading_events` (`assignment_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_events_version` ON `reading_events` (`assignment_id`,`version`);--> statement-breakpoint
CREATE TABLE `reading_users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`invite_code` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reading_users_invite_code_unique` ON `reading_users` (`invite_code`);--> statement-breakpoint
ALTER TABLE `books` ADD `unit` text DEFAULT 'pages' NOT NULL;--> statement-breakpoint
ALTER TABLE `books` ADD `cover_url` text;