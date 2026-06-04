<script lang="ts">
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import DownloadIcon from "@lucide/svelte/icons/download";
	import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
	import FileCodeIcon from "@lucide/svelte/icons/file-code";
	import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";
	import type { PageData } from "./$types";

	let { data }: { data: PageData } = $props();
	const listing = $derived(data.listing);
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
		<div class="tag-row">
			{#each listing.tags as tag}
				<span>{tag}</span>
			{/each}
		</div>
	</div>
	<div class="install-card">
		<strong>v{listing.version}</strong>
		<span>Compatible with maoloader {listing.compatibility.maoloader}</span>
		<a class="primary-action" href={data.download_url}>
			<DownloadIcon />
			Download package
		</a>
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
				<dd>{listing.files.join(", ")}</dd>
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
				<dd>{listing.author.name}</dd>
			</div>
			{#if listing.repository}
				<div>
					<dt>Repository</dt>
					<dd><a href={listing.repository}>{listing.repository}</a></dd>
				</div>
			{/if}
			{#if listing.homepage}
				<div>
					<dt>Homepage</dt>
					<dd><a href={listing.homepage}>{listing.homepage}</a></dd>
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
	<a href={`/api/plugins/${listing.slug}`}>
		<ExternalLinkIcon />
		JSON
	</a>
</section>
