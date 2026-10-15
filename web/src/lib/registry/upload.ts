import { createSubmission, publishListing } from "./admin";
import { listingFromParsedForm, parseListingForm, stringField } from "./forms";
import { listingsFromPackage } from "./manifest";
import { MAX_PACKAGE_BYTES, readPackageIcon, readPackageZip, wrapPackageZip } from "./package-zip";
import { getListing } from "./store";
import type { RegistryAsset, RegistryListing, RegistrySubmission } from "./types";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type DirectUploadResult = {
	message: string;
	slug: string;
	submissionId?: string;
	published: boolean;
	listing: RegistryListing;
};

export async function directUploadProject(env: Env, form: FormData): Promise<DirectUploadResult> {
	if (!env.PLUGIN_DB || !env.PLUGIN_BUCKET) {
		throw new Error("Cloudflare D1/R2 bindings are not configured for this environment.");
	}

	const parsed = parseListingForm(form);
	if ("error" in parsed) {
		throw new Error(parsed.error);
	}

	const packageFile = fileField(form, "package");
	if (!packageFile) {
		throw new Error("Upload a plugin/theme zip package.");
	}
	if (!packageFile.name.toLowerCase().endsWith(".zip")) {
		throw new Error("Package must be a .zip file.");
	}
	if (packageFile.size > MAX_PACKAGE_BYTES) {
		throw new Error("Package must be 25 MB or smaller.");
	}

	const now = new Date().toISOString();
	const baseKey = `${parsed.kind}s/${parsed.slug}/${parsed.version}`;
	const packageKey = `${baseKey}/${parsed.slug}-${parsed.version}.zip`;
	const packageAsset = await putFile(env.PLUGIN_BUCKET, packageKey, packageFile, "application/zip");

	let iconAsset: RegistryAsset | undefined;
	let screenshotAsset: RegistryAsset | undefined;
	iconAsset = await uploadOptionalImage(env.PLUGIN_BUCKET, form, "icon", `${baseKey}/icon`);
	screenshotAsset = await uploadOptionalImage(
		env.PLUGIN_BUCKET,
		form,
		"screenshot",
		`${baseKey}/screenshot-1`
	);

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
			published: true,
			listing
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
		published: false,
		listing
	};
}

export type PackageSubmissionResult = {
	message: string;
	submissionId: string;
	listings: { slug: string; name: string; version: string; updates?: string }[];
};

/** Anyone can send a zip. It is stored apart from published packages and waits for review. */
export async function submitPackageZip(
	env: Env,
	form: FormData,
	platform?: App.Platform
): Promise<PackageSubmissionResult> {
	if (!env.PLUGIN_DB || !env.PLUGIN_BUCKET) {
		throw new Error("Uploads are not available in this environment yet.");
	}

	const packageFile = fileField(form, "package");
	if (!packageFile) throw new Error("Choose your plugin's .zip file.");
	if (!packageFile.name.toLowerCase().endsWith(".zip")) {
		throw new Error("The package must be a .zip file.");
	}
	if (packageFile.size > MAX_PACKAGE_BYTES) throw new Error("The package must be 25 MB or smaller.");

	const bytes = new Uint8Array(await packageFile.arrayBuffer());
	const zip = readPackageZip(bytes);
	const now = new Date().toISOString();
	const listings = listingsFromPackage(
		zip,
		{
			name: stringField(form, "name"),
			version: stringField(form, "version"),
			description: stringField(form, "description"),
			author: stringField(form, "author"),
			kind: stringField(form, "kind"),
			tags: stringField(form, "tags")
		},
		now
	);

	const id = crypto.randomUUID();
	const base = `submissions/${id}`;
	const packageKey = `${base}/package.zip`;
	const stored = (zip.root ? bytes : wrapPackageZip(bytes, listings[0].slug)) as Uint8Array<ArrayBuffer>;
	await env.PLUGIN_BUCKET.put(packageKey, stored, { httpMetadata: { contentType: "application/zip" } });
	const sha256 = await sha256Hex(stored);

	const summary: PackageSubmissionResult["listings"] = [];
	for (const listing of listings) {
		listing.assets.package = {
			key: packageKey,
			url: `/api/plugins/${listing.slug}/download`,
			size: stored.byteLength,
			sha256
		};
		const icon = readPackageIcon(zip, listing.image_path);
		if (icon) {
			const key = `${base}/${listing.slug}-icon.${icon.extension}`;
			await env.PLUGIN_BUCKET.put(key, icon.data, { httpMetadata: { contentType: icon.type } });
			listing.assets.icon = { key, url: `/api/plugins/${listing.slug}/icon`, size: icon.data.byteLength };
		}
		const existing = await getListing(listing.slug, platform);
		summary.push({
			slug: listing.slug,
			name: listing.name,
			version: listing.version,
			updates: existing ? `${existing.name} v${existing.version} by ${existing.author.name}` : undefined
		});
	}

	// Reviewers need to know when an upload would replace someone's listing.
	const updates = summary.filter((entry) => entry.updates).map((entry) => `Replaces ${entry.updates}.`);
	const submission: RegistrySubmission = {
		id,
		status: "pending",
		created_at: now,
		updated_at: now,
		listing: listings[0],
		listings,
		notes: [stringField(form, "notes"), ...updates].filter(Boolean).join("\n") || undefined
	};
	await createSubmission(env, submission);

	const names = summary.map((entry) => entry.name).join(", ");
	return {
		message: `Thanks! ${names} is in the review queue. It shows up in the store once it's approved.`,
		submissionId: id,
		listings: summary
	};
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>) {
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function validateAdminToken(env: Env, form: FormData, authorization?: string | null) {
	if (!env.ADMIN_TOKEN) {
		return;
	}

	const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
	const token = stringField(form, "token") || bearer || "";
	if (token !== env.ADMIN_TOKEN) {
		throw new Error("Invalid admin token.");
	}
}

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
	if (file.type === "image/svg+xml") {
		return "svg";
	}
	return "png";
}
