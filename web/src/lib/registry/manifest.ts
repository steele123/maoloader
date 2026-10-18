import { fetchGitHubFile, parseGitHubRepository, rawGitHubUrl } from "./github";
import type { PackageZip } from "./package-zip";
import type { ListingKind, RegistryAsset, RegistryListing } from "./types";

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
	screenshots?: unknown;
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
		listingFromManifestPlugin(manifest, entry, { repository: parsedRepo.url, ref: manifestFile.ref }, now, index)
	);
	assertUniqueSlugs(listings);

	// Each plugin's page shows the README and CHANGELOG in its own folder. The ones next to the
	// manifest only stand in for a single-plugin repo, where they describe that one plugin.
	const readText = (path: string) =>
		fetchGitHubFile(parsedRepo.url, path, manifestFile.ref)
			.then((file) => file.text.slice(0, 64 * 1024))
			.catch(() => undefined);
	const manifestDir = normalizedManifestPath.replace(/[^/]*$/, "");
	const pluginDoc = async (listing: RegistryListing, name: string) => {
		const entryDir = listing.entry.replace(/[^/]*$/, "");
		const own = entryDir !== manifestDir ? await readText(`${entryDir}${name}`) : undefined;
		return own ?? (listings.length === 1 ? await readText(`${manifestDir}${name}`) : undefined);
	};
	await Promise.all(
		listings.map(async (listing) => {
			[listing.readme, listing.changelog] = await Promise.all([
				pluginDoc(listing, "README.md"),
				pluginDoc(listing, "CHANGELOG.md")
			]);
		})
	);

	return {
		ref: manifestFile.ref,
		repository: parsedRepo.url,
		listings
	};
}

export type PackageFields = {
	name?: string;
	version?: string;
	description?: string;
	author?: string;
	kind?: string;
	tags?: string;
};

/**
 * Listings for an uploaded .zip. Uses its maoloader.json when it has one, otherwise the form
 * fields plus the entry file found in the zip. Icons are left for the caller to store.
 */
export function listingsFromPackage(zip: PackageZip, fields: PackageFields, now: string): RegistryListing[] {
	let manifest: MaoloaderManifest;
	if (zip.manifestText) {
		manifest = parseManifestJson(zip.manifestText);
		validateRootKeys(manifest);
		if (!hasAuthor(manifest.author) && fields.author?.trim()) manifest.author = fields.author.trim();
	} else {
		if (!zip.defaultEntry) {
			throw new Error(
				"Couldn't find the plugin's entry file. Put index.js at the top of the zip, or add a maoloader.json that names it."
			);
		}
		manifest = {
			author: fields.author?.trim() || undefined,
			plugins: [
				{
					kind: fields.kind,
					title: fields.name,
					version: fields.version,
					description: fields.description,
					entry: zip.defaultEntry,
					tags: fields.tags
				}
			]
		};
	}
	if (!Array.isArray(manifest.plugins) || manifest.plugins.length === 0) {
		throw new Error("maoloader.json must include a non-empty plugins array.");
	}

	const declared = stringValue(manifest.repository);
	const repository = declared ? parseGitHubRepository(declared)?.url : undefined;
	const single = manifest.plugins.length === 1;
	const listings = manifest.plugins.map((entry, index) => {
		const listing = listingFromManifestPlugin(manifest, entry, { repository }, now, index);
		if (!zip.files.includes(listing.entry)) {
			throw new Error(`"${listing.name}" loads ${listing.entry}, but the zip doesn't contain it.`);
		}
		if (!listValue((entry as ManifestPlugin).files).length) listing.files = zip.files;
		// A plugin's own folder wins; files at the zip's top level describe a single-plugin zip.
		const entryDir = listing.entry.replace(/[^/]*$/, "");
		const zipDoc = (name: string) => {
			const own = entryDir ? zip.readFile(`${entryDir}${name}`, 64 * 1024) : undefined;
			const data = own ?? (single || !entryDir ? zip.readFile(name, 64 * 1024) : undefined);
			return data ? new TextDecoder().decode(data) : undefined;
		};
		listing.readme = zipDoc("README.md") ?? (single ? zip.readme : undefined);
		listing.changelog = zipDoc("CHANGELOG.md");
		// Paths inside the zip for now; the upload stores each image and swaps in its own address.
		listing.assets.screenshots = screenshotEntries((entry as ManifestPlugin).screenshots, listing.slug);
		for (const shot of listing.assets.screenshots) {
			if (!zip.files.includes(shot.key)) {
				throw new Error(`"${listing.name}" lists the screenshot ${shot.key}, but the zip doesn't contain it.`);
			}
		}
		return listing;
	});
	assertUniqueSlugs(listings);
	return listings;
}

