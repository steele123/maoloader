import { eq } from "drizzle-orm";
import { getDb } from "$lib/db/client";
import { registryListings, registrySubmissions } from "$lib/db/schema";
import { fetchGitHubArchive } from "./github";
import type { RegistryListing, RegistrySubmission } from "./types";

export async function publishListing(env: Env, incoming: RegistryListing) {
	const db = requireDb(env);
	const previous = await db
		.select({ listingJson: registryListings.listingJson, downloads: registryListings.downloads })
		.from(registryListings)
		.where(eq(registryListings.slug, incoming.slug))
		.get();
	const listing = previous
		? withHistory(incoming, JSON.parse(previous.listingJson), previous.downloads)
		: incoming;
	await db
		.insert(registryListings)
		.values(listingRow(listing))
		.onConflictDoUpdate({
			target: registryListings.slug,
			set: listingRow(listing)
		})
		.run();
}

export async function createSubmission(env: Env, submission: RegistrySubmission) {
	const db = requireDb(env);
	await db
		.insert(registrySubmissions)
		.values(submissionRow(submission))
		.onConflictDoUpdate({
			target: registrySubmissions.id,
			set: submissionRow(submission)
		})
		.run();
}

export async function updateSubmission(env: Env, submission: RegistrySubmission) {
	await createSubmission(env, submission);
}

export async function approveAndMirrorSubmission(env: Env, submission: RegistrySubmission) {
	if (!env.PLUGIN_BUCKET) {
		throw new Error("PLUGIN_BUCKET R2 binding is not configured");
	}
	const listings = submissionListings(submission);

	// Uploaded zips are already stored; publish them without fetching anything.
	if (
		!submission.repository &&
		listings.length &&
		listings.every((listing) => listing.assets.package?.key)
	) {
		const now = new Date().toISOString();
		const published = listings.map((listing) => ({ ...listing, updated_at: now }));
		for (const listing of published) await publishListing(env, listing);
		await updateSubmission(env, {
			...submission,
			status: "approved",
			updated_at: now,
			reviewed_at: now,
			listing: published[0],
			listings: published
		});
		return published;
	}

	const repository = submission.repository || listings[0]?.repository;
	if (!repository) {
		throw new Error("Submission does not have a GitHub repository URL");
	}

	const archive = await fetchGitHubArchive(repository, submission.github_ref);
	const now = new Date().toISOString();
	const published: RegistryListing[] = [];
	for (const pendingListing of listings) {
		const key = `${pendingListing.kind}s/${pendingListing.slug}/${pendingListing.version}/${pendingListing.slug}-${pendingListing.version}.zip`;
		await env.PLUGIN_BUCKET.put(key, archive.body, {
			httpMetadata: {
				contentType: "application/zip"
			}
		});

		const listing: RegistryListing = {
			...pendingListing,
			updated_at: now,
			assets: {
				...pendingListing.assets,
				package: {
					key,
					url: `/api/plugins/${pendingListing.slug}/download`,
					size: archive.size
				}
			}
		};

		await publishListing(env, listing);
		published.push(listing);
	}
	await updateSubmission(env, {
		...submission,
		status: "approved",
		updated_at: now,
		reviewed_at: now,
		repository,
		github_ref: archive.ref,
		listing: published[0],
		listings: published
	});

	return published;
}

export async function rejectSubmission(env: Env, submission: RegistrySubmission, reason?: string) {
	const now = new Date().toISOString();
	await updateSubmission(env, {
		...submission,
		status: "rejected",
		updated_at: now,
		reviewed_at: now,
		review_note: reason?.trim() || undefined
	});
}

/** Featured listings lead the store and the home page. */
export async function setListingFeatured(env: Env, slug: string, featured: boolean) {
	const db = requireDb(env);
	const row = await db
		.select({ listingJson: registryListings.listingJson })
		.from(registryListings)
		.where(eq(registryListings.slug, slug))
		.get();
	if (!row) throw new Error(`No listing named "${slug}".`);
	const listing = { ...(JSON.parse(row.listingJson) as RegistryListing), featured };
	await db
		.update(registryListings)
		.set({ featured, listingJson: JSON.stringify(listing) })
		.where(eq(registryListings.slug, slug))
		.run();
}

/** Takes a listing out of the store. Its files stay in R2, so approving it again restores it. */
export async function removeListing(env: Env, slug: string) {
	const db = requireDb(env);
	await db.delete(registryListings).where(eq(registryListings.slug, slug)).run();
}

export function submissionListings(submission: RegistrySubmission) {
	return submission.listings?.length ? submission.listings : submission.listing ? [submission.listing] : [];
}

const HISTORY_LIMIT = 20;

function withHistory(
	listing: RegistryListing,
	previous: RegistryListing,
	downloads: number
): RegistryListing {
	const history = previous.history ?? [];
	return {
		...listing,
		downloads,
		history:
			previous.version === listing.version
				? history
				: [{ version: previous.version, published_at: previous.updated_at }, ...history].slice(
						0,
						HISTORY_LIMIT
					)
	};
}

function requireDb(env: Env) {
	const db = getDb(env);
	if (!db) {
		throw new Error("PLUGIN_DB D1 binding is not configured");
	}
	return db;
}

function listingRow(listing: RegistryListing) {
	return {
		slug: listing.slug,
		kind: listing.kind,
		name: listing.name,
		version: listing.version,
		description: listing.description,
		repository: listing.repository ?? null,
		featured: Boolean(listing.featured),
		downloads: listing.downloads ?? 0,
		updatedAt: listing.updated_at,
		listingJson: JSON.stringify(listing)
	};
}

function submissionRow(submission: RegistrySubmission) {
	const listings = submissionListings(submission);
	return {
		id: submission.id,
		status: submission.status,
		createdAt: submission.created_at,
		updatedAt: submission.updated_at,
		repository: submission.repository ?? submission.listing?.repository ?? null,
		githubRef: submission.github_ref ?? null,
		notes: submission.notes ?? null,
		listingJson: submission.listing ? JSON.stringify(submission.listing) : null,
		listingsJson: JSON.stringify(listings),
		submissionJson: JSON.stringify({
			...submission,
			listings
		})
	};
}
