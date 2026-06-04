import { error, json } from "@sveltejs/kit";
import { directUploadProject, validateAdminToken } from "$lib/registry/upload";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request, platform }) => {
	const env = platform?.env;
	if (!env?.PLUGIN_DB || !env.PLUGIN_BUCKET) {
		error(501, "Cloudflare D1/R2 bindings are not configured for this environment.");
	}

	const contentType = request.headers.get("content-type") || "";
	if (!contentType.toLowerCase().includes("multipart/form-data")) {
		error(415, "Upload must use multipart/form-data.");
	}

	const form = await request.formData();
	try {
		validateAdminToken(env, form, request.headers.get("authorization"));
	} catch {
		error(401, "Invalid admin token.");
	}

	try {
		const result = await directUploadProject(env, form);
		return json(
			{
				message: result.message,
				slug: result.slug,
				submission_id: result.submissionId,
				published: result.published,
				listing: result.listing
			},
			{
				status: result.published ? 201 : 202
			}
		);
	} catch (uploadError) {
		error(400, String(uploadError instanceof Error ? uploadError.message : uploadError));
	}
};
