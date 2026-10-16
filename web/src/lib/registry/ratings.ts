import { and, avg, count, eq } from "drizzle-orm";
import { getDb } from "$lib/db/client";
import { listingRatings } from "$lib/db/schema";
import type { RegistryRating } from "./types";

/** Average and count per listing, for the store's cards and plugin pages. */
export async function ratingSummaries(platform?: App.Platform): Promise<Map<string, RegistryRating>> {
	const db = getDb(platform?.env);
	if (!db) return new Map();
	try {
		const rows = await db
			.select({ slug: listingRatings.slug, average: avg(listingRatings.stars), count: count() })
			.from(listingRatings)
			.groupBy(listingRatings.slug)
			.all();
		return new Map(rows.map((row) => [row.slug, toRating(row.average, row.count)]));
	} catch (error) {
		// Before the ratings migration runs, the store still works, just without ratings.
		console.warn("Ratings unavailable", error);
		return new Map();
	}
}

export async function ratingFor(slug: string, platform?: App.Platform): Promise<RegistryRating | undefined> {
	return (await ratingSummaries(platform)).get(slug);
}

export async function voterStars(slug: string, voter: string, platform?: App.Platform) {
	const db = getDb(platform?.env);
	if (!db) return undefined;
	const row = await db
		.select({ stars: listingRatings.stars })
		.from(listingRatings)
		.where(and(eq(listingRatings.slug, slug), eq(listingRatings.voter, voter)))
		.get();
	return row?.stars;
}

/** Saves a visitor's rating, replacing their earlier one for that listing. */
export async function rateListing(env: Env, slug: string, voter: string, stars: number) {
	const db = getDb(env);
	if (!db) throw new Error("PLUGIN_DB D1 binding is not configured");
	const now = new Date().toISOString();
	await db
		.insert(listingRatings)
		.values({ slug, voter, stars, createdAt: now, updatedAt: now })
		.onConflictDoUpdate({ target: [listingRatings.slug, listingRatings.voter], set: { stars, updatedAt: now } })
		.run();
}

export function validStars(value: unknown) {
	const stars = Number(value);
	return Number.isInteger(stars) && stars >= 1 && stars <= 5 ? stars : undefined;
}

/**
 * Who's rating, as a salted SHA-256 of their address and browser. One visitor gets one rating per
 * listing; the address itself is never stored, and the salt keeps the hash from being reversed.
 */
export async function voterKey(request: Request, env?: Env) {
	const salt = env?.RATING_SALT || env?.ADMIN_TOKEN || "maoloader-ratings";
	const address = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "local";
	const agent = request.headers.get("user-agent") || "";
	const bytes = new TextEncoder().encode(`${salt}|${address}|${agent}`);
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toRating(average: string | number | null, total: number): RegistryRating {
	return { average: Math.round(Number(average ?? 0) * 10) / 10, count: Number(total) || 0 };
}
