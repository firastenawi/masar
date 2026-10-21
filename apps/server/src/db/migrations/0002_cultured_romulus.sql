CREATE TABLE `study_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`path_id` text,
	`task_id` text,
	`started_at` text NOT NULL,
	`local_date` text NOT NULL,
	`duration_minutes` integer NOT NULL,
	`topics` text,
	`resources` text,
	`notes` text,
	`problems` text,
	`solutions` text,
	`accomplished` text,
	`review_later` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`archived_at` text,
	FOREIGN KEY (`path_id`) REFERENCES `learning_paths`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sessions_duration_chk" CHECK("study_sessions"."duration_minutes" between 1 and 1440)
);
--> statement-breakpoint
CREATE INDEX `sessions_date_idx` ON `study_sessions` (`local_date`);--> statement-breakpoint
CREATE INDEX `sessions_path_idx` ON `study_sessions` (`path_id`);--> statement-breakpoint
CREATE INDEX `sessions_task_idx` ON `study_sessions` (`task_id`);