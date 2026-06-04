CREATE TABLE `registry_listings` (
	`slug` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`version` text NOT NULL,
	`description` text NOT NULL,
	`repository` text,
	`featured` integer DEFAULT false NOT NULL,
	`downloads` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	`listing_json` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_registry_listings_kind` ON `registry_listings` (`kind`);--> statement-breakpoint
CREATE INDEX `idx_registry_listings_updated_at` ON `registry_listings` (`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_registry_listings_featured` ON `registry_listings` (`featured`);--> statement-breakpoint
CREATE TABLE `registry_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`repository` text,
	`github_ref` text,
	`notes` text,
	`listing_json` text,
	`listings_json` text NOT NULL,
	`submission_json` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_registry_submissions_status` ON `registry_submissions` (`status`);--> statement-breakpoint
CREATE INDEX `idx_registry_submissions_created_at` ON `registry_submissions` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_registry_submissions_repository` ON `registry_submissions` (`repository`);