import { fail } from "@sveltejs/kit";
import {
	isGitHubRepository,
	listingFromParsedForm,
	parseListingForm,
	stringField
} from "$lib/registry/forms";
import {
	approveAndMirrorSubmission,
	createSubmission,
	publishListing
} from "$lib/registry/admin";
import { loadListingsFromManifest } from "$lib/registry/manifest";
import { getSubmission, listSubmissions } from "$lib/registry/store";
import type { RegistryAsset, RegistryListing, RegistrySubmission } from "$lib/registry/types";
import type { Actions, PageServerLoad } from "./$types";

const MAX_PACKAGE_BYTES = 25 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

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
		const token = stringField(form, "token");
		if (env.ADMIN_TOKEN && token !== env.ADMIN_TOKEN) {
			return fail(401, { message: "Invalid admin token." });
		}

		const parsed = parseListingForm(form);
		if ("error" in parsed) {
			return fail(400, { message: parsed.error });
		}

		const packageFile = fileField(form, "package");
		if (!packageFile) {
			return fail(400, { message: "Upload a plugin/theme zip package." });
		}
		if (!packageFile.name.toLowerCase().endsWith(".zip")) {
			return fail(400, { message: "Package must be a .zip file." });
		}
		if (packageFile.size > MAX_PACKAGE_BYTES) {
			return fail(400, { message: "Package must be 25 MB or smaller." });
		}

		const now = new Date().toISOString();
		const baseKey = `${parsed.kind}s/${parsed.slug}/${parsed.version}`;
		const packageKey = `${baseKey}/${parsed.slug}-${parsed.version}.zip`;
		const packageAsset = await putFile(env.PLUGIN_BUCKET, packageKey, packageFile, "application/zip");

		let iconAsset: RegistryAsset | undefined;
		let screenshotAsset: RegistryAsset | undefined;
		try {
			iconAsset = await uploadOptionalImage(env.PLUGIN_BUCKET, form, "icon", `${baseKey}/icon`);
			screenshotAsset = await uploadOptionalImage(
				env.PLUGIN_BUCKET,
				form,
				"screenshot",
				`${baseKey}/screenshot-1`
			);
		} catch (error) {
			return fail(400, { message: String(error instanceof Error ? error.message : error) });
		}

		const listing: RegistryListing = {
			...listingFromParsedForm(parsed, now),
			assets: {
				package: {
					...packageAsset,
					url: `/api/plugins/${parsed.slug}/download`
				},
				icon: iconAsset,
				screenshots: screenshotAsset ? [screenshotAsset] : []
			}
		};

		if (parsed.publish) {
			await publishListing(env, listing);
			return {
				message: `Published ${listing.name}.`,
				slug: listing.slug,
				published: true
			};
		}

		const submission: RegistrySubmission = {
			id: crypto.randomUUID(),
			status: "pending",
			created_at: now,
			updated_at: now,
			listing,
			notes: parsed.notes || undefined
		};
		await createSubmission(env, submission);

		return {
			message: `Queued ${listing.name} for review.`,
			slug: listing.slug,
			submissionId: submission.id,
			published: false
		};
	}
};

function fileField(form: FormData, name: string) {
	const value = form.get(name);
	return value instanceof File && value.size > 0 ? value : undefined;
}

async function putFile(
	bucket: R2Bucket,
	key: string,
	file: File,
	contentType: string
): Promise<RegistryAsset> {
	const body = await file.arrayBuffer();
	await bucket.put(key, body, {
		httpMetadata: {
			contentType
		}
	});
	return {
		key,
		size: file.size
	};
}

async function uploadOptionalImage(bucket: R2Bucket, form: FormData, name: string, keyBase: string) {
	const file = fileField(form, name);
	if (!file) {
		return undefined;
	}
	if (!file.type.startsWith("image/")) {
		throw new Error(`${name} must be an image file.`);
	}
	if (file.size > MAX_IMAGE_BYTES) {
		throw new Error(`${name} must be 5 MB or smaller.`);
	}

	const extension = imageExtension(file);
	return putFile(bucket, `${keyBase}.${extension}`, file, file.type);
}

function imageExtension(file: File) {
	if (file.type === "image/jpeg") {
		return "jpg";
	}
	if (file.type === "image/webp") {
		return "webp";
	}
	if (file.type === "image/gif") {
		return "gif";
	}
	return "png";
}
