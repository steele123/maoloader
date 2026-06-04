import { fail } from "@sveltejs/kit";
import { createSubmission } from "$lib/registry/admin";
import { isGitHubRepository, stringField } from "$lib/registry/forms";
import { loadListingsFromManifest } from "$lib/registry/manifest";
import type { RegistrySubmission } from "$lib/registry/types";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ platform }) => {
	return {
		canSubmit: Boolean(platform?.env?.PLUGIN_DB)
	};
};

export const actions: Actions = {
	default: async ({ request, platform }) => {
		const env = platform?.env;
		if (!env?.PLUGIN_DB) {
			return fail(501, {
				message: "Submissions are not available in this environment yet."
			});
		}

		const form = await request.formData();
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
			message: `Submission received with ${manifest.listings.length} listing${manifest.listings.length === 1 ? "" : "s"}. It will appear after review and mirroring.`,
			submissionId: submission.id
		};
	}
};
