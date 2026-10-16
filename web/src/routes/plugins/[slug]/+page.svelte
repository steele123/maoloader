<script lang="ts">
	import { browser } from "$app/environment";
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import CopyIcon from "@lucide/svelte/icons/copy";
	import DownloadIcon from "@lucide/svelte/icons/download";
	import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
	import FileCodeIcon from "@lucide/svelte/icons/file-code";
	import BookOpenIcon from "@lucide/svelte/icons/book-open";
	import SparklesIcon from "@lucide/svelte/icons/sparkles";
	import LinkIcon from "@lucide/svelte/icons/link-2";
	import MonitorDownIcon from "@lucide/svelte/icons/monitor-down";
	import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";
	import UserIcon from "@lucide/svelte/icons/user";
	import { Badge } from "$lib/components/ui/badge";
	import { fileType } from "$lib/file-types";
	import { Button } from "$lib/components/ui/button";
	import { toast } from "svelte-sonner";
	import type { PageData } from "./$types";

	let { data }: { data: PageData } = $props();
	const listing = $derived(data.listing);

	type ExplorerRow = {
		path: string;
		name: string;
		depth: number;
		kind: "folder" | "file";
		isEntry: boolean;
	};

	function githubDetails(repository?: string) {
		if (!repository) return undefined;

		try {
			const url = new URL(repository);
			const [owner, repo] = url.pathname.split("/").filter(Boolean);
			if (url.hostname !== "github.com" || !owner || !repo) {
				return { href: repository, label: repository };
			}

			return {
				href: `https://github.com/${owner}/${repo.replace(/\.git$/i, "")}`,
				label: `${owner}/${repo.replace(/\.git$/i, "")}`,
				ownerHref: `https://github.com/${owner}`,
				ownerLabel: owner
			};
		} catch {
			return { href: repository, label: repository };
		}
	}

	function createExplorerRows(files: string[], entry: string): ExplorerRow[] {
		const normalizedFiles = new Set(
			[...files, entry]
				.map((file) => file.replaceAll("\\", "/").replace(/^\/+/, "").trim())
				.filter(Boolean)
		);
		const folders = new Set<string>();

		for (const file of normalizedFiles) {
			const parts = file.split("/").filter(Boolean);
			for (let index = 1; index < parts.length; index += 1) {
				folders.add(parts.slice(0, index).join("/"));
			}
		}

		return [
			...Array.from(folders, (path) => ({ path, kind: "folder" as const })),
			...Array.from(normalizedFiles, (path) => ({ path, kind: "file" as const }))
		]
			.sort((left, right) => {
				const leftParts = left.path.split("/");
				const rightParts = right.path.split("/");
				const shared = Math.min(leftParts.length, rightParts.length);

				for (let index = 0; index < shared; index += 1) {
					if (leftParts[index] !== rightParts[index]) {
						return leftParts[index].localeCompare(rightParts[index]);
					}
				}

				if (leftParts.length !== rightParts.length) return leftParts.length - rightParts.length;
				if (left.kind !== right.kind) return left.kind === "folder" ? -1 : 1;
				return 0;
			})
			.map(({ path, kind }) => {
				const parts = path.split("/");
				return {
					path,
					kind,
					name: parts.at(-1) ?? path,
					depth: Math.max(parts.length - 1, 0),
					isEntry: kind === "file" && path === entry
				};
			});
	}

	const repository = $derived(githubDetails(listing.repository));
	const authorHref = $derived(listing.author.url ?? repository?.ownerHref);
	const authorLabel = $derived(repository?.ownerLabel ?? listing.author.name);
	const explorerRows = $derived(createExplorerRows(listing.files, listing.entry));
	const iconUrl = $derived(listing.assets.icon?.url);
	const formatDate = (value: string) =>
		new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
	const versions = $derived([
		{ version: listing.version, published_at: listing.updated_at, current: true },
		...(listing.history ?? []).map((entry) => ({ ...entry, current: false }))
	]);
	const installPath = $derived(`/api/plugins/${listing.slug}`);
	// Opens the desktop app, which shows its install preview for this slug.
	const deepLink = $derived(`maoloader://install/${encodeURIComponent(listing.slug)}`);

	// A custom-scheme link fails silently when the app is missing, so offer the download after a beat.
	let launchHint = $state(false);
	function launchApp() {
		launchHint = false;
		setTimeout(() => (launchHint = true), 1500);
	}

	function fallbackCopy(text: string) {
		const textarea = document.createElement("textarea");
		textarea.value = text;
		textarea.setAttribute("readonly", "");
		textarea.style.position = "fixed";
		textarea.style.left = "-9999px";
		document.body.appendChild(textarea);
		textarea.select();

		const copied = document.execCommand("copy");
		textarea.remove();

		if (!copied) {
			throw new Error("Copy command failed");
		}
	}

	async function copyInstallLink() {
		if (!browser) return;

		const installUrl = deepLink;

		try {
			if (navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(installUrl);
			} else {
				fallbackCopy(installUrl);
			}

			toast.success("Install link copied", {
				description: "Anyone with maoloader can open it to install this plugin."
			});
		} catch {
			toast.error("Could not copy link", {
				description: installUrl
			});
		}
	}
</script>

<svelte:head>
	<title>{listing.name} · maoloader</title>
	<meta name="description" content={listing.description} />
</svelte:head>

<a class="back-link" href="/">
	<ArrowLeftIcon />
	All plugins
</a>

