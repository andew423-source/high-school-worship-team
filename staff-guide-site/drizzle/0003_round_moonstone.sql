CREATE TABLE `group_rule_members` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_id` text NOT NULL,
	`student_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_group_rule_members_rule_student` ON `group_rule_members` (`rule_id`,`student_id`);--> statement-breakpoint
CREATE INDEX `idx_group_rule_members_rule` ON `group_rule_members` (`rule_id`);--> statement-breakpoint
CREATE TABLE `group_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`term_id` text NOT NULL,
	`type` text NOT NULL,
	`config_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_group_rules_term` ON `group_rules` (`term_id`);--> statement-breakpoint
CREATE TABLE `grouping_settings` (
	`term_id` text PRIMARY KEY NOT NULL,
	`student_min` integer DEFAULT 1 NOT NULL,
	`student_max` integer DEFAULT 8 NOT NULL,
	`staff_min` integer DEFAULT 1 NOT NULL,
	`staff_max` integer DEFAULT 1 NOT NULL,
	`cluster_gender` integer DEFAULT false NOT NULL,
	`cluster_grade` integer DEFAULT false NOT NULL,
	`split_worship_role` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
