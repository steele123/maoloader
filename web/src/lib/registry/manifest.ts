import { fetchGitHubFile, parseGitHubRepository, rawGitHubUrl } from "./github";
import type { ListingKind, RegistryListing } from "./types";

type ManifestAuthor =
	| string
	| {
			name?: unknown;
			url?: unknown;
	  };

type ManifestPlugin = {
	kind?: unknown;
	type?: unknown;
	slug?: unknown;
	id?: unknown;
	title?: unknown;
	name?: unknown;
	version?: unknown;
	entry?: unknown;
	description?: unknown;
	author?: ManifestAuthor;
	authorUrl?: unknown;
	repository?: unknown;
	homepage?: unknown;
	tags?: unknown;
	compatibility?: unknown;
	files?: unknown;
	image?: unknown;
	imagePath?: unknown;
	image_path?: unknown;
};

type MaoloaderManifest = {
	repository?: unknown;
	author?: ManifestAuthor;
	plugins?: unknown;
};

export type ManifestListingResult = {
	ref: string;
	repository: string;
	listings: RegistryListing[];
};

export async function loadListingsFromManifest(
	repository: string,
	ref: string | undefined,
	now: string,
	manifestPath = "maoloader.json"
): Promise<ManifestListingResult> {
	const parsedRepo = parseGitHubRepository(repository);
	if (!parsedRepo) {
		throw new Error("Repository must be a GitHub URL like https://github.com/owner/repo");
	}

	const normalizedManifestPath = normalizeManifestPath(manifestPath);
	const manifestFile = await fetchGitHubFile(parsedRepo.url, normalizedManifestPath, ref);
	const manifest = parseManifestJson(manifestFile.text);
	validateRootKeys(manifest);
	const manifestRepository = stringValue(manifest.repository);
	if (!manifestRepository || !hasAuthor(manifest.author)) {
		throw new Error("maoloader.json root must include repository and author.");
	}
	const manifestRepo = parseGitHubRepository(manifestRepository);
	if (!manifestRepo || manifestRepo.url !== parsedRepo.url) {
		throw new Error("maoloader.json repository must match the submitted GitHub repository.");
	}
	if (!Array.isArray(manifest.plugins) || manifest.plugins.length === 0) {
		throw new Error("maoloader.json must include a non-empty plugins array.");
	}

	const listings = manifest.plugins.map((entry, index) =>
		listingFromManifestPlugin(manifest, entry, parsedRepo.url, manifestFile.ref, now, index)
	);
	const slugs = new Set<string>();
	for (const listing of listings) {
		if (slugs.has(listing.slug)) {
			throw new Error(`maoloader.json includes duplicate slug "${listing.slug}".`);
		}
		slugs.add(listing.slug);
	}

	return {
		ref: manifestFile.ref,
		repository: parsedRepo.url,
		listings
	};
}

function listingFromManifestPlugin(
	manifest: MaoloaderManifest,
	entry: unknown,
	repository: string,
	ref: string,
	now: string,
	index: number
): RegistryListing {
	if (!isObject(entry)) {
		throw new Error(`Plugin entry ${index + 1} must be an object.`);
	}
	const plugin = entry as ManifestPlugin;
	const kind = listingKind(plugin.kind ?? plugin.type);
	const title = stringValue(plugin.title) || stringValue(plugin.name);
	const slug = slugify(stringValue(plugin.slug) || stringValue(plugin.id) || title);
	const version = stringValue(plugin.version);
	const description = stringValue(plugin.description);
	const entryFile = stringValue(plugin.entry) || "index.js";
	const imagePath =
		stringValue(plugin.image_path) ||
		stringValue(plugin.imagePath) ||
		stringValue(plugin.image);
	const author = authorFromManifest(plugin.author ?? manifest.author);
	const files = listValue(plugin.files).length
		? listValue(plugin.files)
		: [entryFile];

	if (!slug) {
		throw new Error(`Plugin entry ${index + 1} is missing a slug or title.`);
	}
	if (!title || !version || !description || !imagePath) {
		throw new Error(`Plugin "${slug}" must include title, version, description, and image.`);
	}

	const authorName = author.name || "Unknown";
	return {
		schema: "https://maoloader.dev/schemas/plugin.v1.json",
		kind,
		slug,
		name: title,
		version,
		entry: entryFile,
		description,
		author: {
			name: authorName,
			url: stringValue(plugin.authorUrl) || author.url || undefined
		},
		repository,
		homepage: stringValue(plugin.homepage) || undefined,
		tags: listValue(plugin.tags),
		compatibility: {
			maoloader: stringValue(plugin.compatibility) || ">=0.1.0"
		},
		files,
		image_path: imagePath || undefined,
		downloads: 0,
		updated_at: now,
		assets: {
			icon: imagePath
				? {
						key: imagePath,
						url: rawGitHubUrl(repository, ref, imagePath)
					}
				: undefined,
			screenshots: []
		}
	};
}

function parseManifestJson(text: string): MaoloaderManifest {
	try {
		const parsed = JSON.parse(text) as unknown;
		if (!isObject(parsed)) {
			throw new Error("root must be an object");
		}
		return parsed as MaoloaderManifest;
	} catch (error) {
		throw new Error(
			`maoloader.json is invalid JSON: ${error instanceof Error ? error.message : String(error)}`
		);
	}
}

function validateRootKeys(manifest: MaoloaderManifest) {
	const allowed = new Set(["repository", "author", "plugins"]);
	const extraKeys = Object.keys(manifest).filter((key) => !allowed.has(key));
	if (extraKeys.length) {
		throw new Error(
			`maoloader.json root only supports repository, author, and plugins. Move ${extraKeys.join(", ")} into plugin entries.`
		);
	}
}

function listingKind(value: unknown): ListingKind {
	const kind = stringValue(value);
	if (kind === "theme") {
		return "theme";
	}
	return "plugin";
}

function authorFromManifest(value: ManifestAuthor | undefined) {
	if (typeof value === "string") {
		return {
			name: value,
			url: undefined
		};
	}
	if (isObject(value)) {
		return {
			name: stringValue(value.name),
			url: stringValue(value.url) || undefined
		};
	}
	return {
		name: "",
		url: undefined
	};
}

function hasAuthor(value: ManifestAuthor | undefined) {
	if (typeof value === "string") {
		return Boolean(value.trim());
	}
	if (isObject(value)) {
		return Boolean(stringValue(value.name));
	}
	return false;
}

function listValue(value: unknown) {
	if (Array.isArray(value)) {
		return value.map(stringValue).filter(Boolean);
	}
	if (typeof value === "string") {
		return value
			.split(",")
			.map((part) => part.trim())
			.filter(Boolean);
	}
	return [];
}

function stringValue(value: unknown) {
	return typeof value === "string" ? value.trim() : "";
}

function slugify(value: string) {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function normalizeManifestPath(value: string) {
	const path = value.trim() || "maoloader.json";
	if (path.startsWith("/") || /^[a-z]:/i.test(path) || path.includes("\\") || path.includes("..")) {
		throw new Error("Manifest path must be a relative path inside the GitHub repository.");
	}
	if (!path.toLowerCase().endsWith(".json")) {
		throw new Error("Manifest path must point to a JSON file.");
	}
	return path;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
