import { error, json } from "@sveltejs/kit";
import { rateListing, ratingFor, validStars, voterKey, voterStars } from "$lib/registry/ratings";
import { getListing } from "$lib/registry/store";
import type { RequestHandler } from "./$types";

// The rating so far, and the stars this visitor gave (if any).
export const GET: RequestHandler = async ({ params, platform, request }) => {
	const voter = await voterKey(request, platform?.env);
	const [rating, mine] = await Promise.all([ratingFor(params.slug, platform), voterStars(params.slug, voter, platform)]);
	return json({ rating: rating ?? { average: 0, count: 0 }, mine: mine ?? null }, { headers: { "Cache-Control": "no-store" } });
};

// One rating per visitor per listing; rating again replaces it.
export const POST: RequestHandler = async ({ params, platform, request }) => {
	const env = platform?.env;
	if (!env?.PLUGIN_DB) error(501, "Ratings aren't available here.");
	if (!(await getListing(params.slug, platform))) error(404, "Plugin not found");

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, "Send JSON like { \"stars\": 5 }.");
	}
	const stars = validStars((body as { stars?: unknown })?.stars);
	if (!stars) error(400, "Stars must be a whole number from 1 to 5.");

	const voter = await voterKey(request, env);
	await rateListing(env, params.slug, voter, stars);
	return json({ rating: (await ratingFor(params.slug, platform)) ?? { average: stars, count: 1 }, mine: stars });
};
