import { error } from "@sveltejs/kit";
import { getListing, publicDownloadUrl } from "$lib/registry/store";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, platform }) => {
	const listing = await getListing(params.slug, platform);
	if (!listing) {
		error(404, "Plugin not found");
	}

	return {
		listing,
		download_url: publicDownloadUrl(listing.slug)
	};
};
