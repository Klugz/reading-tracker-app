CREATE TABLE `student_account_events` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`teacher_id` text NOT NULL,
	`action` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `reading_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`teacher_id`) REFERENCES `reading_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_student_account_events_student` ON `student_account_events` (`student_id`);--> statement-breakpoint
CREATE TABLE `student_login_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_login_attempt_expiry` ON `student_login_attempts` (`expires_at`);--> statement-breakpoint
CREATE TABLE `managed_students` (
	`student_id` text PRIMARY KEY NOT NULL,
	`teacher_id` text NOT NULL,
	`legacy_identity` text,
	`email` text,
	`password_hash` text NOT NULL,
	`must_change_password` integer DEFAULT 1 NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`auth_version` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `reading_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`teacher_id`) REFERENCES `reading_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `managed_students_legacy_identity_unique` ON `managed_students` (`legacy_identity`);--> statement-breakpoint
CREATE INDEX `idx_managed_teacher` ON `managed_students` (`teacher_id`);--> statement-breakpoint
CREATE TABLE `student_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`auth_version` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `reading_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_student_sessions_student` ON `student_sessions` (`student_id`);--> statement-breakpoint
CREATE INDEX `idx_student_sessions_expiry` ON `student_sessions` (`expires_at`);
PRAGMA optimize;
