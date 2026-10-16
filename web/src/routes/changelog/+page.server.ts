import changelogSource from "../../../../CHANGELOG.md?raw";
import { parseChangelog } from "$lib/changelog";
import { renderReadme } from "$lib/server/readme";
import { searchListings, getListing } from "$lib/registry/store";
import type { PageServerLoad } from "./$types";

const render = (markdown: string) => renderReadme(markdown) ?? "";

export const load: PageServerLoad = async ({ platform }) => {
	// The latest release of each plugin that keeps a changelog, most recently updated first.
	const summaries = (await searchListings({}, platform)).sort((left, right) => right.updated_at.localeCompare(left.updated_at));
	const pluginUpdates = [];
	for (const summary of summaries.slice(0, 30)) {
		const listing = await getListing(summary.slug, platform);
		const latest = parseChangelog(listing?.changelog)[0];
		if (!listing || !latest) continue;
		pluginUpdates.push({
			slug: listing.slug,
			name: listing.name,
			icon: listing.assets.icon?.url,
			version: latest.version,
			date: latest.date,
			html: render(latest.body)
		});
		if (pluginUpdates.length >= 12) break;
	}

	return {
		releases: parseChangelog(changelogSource)
			.slice(0, 12)
			.map((release) => ({ version: release.version, date: release.date, html: render(release.body) })),
		pluginUpdates
	};
};
