<script lang="ts">
	import GitBranchIcon from "@lucide/svelte/icons/git-branch";
	import PackageCheckIcon from "@lucide/svelte/icons/package-check";
	import UploadCloudIcon from "@lucide/svelte/icons/upload-cloud";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Label } from "$lib/components/ui/label";
	import { Textarea } from "$lib/components/ui/textarea";
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
			<Label>
				<span>Admin token</span>
				<Input name="token" type="password" autocomplete="current-password" />
			</Label>
			<Label>
				<span>GitHub repository</span>
				<Input name="repository" type="url" placeholder="https://github.com/owner/repo" required />
			</Label>
			<Label>
				<span>Branch, tag, or SHA</span>
				<Input name="githubRef" placeholder="main, v1.0.0, or leave empty for default branch" />
			</Label>
			<Label class="wide">
				<span>Manifest path</span>
				<Input name="manifestPath" placeholder="packages/example/maoloader.json" />
				<small>Leave empty for root maoloader.json.</small>
			</Label>
			<Label class="wide">
				<span>Review notes</span>
				<Textarea name="notes" rows={2} />
			</Label>
		</div>

		<div class="form-actions">
			<Button type="submit">Queue for review</Button>
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
							<Input name="id" type="hidden" value={submission.id} />
							<Input name="token" type="password" placeholder="Admin token" />
							<Button type="submit" size="sm">Approve</Button>
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

<details class="manual-upload" open>
	<summary>Direct project upload - no GitHub repo or maoloader.json required</summary>
	<form class="admin-form" method="POST" action="?/upload" enctype="multipart/form-data">
		<section>
			<div class="section-title">
				<UploadCloudIcon />
				<h2>Upload zip and metadata</h2>
			</div>
			<div class="form-grid">
				<Label>
					<span>Admin token</span>
					<Input name="token" type="password" autocomplete="current-password" />
				</Label>
				<Label>
					<span>Kind</span>
					<select name="kind" required>
						<option value="plugin">Plugin</option>
						<option value="theme">Theme</option>
					</select>
				</Label>
				<Label>
					<span>Package zip</span>
					<Input name="package" type="file" accept=".zip,application/zip" required />
				</Label>
				<Label>
					<span>Repository</span>
					<Input name="repository" type="url" placeholder="Optional" />
				</Label>
				<Label>
					<span>Homepage</span>
					<Input name="homepage" type="url" placeholder="Optional project page" />
				</Label>
				<Label>
					<span>Slug</span>
					<Input name="slug" placeholder="my-plugin" required />
				</Label>
				<Label>
					<span>Name</span>
					<Input name="name" required />
				</Label>
				<Label>
					<span>Version</span>
					<Input name="version" placeholder="0.1.0" required />
				</Label>
				<Label>
					<span>Entry file</span>
					<Input name="entry" value="index.js" required />
				</Label>
				<Label class="wide">
					<span>Description</span>
					<Textarea name="description" rows={3} required />
				</Label>
				<Label>
					<span>Author</span>
					<Input name="author" required />
				</Label>
				<Label>
					<span>Author URL</span>
					<Input name="authorUrl" type="url" placeholder="Optional" />
				</Label>
				<Label>
					<span>Tags</span>
					<Input name="tags" placeholder="theme, ui, example" />
				</Label>
				<Label>
					<span>Compatibility</span>
					<Input name="compatibility" value=">=0.1.0" />
				</Label>
				<Label class="wide">
					<span>Files</span>
					<Input name="files" placeholder="index.js, styles.css, README.md" />
				</Label>
				<Label>
					<span>Icon image</span>
					<Input name="icon" type="file" accept="image/*" />
				</Label>
				<Label>
					<span>Screenshot</span>
					<Input name="screenshot" type="file" accept="image/*" />
				</Label>
				<Label class="wide">
					<span>Review notes</span>
					<Textarea name="notes" rows={2} />
				</Label>
			</div>
		</section>
		<section class="admin-options">
			<Label>
				<Input class="size-4 w-auto shadow-none" name="featured" type="checkbox" />
				<span>Featured listing</span>
			</Label>
			<Label>
				<Input class="size-4 w-auto shadow-none" name="publish" type="checkbox" />
				<span>Publish immediately instead of pending review</span>
			</Label>
		</section>
		<div class="admin-actions">
			<Button type="submit">Upload zip</Button>
		</div>
	</form>
</details>
