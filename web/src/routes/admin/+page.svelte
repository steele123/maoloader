<script lang="ts">
	import GitBranchIcon from "@lucide/svelte/icons/git-branch";
	import PackageCheckIcon from "@lucide/svelte/icons/package-check";
	import UploadCloudIcon from "@lucide/svelte/icons/upload-cloud";
	import type { ActionData, PageData } from "./$types";

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const pending = $derived(data.submissions.filter((submission) => submission.status === "pending"));
	const submissionListings = (submission: PageData["submissions"][number]) =>
		submission.listings?.length ? submission.listings : submission.listing ? [submission.listing] : [];
</script>

<svelte:head>
	<title>Admin upload - maoloader plugins</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<section class="page-hero compact">
	<div>
		<p class="eyebrow">Admin</p>
		<h1>Review GitHub repos, then mirror approved packages.</h1>
		<p>
			Approve manifest-backed submissions and mirror immutable GitHub archives into registry
			storage.
		</p>
	</div>
	<div class:ready={data.hasBindings} class="status-panel">
		<strong>{data.hasBindings ? "Storage ready" : "Storage missing"}</strong>
		<span>{data.tokenRequired ? "Admin token required" : "No token configured"}</span>
	</div>
</section>

{#if form?.message}
	<p class:success={form.published} class="admin-message">{form.message}</p>
{/if}

<div class="admin-layout">
	<form class="surface-form" method="POST" action="?/submitRepo">
		<div class="section-title">
			<GitBranchIcon />
			<h2>Submit GitHub repo</h2>
		</div>
		<div class="form-grid">
			<label>
				<span>Admin token</span>
				<input name="token" type="password" autocomplete="current-password" />
			</label>
			<label>
				<span>GitHub repository</span>
				<input name="repository" type="url" placeholder="https://github.com/owner/repo" required />
			</label>
			<label>
				<span>Branch, tag, or SHA</span>
				<input name="githubRef" placeholder="main, v1.0.0, or leave empty for default branch" />
			</label>
			<label class="wide">
				<span>Manifest path</span>
				<input name="manifestPath" placeholder="packages/example/maoloader.json" />
				<small>Leave empty for root maoloader.json.</small>
			</label>
			<label class="wide">
				<span>Review notes</span>
				<textarea name="notes" rows="2"></textarea>
			</label>
		</div>

		<div class="form-actions">
			<button type="submit">Queue for review</button>
		</div>
	</form>

	<section class="surface-panel queue-panel">
		<div class="section-title">
			<PackageCheckIcon />
			<h2>Pending mirrors</h2>
		</div>

		{#if pending.length > 0}
			<div class="submission-list">
				{#each pending as submission}
					<article>
						<div>
							<strong>{submissionListings(submission).map((listing) => listing.name).join(", ")}</strong>
							<span>{submission.repository || submissionListings(submission)[0]?.repository}</span>
							<small>
								{submissionListings(submission).length} listing{submissionListings(submission).length === 1
									? ""
									: "s"}
								{#if submission.github_ref} - {submission.github_ref}{/if}
							</small>
						</div>
						<form method="POST" action="?/approve">
							<input name="id" type="hidden" value={submission.id} />
							<input name="token" type="password" placeholder="Admin token" />
							<button type="submit">Approve</button>
						</form>
					</article>
				{/each}
			</div>
		{:else}
			<div class="empty-panel">
				<strong>No pending submissions</strong>
				<span>Submitted repos with a valid maoloader.json manifest will appear here.</span>
			</div>
		{/if}
	</section>
</div>

<details class="manual-upload">
	<summary>Manual zip upload fallback</summary>
	<form class="admin-form" method="POST" action="?/upload" enctype="multipart/form-data">
		<section>
			<div class="section-title">
				<UploadCloudIcon />
				<h2>Direct R2 package upload</h2>
			</div>
			<div class="form-grid">
				<label>
					<span>Admin token</span>
					<input name="token" type="password" autocomplete="current-password" />
				</label>
				<label>
					<span>Kind</span>
					<select name="kind" required>
						<option value="plugin">Plugin</option>
						<option value="theme">Theme</option>
					</select>
				</label>
				<label>
					<span>Package zip</span>
					<input name="package" type="file" accept=".zip,application/zip" required />
				</label>
				<label>
					<span>Repository</span>
					<input name="repository" type="url" placeholder="https://github.com/..." />
				</label>
				<label>
					<span>Slug</span>
					<input name="slug" placeholder="my-plugin" required />
				</label>
				<label>
					<span>Name</span>
					<input name="name" required />
				</label>
				<label>
					<span>Version</span>
					<input name="version" placeholder="0.1.0" required />
				</label>
				<label>
					<span>Entry file</span>
					<input name="entry" value="index.js" required />
				</label>
				<label class="wide">
					<span>Description</span>
					<textarea name="description" rows="3" required></textarea>
				</label>
				<label>
					<span>Author</span>
					<input name="author" required />
				</label>
				<label>
					<span>Tags</span>
					<input name="tags" placeholder="theme, ui, example" />
				</label>
				<label>
					<span>Compatibility</span>
					<input name="compatibility" value=">=0.1.0" />
				</label>
				<label class="wide">
					<span>Files</span>
					<input name="files" placeholder="index.js, styles.css, README.md" />
				</label>
			</div>
		</section>
		<section class="admin-options">
			<label>
				<input name="featured" type="checkbox" />
				<span>Featured listing</span>
			</label>
			<label>
				<input name="publish" type="checkbox" />
				<span>Publish immediately instead of pending review</span>
			</label>
		</section>
		<div class="admin-actions">
			<button type="submit">Upload zip</button>
		</div>
	</form>
</details>
