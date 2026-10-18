<script lang="ts">
	import { enhance } from "$app/forms";
	import { page } from "$app/state";
	import CheckIcon from "@lucide/svelte/icons/check";
	import DownloadIcon from "@lucide/svelte/icons/download";
	import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
	import FileArchiveIcon from "@lucide/svelte/icons/file-archive";
	import GitBranchIcon from "@lucide/svelte/icons/git-branch";
	import HistoryIcon from "@lucide/svelte/icons/history";
	import InboxIcon from "@lucide/svelte/icons/inbox";
	import LogOutIcon from "@lucide/svelte/icons/log-out";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import RefreshIcon from "@lucide/svelte/icons/refresh-cw";
	import StarIcon from "@lucide/svelte/icons/star";
	import StoreIcon from "@lucide/svelte/icons/store";
	import TrashIcon from "@lucide/svelte/icons/trash-2";
	import XIcon from "@lucide/svelte/icons/x";
	import { Button } from "$lib/components/ui/button";
	import type { RegistryListing, RegistrySubmission } from "$lib/registry/types";
	import type { SubmitFunction } from "@sveltejs/kit";
	import type { ActionData, PageData } from "./$types";

	let { data, form }: { data: PageData; form: ActionData } = $props();

	type Tab = "queue" | "store" | "add" | "history";
	const tabs: { id: Tab; label: string; icon: typeof InboxIcon }[] = [
		{ id: "queue", label: "Review queue", icon: InboxIcon },
		{ id: "store", label: "Published", icon: StoreIcon },
		{ id: "add", label: "Add a plugin", icon: PlusIcon },
		{ id: "history", label: "History", icon: HistoryIcon }
	];
	const initialTab = page.url.searchParams.get("tab") as Tab | null;
	let tab: Tab = $state(tabs.some((entry) => entry.id === initialTab) ? initialTab! : "queue");

	// Keeps the open tab in the address bar so a reload stays put.
	function selectTab(next: Tab) {
		tab = next;
		const url = new URL(page.url);
		url.searchParams.set("tab", next);
		history.replaceState(history.state, "", url);
	}

	// One action at a time; remembers which button is working so it can say so.
	let busyKey = $state("");
	const busy =
		(key: string): SubmitFunction =>
		() => {
			busyKey = key;
			return async ({ update }) => {
				await update({ reset: false });
				busyKey = "";
				rejecting = "";
				removing = "";
			};
		};

	let rejecting = $state("");
	let removing = $state("");
	let storeFilter = $state("");

	const listingsOf = (submission: RegistrySubmission): RegistryListing[] =>
		submission.listings?.length ? submission.listings : submission.listing ? [submission.listing] : [];

	const shownListings = $derived(
		data.listings.filter((listing) =>
			[listing.name, listing.slug, listing.author.name].join(" ").toLowerCase().includes(storeFilter.trim().toLowerCase())
		)
	);

	function ago(value?: string) {
		if (!value) return "";
		const seconds = (Date.now() - new Date(value).getTime()) / 1000;
		if (seconds < 60) return "just now";
		const units: [number, string][] = [
			[60, "minute"],
			[3600, "hour"],
			[86400, "day"],
			[604800, "week"]
		];
		let [size, name] = units[0];
		for (const unit of units) if (seconds >= unit[0]) [size, name] = unit;
		const count = Math.floor(seconds / size);
		return `${count} ${name}${count === 1 ? "" : "s"} ago`;
	}

	const shortSha = (sha?: string) => (sha && /^[0-9a-f]{40}$/i.test(sha) ? sha.slice(0, 7) : sha);
	const treeUrl = (submission: RegistrySubmission) =>
		submission.repository && submission.github_ref
			? `${submission.repository}/tree/${submission.github_ref}`
			: submission.repository;
</script>

<svelte:head>
	<title>Admin · maoloader</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<header class="admin-top">
	<div>
		<p class="eyebrow">Admin</p>
		<h1>Store admin</h1>
	</div>
	<div class="admin-stats" aria-label="Overview">
		<span class:is-hot={data.stats.pending > 0}><strong>{data.stats.pending}</strong> waiting</span>
		<span><strong>{data.stats.listings}</strong> published</span>
		<span><strong>{data.stats.installs.toLocaleString()}</strong> installs</span>
	</div>
	<form method="POST" action="?/logout">
		<Button type="submit" variant="outline" size="sm"><LogOutIcon />Sign out</Button>
	</form>
</header>

