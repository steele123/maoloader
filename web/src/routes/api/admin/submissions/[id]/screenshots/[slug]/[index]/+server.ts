import { error } from "@sveltejs/kit";
import { submissionListings } from "$lib/registry/admin";
import { getSubmission } from "$lib/registry/store";
import type { RequestHandler } from "./$types";

// Lets a signed-in reviewer see an upload's screenshots before approving it.
// hooks.server.ts turns away anyone who isn't signed in; this checks again.
export const GET: RequestHandler = async ({ params, platform, locals }) => {
	if (!locals.admin) error(401, "Sign in first.");
	const submission = await getSubmission(params.id, platform);
	const listing = submission && submissionListings(submission).find((entry) => entry.slug === params.slug);
	const shot = listing?.assets.screenshots?.[Number(params.index) - 1];
	if (!shot) error(404, "Screenshot not found");

	const object = await platform?.env?.PLUGIN_BUCKET?.get(shot.key);
	if (!object) error(404, "Screenshot not found");

	return new Response(object.body, {
		headers: {
			"Content-Type": object.httpMetadata?.contentType ?? "image/png",
			"Cache-Control": "private, max-age=600",
			"X-Content-Type-Options": "nosniff"
		}
	});
};
