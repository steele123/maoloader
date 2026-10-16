import { error } from "@sveltejs/kit";
import { submissionListings } from "$lib/registry/admin";
import { getSubmission } from "$lib/registry/store";
import type { RequestHandler } from "./$types";

// Lets a signed-in reviewer read an uploaded zip before approving it.
// hooks.server.ts turns away anyone who isn't signed in; this checks again.
export const GET: RequestHandler = async ({ params, platform, locals }) => {
	if (!locals.admin) error(401, "Sign in first.");
	const bucket = platform?.env?.PLUGIN_BUCKET;
	if (!bucket) error(501, "PLUGIN_BUCKET R2 binding is not configured");

	const submission = await getSubmission(params.id, platform);
	const listing = submission && submissionListings(submission)[0];
	const key = listing?.assets.package?.key;
	if (!listing || !key) error(404, "This submission has no uploaded package.");

	const object = await bucket.get(key);
	if (!object) error(404, "Package object not found");

	return new Response(object.body, {
		headers: {
			"Content-Type": "application/zip",
			"Content-Length": String(object.size),
			"Content-Disposition": `attachment; filename="${listing.slug}-submission.zip"`
		}
	});
};
