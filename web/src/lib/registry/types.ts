export type ListingKind = "plugin" | "theme";

export type RegistryAuthor = {
	name: string;
	url?: string;
};

export type RegistryCompatibility = {
	maoloader: string;
};

export type RegistryAsset = {
	key: string;
	url?: string;
	size?: number;
	sha256?: string;
};

export type RegistryRating = {
	/** 1 to 5, one decimal. */
	average: number;
	count: number;
};

export type RegistryVersion = {
	version: string;
	published_at: string;
};

export type RegistryListing = {
	schema: string;
	kind: ListingKind;
	slug: string;
	name: string;
	version: string;
	entry: string;
	description: string;
	author: RegistryAuthor;
	repository?: string;
	homepage?: string;
	tags: string[];
	compatibility: RegistryCompatibility;
	files: string[];
	image_path?: string;
	featured?: boolean;
	downloads?: number;
	/** Visitors' stars, added when the listing is read; never stored in the listing itself. */
	rating?: RegistryRating;
	/** README.md from the package, shown on the plugin page. */
	readme?: string;
	/** CHANGELOG.md from the package: one "## <version>" section per release. */
	changelog?: string;
	/** Earlier published versions, newest first. */
	history?: RegistryVersion[];
	updated_at: string;
	assets: {
		package?: RegistryAsset;
		icon?: RegistryAsset;
		screenshots?: RegistryAsset[];
	};
};

export type RegistrySummary = Pick<
	RegistryListing,
	| "kind"
	| "slug"
	| "name"
	| "version"
	| "description"
	| "author"
	| "repository"
	| "tags"
	| "compatibility"
	| "featured"
	| "downloads"
	| "rating"
	| "updated_at"
	| "assets"
>;

export type RegistryIndex = {
	generated_at: string;
	items: RegistrySummary[];
};

export type RegistryFilters = {
	kind?: ListingKind | "all";
	query?: string;
	tag?: string;
};

export type RegistrySubmission = {
	id: string;
	status: "pending" | "approved" | "rejected";
	created_at: string;
	updated_at: string;
	repository?: string;
	listing?: RegistryListing;
	listings?: RegistryListing[];
	github_ref?: string;
	notes?: string;
	/** Why a reviewer rejected it, shown in the admin history. */
	review_note?: string;
	reviewed_at?: string;
};
