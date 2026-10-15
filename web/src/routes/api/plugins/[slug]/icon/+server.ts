import { error, redirect } from "@sveltejs/kit";
import { getListing } from "$lib/registry/store";
import type { RequestHandler } from "./$types";

// Icons that came inside an uploaded zip live in R2; GitHub listings link theirs directly.
export const GET: RequestHandler = async ({ params, platform }) => {
	const icon = (await getListing(params.slug, platform))?.assets.icon;
	if (!icon) error(404, "Icon not found");
	if (icon.url && !icon.url.startsWith("/api/")) redirect(302, icon.url);

	const object = await platform?.env?.PLUGIN_BUCKET?.get(icon.key);
	if (!object) error(404, "Icon not found");

	return new Response(object.body, {
		headers: {
			"Content-Type": object.httpMetadata?.contentType ?? "image/png",
			"Cache-Control": "public, max-age=3600",
			ETag: object.etag
		}
	});
};
