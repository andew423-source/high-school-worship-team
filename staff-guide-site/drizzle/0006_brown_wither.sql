ALTER TABLE `staff` ADD `gender` text;--> statement-breakpoint
ALTER TABLE `stage_overrides` ADD `kind` text DEFAULT 'force' NOT NULL;