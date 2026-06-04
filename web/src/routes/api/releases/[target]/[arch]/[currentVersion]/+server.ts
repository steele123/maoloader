import { json } from "@sveltejs/kit";
import { absoluteUrl, getLatestRelease, isNewerVersion, platformKey } from "$lib/releases";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, platform, url }) => {
	const manifest = await getLatestRelease(platform);
	const releasePlatform = manifest?.platforms?.[platformKey(params.target, params.arch)];

	if (
		!manifest ||
		!releasePlatform ||
		!releasePlatform.signature ||
		!isNewerVersion(manifest.version, params.currentVersion)
	) {
		return new Response(null, { status: 204 });
	}

	return json({
		version: manifest.version,
		notes: manifest.notes || "",
		pub_date: manifest.pub_date,
		url: absoluteUrl(url.origin, releasePlatform.url),
		signature: releasePlatform.signature
	});
};