function assertUniqueSlugs(listings: RegistryListing[]) {
	const slugs = new Set<string>();
	for (const listing of listings) {
		if (slugs.has(listing.slug)) {
			throw new Error(`maoloader.json includes duplicate slug "${listing.slug}".`);
		}
		slugs.add(listing.slug);
	}
}

function listingFromManifestPlugin(
	manifest: MaoloaderManifest,
	entry: unknown,
	source: { repository?: string; ref?: string },
	now: string,
	index: number
): RegistryListing {
	const { repository, ref } = source;
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
	if (slug.length > 64) {
		throw new Error(`Slug "${slug}" is too long. Keep it under 64 characters.`);
	}
	// GitHub listings link their icon from the repo, so it is required there. Uploads may skip it.
	const needsImage = Boolean(ref);
	if (!title || !version || !description || (needsImage && !imagePath)) {
		throw new Error(
			`Plugin "${slug}" must include title, version, description${needsImage ? ", and image" : ""}.`
		);
	}

	const authorName = author.name || "Unknown";
	return {
		schema: "https://maoloader.com/schemas/plugin.v1.json",
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
			icon:
				imagePath && repository && ref
				? {
						key: imagePath,
						url: rawGitHubUrl(repository, ref, imagePath)
					}
				: undefined,
			screenshots: repository && ref ? manifestScreenshots(plugin.screenshots, repository, ref, slug) : []
		}
	};
}

export const SCREENSHOT_LIMIT = 8;
const SCREENSHOT_TYPES = /\.(png|jpe?g|webp|gif)$/i;

/**
 * "screenshots": a list of image paths in the repo, or { "path", "caption" } objects. They show as a
 * gallery on the plugin page, linked from GitHub like the icon, so they don't need to be in "files"
 * (and are better left out, so installs stay small).
 */
export function manifestScreenshots(value: unknown, repository: string, ref: string, slug: string): RegistryAsset[] {
	return screenshotEntries(value, slug).map((shot) => ({ ...shot, url: rawGitHubUrl(repository, ref, shot.key) }));
}

/** Checks a "screenshots" list and returns each image's path (as `key`) and caption. */
export function screenshotEntries(value: unknown, slug: string): RegistryAsset[] {
	if (value === undefined) return [];
	if (!Array.isArray(value)) throw new Error(`Plugin "${slug}": screenshots must be a list.`);
	if (value.length > SCREENSHOT_LIMIT) throw new Error(`Plugin "${slug}": up to ${SCREENSHOT_LIMIT} screenshots.`);
	return value.map((item) => {
		const path = stringValue(isObject(item) ? item.path : item).replace(/^\.?\//, "");
		const caption = isObject(item) ? stringValue(item.caption).slice(0, 140) : "";
		if (!path || path.includes("..") || path.startsWith("/") || path.includes("\\") || !SCREENSHOT_TYPES.test(path)) {
			throw new Error(`Plugin "${slug}": screenshot "${path}" must be a .png, .jpg, .webp or .gif path inside the repo.`);
		}
		return { key: path, caption: caption || undefined };
	});
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
