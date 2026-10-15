import { getDownloadRelease } from "$lib/releases";
import { searchListings } from "$lib/registry/store";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ platform }) => {
	const [items, release] = await Promise.all([searchListings({}, platform), getDownloadRelease(platform)]);
	const featured = items.filter((item) => item.featured);

	return {
		// Featured listings first; until some are featured, the newest ones fill in.
		highlights: (featured.length ? featured : items).slice(0, 6),
		listingCount: items.length,
		totalDownloads: items.reduce((total, item) => total + (item.downloads ?? 0), 0),
		release
	};
};
