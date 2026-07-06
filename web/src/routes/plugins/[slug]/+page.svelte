<script lang="ts">
	import { browser } from "$app/environment";
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import CopyIcon from "@lucide/svelte/icons/copy";
	import DownloadIcon from "@lucide/svelte/icons/download";
	import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
	import FileCodeIcon from "@lucide/svelte/icons/file-code";
	import FileIcon from "@lucide/svelte/icons/file";
	import FolderIcon from "@lucide/svelte/icons/folder";
	import LinkIcon from "@lucide/svelte/icons/link-2";
	import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";
	import UserIcon from "@lucide/svelte/icons/user";
	import { Badge } from "$lib/components/ui/badge";
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
	const installPath = $derived(`/api/plugins/${listing.slug}`);

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

		const installUrl = new URL(installPath, window.location.origin).toString();

		try {
			if (navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(installUrl);
			} else {
				fallbackCopy(installUrl);
			}

			toast.success("Install link copied", {
				description: "Paste it into the maoloader desktop app."
			});
		} catch {
			toast.error("Could not copy link", {
				description: installUrl
			});
		}
	}
</script>

<svelte:head>
	<title>{listing.name} - maoloader plugins</title>
	<meta name="description" content={listing.description} />
</svelte:head>

<a class="back-link" href="/">
	<ArrowLeftIcon />
	Registry
</a>

<section class="detail-hero">
	<div>
		<p class="eyebrow">{listing.kind}</p>
		<h1>{listing.name}</h1>
		<p>{listing.description}</p>
		<div class="tag-row pt-2">
			<Badge variant="secondary">reviewed</Badge>
			{#if listing.assets.package?.key}<Badge variant="outline">mirrored</Badge>{/if}
			{#if listing.repository}<Badge variant="outline">repository</Badge>{/if}
			{#each listing.tags as tag}
				<Badge variant="outline">{tag}</Badge>
			{/each}
		</div>
	</div>
	<div class="install-card">
		<strong>v{listing.version}</strong>
		<span>Compatible with maoloader {listing.compatibility.maoloader}</span>
		<Button href={data.download_url}>
			<DownloadIcon />
			Download package
		</Button>
	</div>
</section>

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
							<div class:entry-file={row.isEntry} class="file-row" style={`--depth: ${row.depth}`}>
								<span class="file-icon" aria-hidden="true">
									{#if row.kind === "folder"}
										<FolderIcon />
									{:else}
										<FileIcon />
									{/if}
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
				<dt>R2 key</dt>
				<dd>{listing.assets.package?.key ?? "not configured"}</dd>
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
		<p class="eyebrow">Registry API</p>
		<h2>Desktop install metadata</h2>
		<p>The app can read this endpoint to install or inspect the listing.</p>
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
