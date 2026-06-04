import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const registryListings = sqliteTable(
	"registry_listings",
	{
		slug: text("slug").primaryKey().notNull(),
		kind: text("kind", { enum: ["plugin", "theme"] }).notNull(),
		name: text("name").notNull(),
		version: text("version").notNull(),
		description: text("description").notNull(),
		repository: text("repository"),
		featured: integer("featured", { mode: "boolean" }).notNull().default(false),
		downloads: integer("downloads").notNull().default(0),
		updatedAt: text("updated_at").notNull(),
		listingJson: text("listing_json").notNull()
	},
	(table) => [
		index("idx_registry_listings_kind").on(table.kind),
		index("idx_registry_listings_updated_at").on(table.updatedAt),
		index("idx_registry_listings_featured").on(table.featured)
	]
);

export const registrySubmissions = sqliteTable(
	"registry_submissions",
	{
		id: text("id").primaryKey().notNull(),
		status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull(),
		createdAt: text("created_at").notNull(),
		updatedAt: text("updated_at").notNull(),
		repository: text("repository"),
		githubRef: text("github_ref"),
		notes: text("notes"),
		listingJson: text("listing_json"),
		listingsJson: text("listings_json").notNull(),
		submissionJson: text("submission_json").notNull()
	},
	(table) => [
		index("idx_registry_submissions_status").on(table.status),
		index("idx_registry_submissions_created_at").on(table.createdAt),
		index("idx_registry_submissions_repository").on(table.repository)
	]
);
