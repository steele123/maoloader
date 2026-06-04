import { json } from "@sveltejs/kit";
import { getLatestRelease } from "$lib/releases";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ platform, url }) => {
	const manifest = await getLatestRelease(platform);
	if (!manifest) {
		return json({ error: "No release has been published yet." }, { status: 404 });
	}

	const origin = url.origin;
	return json({
		...manifest,
		platforms: Object.fromEntries(
			Object.entries(manifest.platforms).map(([key, value]) => [
				key,
				{
					...value,
					url: new URL(value.url, origin).toString(),
					installer_url: value.installer_url
						? new URL(value.installer_url, origin).toString()
						: undefined
				}
			])
		)
	});
};
