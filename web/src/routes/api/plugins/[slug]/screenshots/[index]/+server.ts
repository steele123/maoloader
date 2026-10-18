import { error, redirect } from "@sveltejs/kit";
import { getListing } from "$lib/registry/store";
import type { RequestHandler } from "./$types";

// Screenshots that came with an uploaded zip live in R2; GitHub listings link theirs directly.
export const GET: RequestHandler = async ({ params, platform }) => {
	const shot = (await getListing(params.slug, platform))?.assets.screenshots?.[Number(params.index) - 1];
	if (!shot) error(404, "Screenshot not found");
	if (shot.url && !shot.url.startsWith("/api/")) redirect(302, shot.url);

	const object = await platform?.env?.PLUGIN_BUCKET?.get(shot.key);
	if (!object) error(404, "Screenshot not found");

	return new Response(object.body, {
		headers: {
			"Content-Type": object.httpMetadata?.contentType ?? "image/png",
			"Cache-Control": "public, max-age=3600",
			"X-Content-Type-Options": "nosniff",
			ETag: object.etag
		}
	});
};
