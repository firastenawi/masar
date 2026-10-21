CREATE TABLE `change_log` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`entity_title` text NOT NULL,
	`path_id` text NOT NULL,
	`action` text NOT NULL,
	`before` text,
	`after` text,
	`source` text DEFAULT 'user' NOT NULL,
	`reason` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `change_log_path_idx` ON `change_log` (`path_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `learning_paths` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`goal` text,
	`current_level` integer DEFAULT 1 NOT NULL,
	`target_level` integer DEFAULT 3 NOT NULL,
	`start_date` text,
	`target_date` text,
	`status` text DEFAULT 'active' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`archived_at` text,
	CONSTRAINT "paths_levels_chk" CHECK("learning_paths"."current_level" between 1 and 5 and "learning_paths"."target_level" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE `skills` (
	`id` text PRIMARY KEY NOT NULL,
	`path_id` text NOT NULL,
	`name` text NOT NULL,
	`target_level` integer DEFAULT 3 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`archived_at` text,
	FOREIGN KEY (`path_id`) REFERENCES `learning_paths`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `skills_path_idx` ON `skills` (`path_id`);--> statement-breakpoint
CREATE TABLE `stages` (
	`id` text PRIMARY KEY NOT NULL,
	`path_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`target_date` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`archived_at` text,
	FOREIGN KEY (`path_id`) REFERENCES `learning_paths`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `stages_path_idx` ON `stages` (`path_id`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`stage_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`type` text DEFAULT 'lesson' NOT NULL,
	`status` text DEFAULT 'not_started' NOT NULL,
	`priority` text DEFAULT 'medium' NOT NULL,
	`difficulty` integer DEFAULT 2 NOT NULL,
	`weight` integer DEFAULT 1 NOT NULL,
	`estimate_minutes` integer,
	`due_date` text,
	`completed_at` text,
	`notes` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`archived_at` text,
	FOREIGN KEY (`stage_id`) REFERENCES `stages`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "tasks_weight_chk" CHECK("tasks"."weight" between 1 and 10),
	CONSTRAINT "tasks_difficulty_chk" CHECK("tasks"."difficulty" between 1 and 5)
);
--> statement-breakpoint
CREATE INDEX `tasks_stage_idx` ON `tasks` (`stage_id`);--> statement-breakpoint
CREATE INDEX `tasks_due_idx` ON `tasks` (`due_date`);