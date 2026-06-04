import { fail } from "@sveltejs/kit";
import { isGitHubRepository, stringField } from "$lib/registry/forms";
import {
	approveAndMirrorSubmission,
	createSubmission
} from "$lib/registry/admin";
import { loadListingsFromManifest } from "$lib/registry/manifest";
import { getSubmission, listSubmissions } from "$lib/registry/store";
import type { RegistrySubmission } from "$lib/registry/types";
import { directUploadProject, validateAdminToken } from "$lib/registry/upload";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ platform }) => {
	return {
		hasBindings: Boolean(platform?.env?.PLUGIN_DB && platform.env.PLUGIN_BUCKET),
		tokenRequired: Boolean(platform?.env?.ADMIN_TOKEN),
		submissions: await listSubmissions(platform)
	};
};

export const actions: Actions = {
	submitRepo: async ({ request, platform }) => {
		const env = platform?.env;
		if (!env?.PLUGIN_DB) {
			return fail(501, {
				message: "Cloudflare D1 binding is not configured for this environment."
			});
		}

		const form = await request.formData();
		const token = stringField(form, "token");
		if (env.ADMIN_TOKEN && token !== env.ADMIN_TOKEN) {
			return fail(401, { message: "Invalid admin token." });
		}

		const repository = stringField(form, "repository");
		if (!repository || !isGitHubRepository(repository)) {
			return fail(400, { message: "Repository must be a GitHub URL." });
		}

		const now = new Date().toISOString();
		let manifest;
		try {
			manifest = await loadListingsFromManifest(
				repository,
				stringField(form, "githubRef"),
				now,
				stringField(form, "manifestPath")
			);
		} catch (error) {
			return fail(400, { message: String(error instanceof Error ? error.message : error) });
		}

		const submission: RegistrySubmission = {
			id: crypto.randomUUID(),
			status: "pending",
			created_at: now,
			updated_at: now,
			repository: manifest.repository,
			listing: manifest.listings[0],
			listings: manifest.listings,
			github_ref: manifest.ref,
			notes: stringField(form, "notes") || undefined
		};

		await createSubmission(env, submission);
		return {
			message: `Queued ${manifest.listings.length} listing${manifest.listings.length === 1 ? "" : "s"} for review and mirroring.`,
			slug: manifest.listings[0]?.slug,
			submissionId: submission.id,
			published: false
		};
	},

	approve: async ({ request, platform }) => {
		const env = platform?.env;
		if (!env?.PLUGIN_DB || !env.PLUGIN_BUCKET) {
			return fail(501, {
				message: "Cloudflare D1/R2 bindings are not configured for this environment."
			});
		}

		const form = await request.formData();
		const token = stringField(form, "token");
		if (env.ADMIN_TOKEN && token !== env.ADMIN_TOKEN) {
			return fail(401, { message: "Invalid admin token." });
		}

		const id = stringField(form, "id");
		const submission = await getSubmission(id, platform);
		if (!submission) {
			return fail(404, { message: "Submission not found." });
		}
		if (submission.status !== "pending") {
			return fail(400, { message: "Submission has already been reviewed." });
		}

		try {
			const listings = await approveAndMirrorSubmission(env, submission);
			return {
				message: `Mirrored and published ${listings.length} listing${listings.length === 1 ? "" : "s"}.`,
				slug: listings[0]?.slug,
				submissionId: submission.id,
				published: true
			};
		} catch (error) {
			return fail(400, { message: String(error instanceof Error ? error.message : error) });
		}
	},

	upload: async ({ request, platform }) => {
		const env = platform?.env;
		if (!env?.PLUGIN_DB || !env.PLUGIN_BUCKET) {
			return fail(501, {
				message: "Cloudflare D1/R2 bindings are not configured for this environment."
			});
		}

		const form = await request.formData();
		try {
			validateAdminToken(env, form);
		} catch (error) {
			return fail(401, { message: "Invalid admin token." });
		}

		try {
			return directUploadProject(env, form);
		} catch (error) {
			return fail(400, { message: String(error instanceof Error ? error.message : error) });
		}
	}
};
