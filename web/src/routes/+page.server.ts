import { allTags, searchListings } from "$lib/registry/store";
import type { ListingKind } from "$lib/registry/types";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ platform, url }) => {
	const kind = (url.searchParams.get("kind") || "all") as ListingKind | "all";
	const query = url.searchParams.get("q") || "";
	const tag = url.searchParams.get("tag") || "";
	const [items, tags] = await Promise.all([
		searchListings({ kind, query, tag }, platform),
		allTags(platform)
	]);

	return {
		items,
		tags,
		filters: {
			kind,
			query,
			tag
		}
	};
};
