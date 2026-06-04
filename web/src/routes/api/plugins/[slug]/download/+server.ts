import { error, redirect } from "@sveltejs/kit";
import { getListing } from "$lib/registry/store";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, platform }) => {
	const listing = await getListing(params.slug, platform);
	if (!listing?.assets.package) {
		error(404, "Package not found");
	}

	if (listing.assets.package.url && !listing.assets.package.url.startsWith("/api/")) {
		redirect(302, listing.assets.package.url);
	}

	const bucket = platform?.env?.PLUGIN_BUCKET;
	if (!bucket) {
		return new Response(
			JSON.stringify({
				error: "PLUGIN_BUCKET R2 binding is not configured",
				key: listing.assets.package.key
			}),
			{
				status: 501,
				headers: {
					"Content-Type": "application/json"
				}
			}
		);
	}

	const object = await bucket.get(listing.assets.package.key);
	if (!object) {
		error(404, "Package object not found");
	}

	return new Response(object.body, {
		headers: {
			"Content-Type": "application/zip",
			"Content-Length": String(object.size),
			"ETag": object.etag,
			"Content-Disposition": `attachment; filename="${listing.slug}-${listing.version}.zip"`
		}
	});
};
