CREATE TABLE `ai_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`path_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`archived_at` text,
	FOREIGN KEY (`path_id`) REFERENCES `learning_paths`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ai_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`provider` text,
	`model` text,
	`input_tokens` integer,
	`output_tokens` integer,
	`cost_usd` real,
	`duration_ms` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `ai_conversations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ai_messages_conversation_idx` ON `ai_messages` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `ai_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`summary` text NOT NULL,
	`operations` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`error` text,
	`decided_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `ai_messages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_proposals_message_id_unique` ON `ai_proposals` (`message_id`);