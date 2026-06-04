import { desc, eq } from "drizzle-orm";
import { getDb } from "$lib/db/client";
import { registryListings, registrySubmissions } from "$lib/db/schema";
import type {
	RegistryFilters,
	RegistryIndex,
	RegistryListing,
	RegistrySubmission,
	RegistrySummary
} from "./types";

export function summarizeListing(listing: RegistryListing): RegistrySummary {
	return {
		kind: listing.kind,
		slug: listing.slug,
		name: listing.name,
		version: listing.version,
		description: listing.description,
		author: listing.author,
		tags: listing.tags,
		compatibility: listing.compatibility,
		featured: listing.featured,
		downloads: listing.downloads,
		updated_at: listing.updated_at,
		assets: listing.assets
	};
}

export async function getRegistryIndex(platform?: App.Platform): Promise<RegistryIndex> {
	const listings = await allListings(platform);
	return {
		generated_at: listings[0]?.updated_at ?? new Date(0).toISOString(),
		items: listings.map(summarizeListing)
	};
}

export async function getListing(
	slug: string,
	platform?: App.Platform
): Promise<RegistryListing | undefined> {
	const db = getDb(platform?.env);
	if (!db) {
		return undefined;
	}

	const row = await db
		.select({ listingJson: registryListings.listingJson })
		.from(registryListings)
		.where(eq(registryListings.slug, slug))
		.get();

	return row ? parseListing(row.listingJson) : undefined;
}

export async function searchListings(
	filters: RegistryFilters = {},
	platform?: App.Platform
): Promise<RegistrySummary[]> {
	const query = filters.query?.trim().toLowerCase();
	const tag = filters.tag?.trim().toLowerCase();
	const kind = filters.kind && filters.kind !== "all" ? filters.kind : undefined;

	return (await getRegistryIndex(platform)).items
		.filter((item) => !kind || item.kind === kind)
		.filter((item) => !tag || item.tags.some((entry) => entry.toLowerCase() === tag))
		.filter((item) => {
			if (!query) {
				return true;
			}

			const searchable = [
				item.name,
				item.slug,
				item.description,
				item.author.name,
				item.kind,
				...item.tags
			]
				.join(" ")
				.toLowerCase();
			return searchable.includes(query);
		})
		.sort((left, right) => {
			if (left.featured !== right.featured) {
				return left.featured ? -1 : 1;
			}
			return right.updated_at.localeCompare(left.updated_at);
		});
}

export async function allTags(platform?: App.Platform): Promise<string[]> {
	const index = await getRegistryIndex(platform);
	return Array.from(new Set(index.items.flatMap((item) => item.tags))).sort((left, right) =>
		left.localeCompare(right)
	);
}

export function publicDownloadUrl(slug: string) {
	return `/api/plugins/${slug}/download`;
}

export async function listSubmissions(platform?: App.Platform): Promise<RegistrySubmission[]> {
	const db = getDb(platform?.env);
	if (!db) {
		return [];
	}

	const rows = await db
		.select({ submissionJson: registrySubmissions.submissionJson })
		.from(registrySubmissions)
		.orderBy(desc(registrySubmissions.createdAt))
		.all();

	return rows.map((row) => parseSubmission(row.submissionJson));
}

export async function getSubmission(
	id: string,
	platform?: App.Platform
): Promise<RegistrySubmission | undefined> {
	const db = getDb(platform?.env);
	if (!db) {
		return undefined;
	}

	const row = await db
		.select({ submissionJson: registrySubmissions.submissionJson })
		.from(registrySubmissions)
		.where(eq(registrySubmissions.id, id))
		.get();

	return row ? parseSubmission(row.submissionJson) : undefined;
}

async function allListings(platform?: App.Platform) {
	const db = getDb(platform?.env);
	if (!db) {
		return [];
	}

	const rows = await db
		.select({ listingJson: registryListings.listingJson })
		.from(registryListings)
		.orderBy(desc(registryListings.updatedAt))
		.all();

	return rows.map((row) => parseListing(row.listingJson));
}

function parseListing(value: string): RegistryListing {
	return JSON.parse(value) as RegistryListing;
}

function parseSubmission(value: string): RegistrySubmission {
	return JSON.parse(value) as RegistrySubmission;
}
