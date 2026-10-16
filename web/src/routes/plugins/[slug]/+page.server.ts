import { error } from "@sveltejs/kit";
import { parseChangelog } from "$lib/changelog";
import { renderReadme } from "$lib/server/readme";
import { getListing, publicDownloadUrl } from "$lib/registry/store";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, platform }) => {
	const listing = await getListing(params.slug, platform);
	if (!listing) {
		error(404, "Plugin not found");
	}

	return {
		listing,
		readme_html: renderReadme(listing.readme),
		// Newest first, as the changelog lists them; rendered like the README (no raw HTML).
		releases: parseChangelog(listing.changelog)
			.slice(0, 8)
			.map((release) => ({ version: release.version, date: release.date, html: renderReadme(release.body) ?? "" })),
		download_url: publicDownloadUrl(listing.slug)
	};
};
