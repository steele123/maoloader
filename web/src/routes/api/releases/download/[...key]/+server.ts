import { error } from "@sveltejs/kit";
import { releaseBucket } from "$lib/releases";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, platform }) => {
	const bucket = releaseBucket(platform);
	if (!bucket) {
		error(404, "Release storage is not configured.");
	}

	const key = params.key;
	if (!key.startsWith("releases/maoloader/") || key.includes("..")) {
		error(400, "Invalid release artifact path.");
	}

	const object = await bucket.get(key);
	if (!object) {
		error(404, "Release artifact was not found.");
	}

	return new Response(object.body, {
		headers: {
			"cache-control": "public, max-age=31536000, immutable",
			"content-disposition": `attachment; filename="${key.split("/").at(-1)}"`,
			"content-length": String(object.size),
			"content-type": contentTypeForKey(key)
		}
	});
};

function contentTypeForKey(key: string) {
	if (key.endsWith(".exe")) return "application/vnd.microsoft.portable-executable";
	if (key.endsWith(".msi")) return "application/x-msi";
	if (key.endsWith(".zip")) return "application/zip";
	if (key.endsWith(".json")) return "application/json";
	if (key.endsWith(".sig")) return "text/plain";
	return "application/octet-stream";
}
