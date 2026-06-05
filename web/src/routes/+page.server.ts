import { getDownloadRelease } from "$lib/releases";
import { allTags, searchListings } from "$lib/registry/store";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ platform }) => {
	const [items, tags, release] = await Promise.all([
		searchListings({}, platform),
		allTags(platform),
		getDownloadRelease(platform)
	]);

	return {
		featured: items.filter((item) => item.featured).slice(0, 3),
		pluginCount: items.filter((item) => item.kind === "plugin").length,
		themeCount: items.filter((item) => item.kind === "theme").length,
		listingCount: items.length,
		tagCount: tags.length,
		totalDownloads: items.reduce((total, item) => total + (item.downloads ?? 0), 0),
		release
	};
};