<section class="detail-hero">
	<div class="detail-copy">
		{#if iconUrl}
			<img class="detail-icon" src={iconUrl} alt="" width="64" height="64" />
		{/if}
		<p class="eyebrow">{listing.kind}</p>
		<h1>{listing.name}</h1>
		<p>{listing.description}</p>
		<div class="tag-row pt-2">
			<Badge variant="secondary">reviewed</Badge>
			{#if listing.kind === "theme"}<Badge variant="secondary">theme</Badge>{/if}
			{#each listing.tags as tag}
				<Badge variant="outline">{tag}</Badge>
			{/each}
		</div>
	</div>
	<div class="install-card">
		<strong>v{listing.version}</strong>
		<span>Compatible with maoloader {listing.compatibility.maoloader}</span>
		<Button href={deepLink} onclick={launchApp}>
			<MonitorDownIcon />
			Install in maoloader
		</Button>
		<Button href={data.download_url} variant="outline">
			<DownloadIcon />
			Download .zip
		</Button>
		{#if typeof listing.downloads === "number"}
			<span class="install-meta">{listing.downloads.toLocaleString()} {listing.downloads === 1 ? "install" : "installs"}</span>
		{/if}
		<p class="install-hint" class:is-shown={launchHint} aria-live="polite">
			{#if launchHint}
				Nothing opened? <a href="/download">Get the maoloader app</a>, then try again.
			{:else}
				Needs the <a href="/download">maoloader app</a>.
			{/if}
		</p>
	</div>
</section>

{#if data.readme_html}
	<section class="readme-panel">
		<div class="article-heading">
			<BookOpenIcon />
			<h2>About</h2>
		</div>
		<!-- Rendered on the server with raw HTML escaped and unsafe links dropped. -->
		<div class="readme">{@html data.readme_html}</div>
	</section>
{/if}

{#if data.releases.length}
	<section class="readme-panel changelog-panel">
		<div class="article-heading">
			<SparklesIcon />
			<h2>What's new</h2>
		</div>
		{#each data.releases as release}
			<article class="release">
				<header>
					<strong>v{release.version}</strong>
					{#if release.version === listing.version}<Badge variant="secondary">current</Badge>{/if}
					{#if release.date}<span>{release.date}</span>{/if}
				</header>
				<!-- Rendered on the server with raw HTML escaped and unsafe links dropped. -->
				<div class="readme">{@html release.html}</div>
			</article>
		{/each}
	</section>
{/if}

<section class="detail-grid">
	<article>
		<div class="article-heading">
			<FileCodeIcon />
			<h2>Package</h2>
		</div>
		<dl>
			<div>
				<dt>Entry</dt>
				<dd>{listing.entry}</dd>
			</div>
			<div>
				<dt>Files</dt>
				<dd>
					<div class="file-explorer" aria-label="Package files">
						{#each explorerRows as row}
							{@const type = fileType(row.path, row.kind)}
							<div class:entry-file={row.isEntry} class="file-row" style={`--depth: ${row.depth}`}>
								<span class="file-icon" data-tone={type.tone} title={type.label}>
									<type.icon aria-hidden="true" />
								</span>
								<span class="file-name">{row.name}</span>
								<span class="file-path">{row.path}</span>
								{#if row.isEntry}
									<Badge>entry</Badge>
								{/if}
							</div>
						{/each}
					</div>
				</dd>
			</div>
			<div>
				<dt>Versions</dt>
				<dd>
					<ol class="version-list">
						{#each versions as entry}
							<li class:current={entry.current}>
								<strong>v{entry.version}</strong>
								<span>{formatDate(entry.published_at)}</span>
								{#if entry.current}<Badge variant="secondary">latest</Badge>{/if}
							</li>
						{/each}
					</ol>
				</dd>
			</div>
		</dl>
	</article>

	<article>
		<div class="article-heading">
			<ShieldCheckIcon />
			<h2>Publisher</h2>
		</div>
		<dl>
			<div>
				<dt>Author</dt>
				<dd>
					{#if authorHref}
						<a class="publisher-link" href={authorHref} target="_blank" rel="noreferrer">
							<UserIcon />
							<span>{listing.author.name}</span>
							{#if authorLabel !== listing.author.name}
								<small>@{authorLabel}</small>
							{/if}
							<ExternalLinkIcon />
						</a>
					{:else}
						<span class="publisher-link muted">
							<UserIcon />
							<span>{listing.author.name}</span>
						</span>
					{/if}
				</dd>
			</div>
			{#if listing.repository}
				<div>
					<dt>Repository</dt>
					<dd>
						<a class="publisher-link" href={repository?.href ?? listing.repository} target="_blank" rel="noreferrer">
							<LinkIcon />
							<span>{repository?.label ?? listing.repository}</span>
							<ExternalLinkIcon />
						</a>
					</dd>
				</div>
			{/if}
			{#if listing.homepage}
				<div>
					<dt>Homepage</dt>
					<dd>
						<a class="publisher-link" href={listing.homepage} target="_blank" rel="noreferrer">
							<ExternalLinkIcon />
							<span>{listing.homepage}</span>
						</a>
					</dd>
				</div>
			{/if}
		</dl>
	</article>
</section>

<section class="api-panel">
	<div>
		<p class="eyebrow">Share</p>
		<h2>Share or inspect</h2>
		<p>The install link opens maoloader straight to this plugin. The JSON is what the app reads.</p>
	</div>
	<div class="api-actions">
		<Button onclick={copyInstallLink}>
			<CopyIcon />
			Copy install link
		</Button>
		<Button href={installPath} variant="outline">
			<ExternalLinkIcon />
			JSON
		</Button>
	</div>
</section>