{#if !data.hasStorage}
	<p class="admin-message">The D1 database or R2 bucket isn't connected here, so some actions won't work.</p>
{/if}
{#if form?.message}
	<p class="admin-message" class:success={form.ok} role="status">{form.message}</p>
{/if}

<nav class="admin-tabs" aria-label="Admin sections">
	{#each tabs as entry}
		<button type="button" aria-current={tab === entry.id ? "page" : undefined} onclick={() => selectTab(entry.id)}>
			<entry.icon />
			{entry.label}
			{#if entry.id === "queue" && data.stats.pending}<span class="tab-count">{data.stats.pending}</span>{/if}
		</button>
	{/each}
</nav>

{#if tab === "queue"}
	{#if data.pending.length}
		<div class="review-list">
			{#each data.pending as submission (submission.id)}
				{@const listings = listingsOf(submission)}
				<article class="surface review-card">
					<header>
						<span class="source-chip">
							{#if submission.repository}
								<GitBranchIcon />
								<a href={treeUrl(submission)} target="_blank" rel="noreferrer">
									{submission.repository.replace("https://github.com/", "")}
								</a>
								{#if submission.github_ref}<code>{shortSha(submission.github_ref)}</code>{/if}
							{:else}
								<FileArchiveIcon />Uploaded .zip
							{/if}
						</span>
						<span class="muted">{ago(submission.created_at)}</span>
					</header>

					<ul class="review-listings">
						{#each listings as listing}
							<li>
								<span class="mini-icon">
									{#if listing.assets.icon?.url}<img src={listing.assets.icon.url} alt="" loading="lazy" />{:else}{listing.name.slice(0, 1)}{/if}
								</span>
								<span class="review-name">
									<strong>{listing.name}</strong>
									<small>{listing.slug} · v{listing.version} · {listing.author.name}</small>
								</span>
								{#if data.published[listing.slug]}
									<span class="pill is-update">updates v{data.published[listing.slug]}</span>
								{:else}
									<span class="pill is-new">new</span>
								{/if}
								{#if listing.assets.screenshots?.length}
									<!-- Uploads are only served to reviewers until they're approved. -->
									<span class="review-shots">
										{#each listing.assets.screenshots as shot, index}
											{@const src = shot.url?.startsWith("/api/")
												? `/api/admin/submissions/${submission.id}/screenshots/${listing.slug}/${index + 1}`
												: shot.url}
											<a href={src} target="_blank" rel="noreferrer" title={shot.caption ?? `Screenshot ${index + 1}`}>
												<img {src} alt={shot.caption ?? ""} loading="lazy" />
											</a>
										{/each}
									</span>
								{/if}
							</li>
						{/each}
					</ul>

					{#if submission.notes}<p class="review-notes">{submission.notes}</p>{/if}

					<footer>
						{#if submission.repository}
							<Button href={treeUrl(submission)} target="_blank" rel="noreferrer" variant="outline" size="sm">
								<ExternalLinkIcon />Read the code
							</Button>
						{:else}
							<!-- Read uploaded code before approving it. -->
							<Button href={`/api/admin/submissions/${submission.id}/package`} variant="outline" size="sm">
								<DownloadIcon />Download zip
							</Button>
						{/if}
						<span class="spacer"></span>
						{#if rejecting === submission.id}
							<form method="POST" action="?/reject" class="inline-form" use:enhance={busy(`reject-${submission.id}`)}>
								<input type="hidden" name="id" value={submission.id} />
								<input name="reason" placeholder="Reason (optional)" aria-label="Reason for rejecting" />
								<Button type="submit" variant="destructive" size="sm" disabled={!!busyKey}>Reject</Button>
								<Button type="button" variant="ghost" size="sm" onclick={() => (rejecting = "")}>Cancel</Button>
							</form>
						{:else}
							<Button type="button" variant="ghost" size="sm" onclick={() => (rejecting = submission.id)}>
								<XIcon />Reject
							</Button>
							<form method="POST" action="?/approve" use:enhance={busy(`approve-${submission.id}`)}>
								<input type="hidden" name="id" value={submission.id} />
								<Button type="submit" size="sm" disabled={!!busyKey}>
									<CheckIcon />
									{busyKey === `approve-${submission.id}`
										? "Publishing…"
										: `Approve${listings.length > 1 ? ` all ${listings.length}` : ""}`}
								</Button>
							</form>
						{/if}
					</footer>
				</article>
			{/each}
		</div>
	{:else}
		<div class="empty-panel">
			<strong>Nothing to review</strong>
			<span>New uploads and repo submissions show up here.</span>
		</div>
	{/if}
{:else if tab === "store"}
	<section class="surface sync-panel" aria-label="GitHub sync">
		<div class="section-title"><RefreshIcon /><h2>GitHub sync</h2></div>
		<p class="muted">
			{#if data.webhook.configured}
				Pushes to a repo's default branch update the store on their own. Repos marked <em>auto-publish</em> go live at once; others land in the review queue.
			{:else}
				Webhook not set up yet: add a <code>GITHUB_WEBHOOK_SECRET</code>, then a webhook on GitHub to <code>{data.webhook.url}</code> (content type <code>application/json</code>, push events only). Until then, sync by hand here.
			{/if}
		</p>
		{#each data.repositories as repo (repo.repository)}
			<form class="sync-row" method="POST" action="?/sync" use:enhance={busy(`sync-${repo.repository}`)}>
				<input type="hidden" name="repository" value={repo.repository} />
				<a href={repo.repository} target="_blank" rel="noreferrer">{repo.repository.replace("https://github.com/", "")}<ExternalLinkIcon class="inline-icon" /></a>
				<span class="muted">{repo.plugins} plugin{repo.plugins === 1 ? "" : "s"}</span>
				{#if repo.autoPublish}<span class="badge">auto-publish</span>{/if}
				<Button type="submit" size="sm" variant="outline" disabled={!!busyKey}>
					{busyKey === `sync-${repo.repository}` ? "Syncing…" : "Sync now"}
				</Button>
			</form>
		{:else}
			<p class="muted">No published plugins come from GitHub yet.</p>
		{/each}
	</section>
	<div class="store-toolbar">
		<input bind:value={storeFilter} placeholder="Filter published plugins" aria-label="Filter published plugins" />
		<span class="muted">{shownListings.length} of {data.listings.length}</span>
	</div>
	{#if shownListings.length}
		<div class="surface published-table" role="table" aria-label="Published plugins">
			{#each shownListings as listing (listing.slug)}
				<div class="published-row" role="row">
					<span class="mini-icon" role="cell">
						{#if listing.assets.icon?.url}<img src={listing.assets.icon.url} alt="" loading="lazy" />{:else}{listing.name.slice(0, 1)}{/if}
					</span>
					<span class="review-name" role="cell">
						<a href={`/plugins/${listing.slug}`}><strong>{listing.name}</strong></a>
						<small>{listing.slug} · {listing.author.name}</small>
					</span>
					<span role="cell" class="muted">v{listing.version}</span>
					<span role="cell" class="muted"><DownloadIcon class="inline-icon" />{(listing.downloads ?? 0).toLocaleString()}</span>
					<span role="cell" class="muted">{ago(listing.updated_at)}</span>
					<span role="cell" class="row-actions">
						<form method="POST" action="?/feature" use:enhance={busy(`feature-${listing.slug}`)}>
							<input type="hidden" name="slug" value={listing.slug} />
							<input type="hidden" name="featured" value={String(!listing.featured)} />
							<button
								class="star-toggle"
								class:is-on={listing.featured}
								type="submit"
								disabled={!!busyKey}
								title={listing.featured ? "Unfeature" : "Feature on the home page"}
								aria-label={listing.featured ? `Unfeature ${listing.name}` : `Feature ${listing.name}`}
							>
								<StarIcon />
							</button>
						</form>
						<button
							class="icon-ghost"
							type="button"
							title="Remove from store"
							aria-label={`Remove ${listing.name}`}
							onclick={() => (removing = removing === listing.slug ? "" : listing.slug)}
						>
							<TrashIcon />
						</button>
					</span>
					{#if removing === listing.slug}
						<form method="POST" action="?/remove" class="remove-confirm" use:enhance={busy(`remove-${listing.slug}`)}>
							<input type="hidden" name="slug" value={listing.slug} />
							<span>Type <code>{listing.slug}</code> to remove it from the store:</span>
							<input name="confirm" autocomplete="off" aria-label={`Type ${listing.slug} to confirm`} />
							<Button type="submit" variant="destructive" size="sm" disabled={!!busyKey}>Remove</Button>
							<Button type="button" variant="ghost" size="sm" onclick={() => (removing = "")}>Cancel</Button>
						</form>
					{/if}
				</div>
			{/each}
		</div>
	{:else}
		<div class="empty-panel">
			<strong>{data.listings.length ? "Nothing matches" : "Nothing published yet"}</strong>
			<span>Approved submissions appear here.</span>
		</div>
	{/if}
{:else if tab === "add"}
	<div class="admin-add">
		<form class="surface-form" method="POST" action="?/submitRepo" use:enhance={busy("repo")}>
			<div class="section-title"><GitBranchIcon /><h2>From a GitHub repo</h2></div>
			<p class="muted">Reads the repo's maoloader.json and adds it to the review queue, pinned to the current commit.</p>
			<div class="form-grid">
				<label class="wide">
					<span>Repository</span>
					<input name="repository" type="url" placeholder="https://github.com/owner/repo" required />
				</label>
				<label>
					<span>Branch, tag or commit</span>
					<input name="githubRef" placeholder="Default branch" />
				</label>
				<label>
					<span>Manifest path</span>
					<input name="manifestPath" placeholder="maoloader.json" />
				</label>
				<label class="wide">
					<span>Notes</span>
					<textarea name="notes" rows="2"></textarea>
				</label>
			</div>
			<div class="form-actions">
				<Button type="submit" disabled={!!busyKey}>{busyKey === "repo" ? "Reading repo…" : "Add to queue"}</Button>
			</div>
		</form>

		<form class="surface-form" method="POST" action="?/upload" enctype="multipart/form-data" use:enhance={busy("upload")}>
			<div class="section-title"><FileArchiveIcon /><h2>Upload a .zip with details</h2></div>
			<p class="muted">For packages without a maoloader.json. Can publish straight away.</p>
			<div class="form-grid">
				<label class="wide">
					<span>Package .zip</span>
					<input name="package" type="file" accept=".zip,application/zip" required />
				</label>
				<label>
					<span>Name</span>
					<input name="name" required />
				</label>
				<label>
					<span>Slug</span>
					<input name="slug" placeholder="my-plugin" required />
				</label>
				<label>
					<span>Version</span>
					<input name="version" placeholder="0.1.0" required />
				</label>
				<label>
					<span>Kind</span>
					<select name="kind">
						<option value="plugin">Plugin</option>
						<option value="theme">Theme</option>
					</select>
				</label>
				<label class="wide">
					<span>Description</span>
					<textarea name="description" rows="2" required></textarea>
				</label>
				<label>
					<span>Author</span>
					<input name="author" value="maoloader" required />
				</label>
				<label>
					<span>Entry file</span>
					<input name="entry" value="index.js" required />
				</label>
				<label>
					<span>Tags</span>
					<input name="tags" placeholder="lobby, ui" />
				</label>
				<label>
					<span>Files</span>
					<input name="files" placeholder="index.js, styles.css" />
				</label>
				<label>
					<span>Icon</span>
					<input name="icon" type="file" accept="image/*" />
				</label>
				<label>
					<span>Screenshot</span>
					<input name="screenshot" type="file" accept="image/*" />
				</label>
				<label>
					<span>Repository</span>
					<input name="repository" type="url" placeholder="Optional" />
				</label>
				<label>
					<span>Homepage</span>
					<input name="homepage" type="url" placeholder="Optional" />
				</label>
			</div>
			<div class="admin-options">
				<label><input name="publish" type="checkbox" /> Publish now (skip the queue)</label>
				<label><input name="featured" type="checkbox" /> Featured</label>
			</div>
			<div class="form-actions">
				<Button type="submit" disabled={!!busyKey}>{busyKey === "upload" ? "Uploading…" : "Upload"}</Button>
			</div>
		</form>
	</div>
{:else if data.history.length}
	<div class="surface published-table">
		{#each data.history as submission (submission.id)}
			<div class="history-row">
				<span class="pill" class:is-new={submission.status === "approved"} class:is-rejected={submission.status === "rejected"}>
					{submission.status}
				</span>
				<span class="review-name">
					<strong>{listingsOf(submission).map((listing) => listing.name).join(", ") || "Untitled"}</strong>
					<small>
						{submission.repository ? submission.repository.replace("https://github.com/", "") : "Uploaded .zip"}
						{#if submission.github_ref}· {shortSha(submission.github_ref)}{/if}
						{#if submission.review_note}· “{submission.review_note}”{/if}
					</small>
				</span>
				<span class="muted">{ago(submission.reviewed_at ?? submission.updated_at)}</span>
			</div>
		{/each}
	</div>
{:else}
	<div class="empty-panel">
		<strong>No reviews yet</strong>
		<span>Approved and rejected submissions are listed here.</span>
	</div>
{/if}
