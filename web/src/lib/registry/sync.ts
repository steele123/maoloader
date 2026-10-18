import { approveAndMirrorSubmission, createSubmission } from "./admin";
import { parseGitHubRepository } from "./github";
import { loadListingsFromManifest } from "./manifest";
import { listSubmissions, searchListings } from "./store";
import type { RegistryListing, RegistrySubmission, RegistrySummary } from "./types";

export type SyncResult = {
	repository: string;
	ref: string;
	/** What changed: new plugins, or a version other than the one in the store. */
	changed: RegistryListing[];
	outcome: "unchanged" | "published" | "queued";
};

/** Repos whose pushes publish straight away; every other repo's changes wait for review. */
export function autoPublishes(env: Env | undefined, repository: string) {
	const url = parseGitHubRepository(repository)?.url;
	if (!url) return false;
	return String(env?.AUTO_PUBLISH_REPOSITORIES || "")
		.split(",")
		.map((entry) => parseGitHubRepository(entry.trim())?.url)
		.some((entry) => entry === url);
}

/**
 * Brings the store up to date with a repo's maoloader.json. Only plugins whose version changed (or
 * that are new) are touched. With `publish`, they go live at once, recorded as an approved
 * submission; otherwise they wait as one pending submission per repo, replacing an older pending one.
 */
export async function syncRepository(
	env: Env,
	repository: string,
	{ ref, publish, notes }: { ref?: string; publish: boolean; notes?: string }
): Promise<SyncResult> {
	const now = new Date().toISOString();
	const manifest = await loadListingsFromManifest(repository, ref, now);
	const platform = { env } as App.Platform;
	// A new version, or new screenshots on the same version, counts as a change.
	const look = (listing: RegistrySummary | RegistryListing) =>
		`${listing.version}|${JSON.stringify((listing.assets.screenshots ?? []).map((shot) => [shot.key, shot.caption ?? ""]))}`;
	const live = new Map((await searchListings({}, platform)).map((listing) => [listing.slug, look(listing)]));
	const changed = manifest.listings.filter((listing) => live.get(listing.slug) !== look(listing));
	const base = { repository: manifest.repository, ref: manifest.ref, changed };
	if (!changed.length) return { ...base, outcome: "unchanged" };

	const pending = (await listSubmissions(platform)).find(
		(submission) => submission.status === "pending" && submission.repository === manifest.repository
	);
	const submission: RegistrySubmission = {
		id: pending?.id ?? crypto.randomUUID(),
		status: "pending",
		created_at: pending?.created_at ?? now,
		updated_at: now,
		repository: manifest.repository,
		listing: changed[0],
		listings: changed,
		github_ref: manifest.ref,
		notes
	};

	if (publish) {
		await approveAndMirrorSubmission(env, submission);
		return { ...base, outcome: "published" };
	}
	await createSubmission(env, submission);
	return { ...base, outcome: "queued" };
}

/** Checks GitHub's X-Hub-Signature-256 header: HMAC-SHA256 of the raw body with the shared secret. */
export async function validGitHubSignature(secret: string, body: string, header: string | null) {
	if (!secret || !header?.startsWith("sha256=")) return false;
	const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
	const expected = [...signature].map((byte) => byte.toString(16).padStart(2, "0")).join("");
	const given = header.slice("sha256=".length);
	// Compare every character, so how long the check takes says nothing about the secret.
	if (given.length !== expected.length) return false;
	let difference = 0;
	for (let index = 0; index < expected.length; index += 1) difference |= expected.charCodeAt(index) ^ given.charCodeAt(index);
	return difference === 0;
}
