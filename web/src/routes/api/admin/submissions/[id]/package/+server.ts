import { error } from "@sveltejs/kit";
import { submissionListings } from "$lib/registry/admin";
import { getSubmission } from "$lib/registry/store";
import { validateAdminToken } from "$lib/registry/upload";
import type { RequestHandler } from "./$types";

// Lets a reviewer read an uploaded zip before approving it. A POST so the token stays out of URLs.
export const POST: RequestHandler = async ({ params, platform, request }) => {
	const env = platform?.env;
	if (!env?.PLUGIN_BUCKET) error(501, "PLUGIN_BUCKET R2 binding is not configured");

	try {
		validateAdminToken(env, await request.formData(), request.headers.get("authorization"));
	} catch {
		error(401, "Invalid admin token.");
	}

	const submission = await getSubmission(params.id, platform);
	const key = submission && submissionListings(submission)[0]?.assets.package?.key;
	if (!key) error(404, "This submission has no uploaded package.");

	const object = await env.PLUGIN_BUCKET.get(key);
	if (!object) error(404, "Package object not found");

	const slug = submissionListings(submission)[0].slug;
	return new Response(object.body, {
		headers: {
			"Content-Type": "application/zip",
			"Content-Length": String(object.size),
			"Content-Disposition": `attachment; filename="${slug}-submission.zip"`
		}
	});
};
