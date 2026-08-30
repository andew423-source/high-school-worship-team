CREATE TABLE `term_students` (
	`id` text PRIMARY KEY NOT NULL,
	`term_id` text NOT NULL,
	`student_id` text NOT NULL,
	`grade` integer,
	`gender` text,
	`service_part` integer NOT NULL,
	`worship_team` text,
	`is_student_leader` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_term_students_term_student` ON `term_students` (`term_id`,`student_id`);--> statement-breakpoint
CREATE INDEX `idx_term_students_term_active_service` ON `term_students` (`term_id`,`active`,`service_part`);--> statement-breakpoint
ALTER TABLE `import_batches` ADD `term_id` text;--> statement-breakpoint
INSERT OR IGNORE INTO `term_students` (
  `id`, `term_id`, `student_id`, `grade`, `gender`, `service_part`,
  `worship_team`, `is_student_leader`, `active`, `created_at`, `updated_at`
)
SELECT
  'termstudent_' || lower(hex(randomblob(16))), `terms`.`id`, `students`.`id`,
  `students`.`grade`, `students`.`gender`, `students`.`service_part`,
  `students`.`worship_team`, `students`.`is_student_leader`, `students`.`active`,
  `students`.`created_at`, `students`.`updated_at`
FROM `students`
JOIN `terms` ON `terms`.`status` = 'active';--> statement-breakpoint
UPDATE `import_batches`
SET `term_id` = (
  SELECT `id` FROM `terms`
  WHERE `status` = 'active'
  ORDER BY `start_date` DESC
  LIMIT 1
)
WHERE `kind` = 'students' AND `term_id` IS NULL;
