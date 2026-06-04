import type { ListingKind, RegistryListing } from "./types";

export type ParsedListingForm = {
	kind: ListingKind;
	slug: string;
	name: string;
	version: string;
	entry: string;
	description: string;
	author: string;
	authorUrl: string;
	repository: string;
	homepage: string;
	tags: string[];
	compatibility: string;
	files: string[];
	featured: boolean;
	publish: boolean;
	notes: string;
};

export function parseListingForm(form: FormData): ParsedListingForm | { error: string } {
	const kind = stringField(form, "kind") as ListingKind;
	const slug = slugify(stringField(form, "slug"));
	const name = stringField(form, "name");
	const version = stringField(form, "version");
	const entry = stringField(form, "entry") || "index.js";
	const description = stringField(form, "description");
	const author = stringField(form, "author");

	if (!["plugin", "theme"].includes(kind)) {
		return { error: "Choose plugin or theme." };
	}
	if (!slug) {
		return { error: "Slug is required and must contain letters or numbers." };
	}
	if (!name || !version || !description || !author) {
		return { error: "Name, version, description, and author are required." };
	}

	const files = splitList(stringField(form, "files"));

	return {
		kind,
		slug,
		name,
		version,
		entry,
		description,
		author,
		authorUrl: stringField(form, "authorUrl"),
		repository: stringField(form, "repository"),
		homepage: stringField(form, "homepage"),
		tags: splitList(stringField(form, "tags")),
		compatibility: stringField(form, "compatibility") || ">=0.1.0",
		files: files.length ? files : [entry],
		featured: booleanField(form, "featured"),
		publish: booleanField(form, "publish"),
		notes: stringField(form, "notes")
	};
}

export function listingFromParsedForm(parsed: ParsedListingForm, now: string): RegistryListing {
	return {
		schema: "https://maoloader.com/schemas/plugin.v1.json",
		kind: parsed.kind,
		slug: parsed.slug,
		name: parsed.name,
		version: parsed.version,
		entry: parsed.entry,
		description: parsed.description,
		author: {
			name: parsed.author,
			url: parsed.authorUrl || undefined
		},
		repository: parsed.repository || undefined,
		homepage: parsed.homepage || undefined,
		tags: parsed.tags,
		compatibility: {
			maoloader: parsed.compatibility
		},
		files: parsed.files,
		featured: parsed.featured,
		downloads: 0,
		updated_at: now,
		assets: {
			screenshots: []
		}
	};
}

export function stringField(form: FormData, name: string) {
	const value = form.get(name);
	return typeof value === "string" ? value.trim() : "";
}

export function isGitHubRepository(value: string) {
	try {
		const url = new URL(value);
		const parts = url.pathname
			.replace(/^\/+|\/+$/g, "")
			.split("/")
			.filter(Boolean);
		return url.hostname === "github.com" && parts.length >= 2;
	} catch {
		return false;
	}
}

function splitList(value: string) {
	return value
		.split(",")
		.map((entry) => entry.trim())
		.filter(Boolean);
}

function booleanField(form: FormData, name: string) {
	const value = form.get(name);
	return typeof value === "string" && ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function slugify(value: string) {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, "-")
		.replace(/^-+|-+$/g, "");
}
