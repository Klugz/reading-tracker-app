CREATE TABLE `teacher_accounts` (
	`teacher_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`auth_version` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`teacher_id`) REFERENCES `reading_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `teacher_accounts_email_unique` ON `teacher_accounts` (`email`);--> statement-breakpoint
CREATE TABLE `teacher_login_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_teacher_login_expiry` ON `teacher_login_attempts` (`expires_at`);--> statement-breakpoint
CREATE TABLE `teacher_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`teacher_id` text NOT NULL,
	`auth_version` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`teacher_id`) REFERENCES `reading_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_teacher_sessions_teacher` ON `teacher_sessions` (`teacher_id`);--> statement-breakpoint
CREATE INDEX `idx_teacher_sessions_expiry` ON `teacher_sessions` (`expires_at`);
--> statement-breakpoint
INSERT INTO reading_users(id,name,role,invite_code,created_at) VALUES('teacher-henrique-klug','Henrique Klug','teacher','ab6ea03425d7c9e5ba3a3cecac34618d1f95c787bd0049ad',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
--> statement-breakpoint
INSERT INTO teacher_accounts(teacher_id,email,password_hash) VALUES('teacher-henrique-klug','henriqueklug@gmal.com','scrypt$16384$8$5$a3238fb3f81ce24ee2812a24c015a4c5$6e58d00808124ee46a6a4f92ecb01b44c388d07321077b1142f4692560355329');
