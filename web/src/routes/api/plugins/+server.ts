import { json } from "@sveltejs/kit";
import { getRegistryIndex, searchListings } from "$lib/registry/store";
import type { ListingKind } from "$lib/registry/types";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ platform, url }) => {
	const kind = (url.searchParams.get("kind") || "all") as ListingKind | "all";
	const query = url.searchParams.get("q") || "";
	const tag = url.searchParams.get("tag") || "";
	const index = await getRegistryIndex(platform);
	const items = await searchListings({ kind, query, tag }, platform);

	return json({
		generated_at: index.generated_at,
		count: items.length,
		items
	});
};
