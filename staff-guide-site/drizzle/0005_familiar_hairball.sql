CREATE TABLE `stage_overrides` (
	`id` text PRIMARY KEY NOT NULL,
	`service_id` text NOT NULL,
	`student_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_stage_overrides_service_student` ON `stage_overrides` (`service_id`,`student_id`);--> statement-breakpoint
CREATE INDEX `idx_stage_overrides_service` ON `stage_overrides` (`service_id`);--> statement-breakpoint
ALTER TABLE `services` ADD `special_notes` text;