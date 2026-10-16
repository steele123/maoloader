-- One rating per visitor per listing. `voter` is a salted hash, never an address.
CREATE TABLE `listing_ratings` (
	`slug` text NOT NULL,
	`voter` text NOT NULL,
	`stars` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY (`slug`, `voter`)
);
--> statement-breakpoint
CREATE INDEX `idx_listing_ratings_slug` ON `listing_ratings` (`slug`);
