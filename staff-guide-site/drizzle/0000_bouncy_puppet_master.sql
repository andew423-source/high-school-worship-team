CREATE TABLE `app_users` (
	`id` text PRIMARY KEY NOT NULL,
	`platform_user_id` text NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`status` text NOT NULL,
	`staff_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_app_users_platform_user_id` ON `app_users` (`platform_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_app_users_email` ON `app_users` (`email`);--> statement-breakpoint
CREATE TABLE `attendance` (
	`id` text PRIMARY KEY NOT NULL,
	`meeting_id` text NOT NULL,
	`student_id` text NOT NULL,
	`status` text NOT NULL,
	`note` text,
	`updated_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_attendance_meeting_student` ON `attendance` (`meeting_id`,`student_id`);--> statement-breakpoint
CREATE INDEX `idx_attendance_student` ON `attendance` (`student_id`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`before_json` text,
	`after_json` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_audit_logs_created` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `group_constraints` (
	`id` text PRIMARY KEY NOT NULL,
	`term_id` text NOT NULL,
	`type` text NOT NULL,
	`student_a_id` text NOT NULL,
	`student_b_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_group_constraints_term` ON `group_constraints` (`term_id`);--> statement-breakpoint
CREATE TABLE `group_members` (
	`id` text PRIMARY KEY NOT NULL,
	`term_id` text NOT NULL,
	`group_id` text NOT NULL,
	`student_id` text NOT NULL,
	`assigned_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_group_members_term_student` ON `group_members` (`term_id`,`student_id`);--> statement-breakpoint
CREATE INDEX `idx_group_members_group` ON `group_members` (`group_id`);--> statement-breakpoint
CREATE TABLE `group_staff` (
	`id` text PRIMARY KEY NOT NULL,
	`term_id` text NOT NULL,
	`group_id` text NOT NULL,
	`staff_id` text NOT NULL,
	`assigned_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_group_staff_term_staff` ON `group_staff` (`term_id`,`staff_id`);--> statement-breakpoint
CREATE INDEX `idx_group_staff_group` ON `group_staff` (`group_id`);--> statement-breakpoint
CREATE TABLE `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`term_id` text NOT NULL,
	`name` text NOT NULL,
	`capacity` integer NOT NULL,
	`required_staff` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_groups_term_name` ON `groups` (`term_id`,`name`);--> statement-breakpoint
CREATE INDEX `idx_groups_term` ON `groups` (`term_id`);--> statement-breakpoint
CREATE TABLE `import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`filename` text NOT NULL,
	`object_key` text NOT NULL,
	`row_count` integer NOT NULL,
	`imported_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_import_batches_kind_created` ON `import_batches` (`kind`,`created_at`);--> statement-breakpoint
CREATE TABLE `meetings` (
	`id` text PRIMARY KEY NOT NULL,
	`term_id` text NOT NULL,
	`meeting_date` text NOT NULL,
	`kind` text DEFAULT 'regular' NOT NULL,
	`title` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_meetings_term_date` ON `meetings` (`term_id`,`meeting_date`);--> statement-breakpoint
CREATE INDEX `idx_meetings_date` ON `meetings` (`meeting_date`);--> statement-breakpoint
CREATE TABLE `services` (
	`id` text PRIMARY KEY NOT NULL,
	`term_id` text NOT NULL,
	`meeting_id` text NOT NULL,
	`sunday_date` text NOT NULL,
	`service_part` integer NOT NULL,
	`singer_slots` integer NOT NULL,
	`choir_slots` integer NOT NULL,
	`leader_type` text,
	`leader_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_services_date_part` ON `services` (`sunday_date`,`service_part`);--> statement-breakpoint
CREATE INDEX `idx_services_term` ON `services` (`term_id`);--> statement-breakpoint
CREATE TABLE `staff` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`duty` text,
	`can_sing` integer DEFAULT false NOT NULL,
	`can_lead_group` integer DEFAULT false NOT NULL,
	`preferred_service` integer,
	`active` integer DEFAULT true NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_staff_active` ON `staff` (`active`);--> statement-breakpoint
CREATE INDEX `idx_staff_email` ON `staff` (`email`);--> statement-breakpoint
CREATE TABLE `staff_availability` (
	`id` text PRIMARY KEY NOT NULL,
	`sunday_date` text NOT NULL,
	`staff_id` text NOT NULL,
	`present` integer DEFAULT false NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_staff_availability_date_staff` ON `staff_availability` (`sunday_date`,`staff_id`);--> statement-breakpoint
CREATE TABLE `stage_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`service_id` text NOT NULL,
	`person_type` text NOT NULL,
	`person_id` text NOT NULL,
	`role` text NOT NULL,
	`side` text NOT NULL,
	`position_order` integer NOT NULL,
	`reason` text,
	`is_manual` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_stage_assignments_service_person` ON `stage_assignments` (`service_id`,`person_type`,`person_id`);--> statement-breakpoint
CREATE INDEX `idx_stage_assignments_history` ON `stage_assignments` (`person_type`,`person_id`);--> statement-breakpoint
CREATE TABLE `students` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`grade` integer,
	`gender` text,
	`service_part` integer NOT NULL,
	`is_student_leader` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_students_active_service` ON `students` (`active`,`service_part`);--> statement-breakpoint
CREATE INDEX `idx_students_name` ON `students` (`name`);--> statement-breakpoint
CREATE TABLE `terms` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`eligible_statuses` text DEFAULT 'present' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_terms_status` ON `terms` (`status`);