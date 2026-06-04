import { error, json } from "@sveltejs/kit";
import { getListing, publicDownloadUrl } from "$lib/registry/store";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, platform }) => {
	const listing = await getListing(params.slug, platform);
	if (!listing) {
		error(404, "Plugin not found");
	}

	return json({
		...listing,
		download_url: publicDownloadUrl(listing.slug)
	});
};
