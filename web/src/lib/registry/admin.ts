import { getDb } from "$lib/db/client";
import { registryListings, registrySubmissions } from "$lib/db/schema";
import { fetchGitHubArchive } from "./github";
import { seedListings } from "./seed";
import type { RegistryListing, RegistrySubmission } from "./types";

export async function seedRegistry(env: Env) {
	const db = requireDb(env);
	for (const listing of seedListings) {
		await publishListing(env, listing);
	}
	return db;
}

export async function publishListing(env: Env, listing: RegistryListing) {
	const db = requireDb(env);
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
		repository,
		github_ref: archive.ref,
		listing: published[0],
		listings: published
	});

	return published;
}

export function submissionListings(submission: RegistrySubmission) {
	return submission.listings?.length ? submission.listings : submission.listing ? [submission.listing] : [];
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
