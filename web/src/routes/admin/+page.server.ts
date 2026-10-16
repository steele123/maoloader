import { error, fail, redirect } from "@sveltejs/kit";
import { isGitHubRepository, stringField } from "$lib/registry/forms";
import {
	approveAndMirrorSubmission,
	createSubmission,
	rejectSubmission,
	removeListing,
	setListingFeatured,
	submissionListings
} from "$lib/registry/admin";
import { loadListingsFromManifest } from "$lib/registry/manifest";
import { getSubmission, listSubmissions, searchListings } from "$lib/registry/store";
import type { RegistrySubmission } from "$lib/registry/types";
import { directUploadProject } from "$lib/registry/upload";
import { endAdminSession } from "$lib/server/admin-auth";
import type { Actions, PageServerLoad, RequestEvent } from "./$types";

// hooks.server.ts already keeps signed-out visitors away from /admin; this is a second check.
function requireAdmin(event: RequestEvent) {
	if (!event.locals.admin) error(401, "Sign in first.");
	const env = event.platform?.env;
	if (!env?.PLUGIN_DB) error(501, "The D1 database isn't connected in this environment.");
	return env;
}

const message = (text: string) => ({ message: text, ok: true });
const problem = (status: number, text: string) => fail(status, { message: text, ok: false });
const errorText = (value: unknown) => String(value instanceof Error ? value.message : value);

export const load: PageServerLoad = async ({ platform }) => {
	const [submissions, listings] = await Promise.all([listSubmissions(platform), searchListings({}, platform)]);
	const published = Object.fromEntries(listings.map((listing) => [listing.slug, listing.version]));

	return {
		hasStorage: Boolean(platform?.env?.PLUGIN_DB && platform.env.PLUGIN_BUCKET),
		pending: submissions.filter((submission) => submission.status === "pending"),
		history: submissions.filter((submission) => submission.status !== "pending").slice(0, 40),
		listings,
		published,
		stats: {
			pending: submissions.filter((submission) => submission.status === "pending").length,
			listings: listings.length,
			installs: listings.reduce((total, listing) => total + (listing.downloads ?? 0), 0)
		}
	};
};

export const actions: Actions = {
	approve: async (event) => {
		const env = requireAdmin(event);
		if (!env.PLUGIN_BUCKET) return problem(501, "The R2 bucket isn't connected in this environment.");

		const id = stringField(await event.request.formData(), "id");
		const submission = await getSubmission(id, event.platform);
		if (!submission) return problem(404, "That submission no longer exists.");
		if (submission.status !== "pending") return problem(400, "That submission was already reviewed.");

		try {
			const listings = await approveAndMirrorSubmission(env, submission);
			return message(`Published ${listings.map((listing) => listing.name).join(", ")}.`);
		} catch (approveError) {
			return problem(400, errorText(approveError));
		}
	},

	reject: async (event) => {
		const env = requireAdmin(event);
		const form = await event.request.formData();
		const submission = await getSubmission(stringField(form, "id"), event.platform);
		if (!submission) return problem(404, "That submission no longer exists.");
		if (submission.status !== "pending") return problem(400, "That submission was already reviewed.");

		await rejectSubmission(env, submission, stringField(form, "reason"));
		const names = submissionListings(submission).map((listing) => listing.name).join(", ");
		return message(`Rejected ${names || "the submission"}.`);
	},

	feature: async (event) => {
		const env = requireAdmin(event);
		const form = await event.request.formData();
		const slug = stringField(form, "slug");
		const featured = stringField(form, "featured") === "true";
		try {
			await setListingFeatured(env, slug, featured);
			return message(featured ? `Featured ${slug}.` : `${slug} is no longer featured.`);
		} catch (featureError) {
			return problem(404, errorText(featureError));
		}
	},

	remove: async (event) => {
		const env = requireAdmin(event);
		const form = await event.request.formData();
		const slug = stringField(form, "slug");
		if (stringField(form, "confirm") !== slug) {
			return problem(400, `Type ${slug} to confirm removing it.`);
		}
		await removeListing(env, slug);
		return message(`Removed ${slug} from the store. Approving it again brings it back.`);
	},

	submitRepo: async (event) => {
		const env = requireAdmin(event);
		const form = await event.request.formData();
		const repository = stringField(form, "repository");
		if (!repository || !isGitHubRepository(repository)) {
			return problem(400, "Repository must be a GitHub URL.");
		}

		const now = new Date().toISOString();
		try {
			const manifest = await loadListingsFromManifest(
				repository,
				stringField(form, "githubRef"),
				now,
				stringField(form, "manifestPath")
			);
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
			return message(`Queued ${manifest.listings.length} listing${manifest.listings.length === 1 ? "" : "s"} for review.`);
		} catch (repoError) {
			return problem(400, errorText(repoError));
		}
	},

	upload: async (event) => {
		const env = requireAdmin(event);
		if (!env.PLUGIN_BUCKET) return problem(501, "The R2 bucket isn't connected in this environment.");
		try {
			const result = await directUploadProject(env, await event.request.formData());
			return message(result.message);
		} catch (uploadError) {
			return problem(400, errorText(uploadError));
		}
	},

	logout: async ({ cookies }) => {
		endAdminSession(cookies);
		redirect(303, "/admin/login");
	}
};
