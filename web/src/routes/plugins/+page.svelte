<script lang="ts">
	import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
	import BoxIcon from "@lucide/svelte/icons/box";
	import DownloadIcon from "@lucide/svelte/icons/download";
	import PaletteIcon from "@lucide/svelte/icons/palette";
	import SearchIcon from "@lucide/svelte/icons/search";
	import UploadIcon from "@lucide/svelte/icons/upload";
	import UserIcon from "@lucide/svelte/icons/user";
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import type { PageData } from "./$types";

	let { data }: { data: PageData } = $props();

	const kinds = [
		{ value: "all", label: "All" },
		{ value: "plugin", label: "Plugins" },
		{ value: "theme", label: "Themes" }
	] as const;

	// Keeps the search and tag when switching between plugins and themes.
	function kindHref(kind: string) {
		const params = new URLSearchParams();
		if (kind !== "all") params.set("kind", kind);
		if (data.filters.query) params.set("q", data.filters.query);
		if (data.filters.tag) params.set("tag", data.filters.tag);
		const query = params.toString();
		return query ? `/plugins?${query}` : "/plugins";
	}

	const filtered = $derived(Boolean(data.filters.query || data.filters.tag || data.filters.kind !== "all"));
</script>

<svelte:head>
	<title>Plugins and themes · maoloader</title>
	<meta name="description" content="Browse reviewed plugins and themes for the League client, and install them with maoloader." />
</svelte:head>

<section class="page-hero">
	<div>
		<p class="eyebrow">Plugin store</p>
		<h1>Plugins and themes</h1>
		<p>Every listing is reviewed before it goes live. Open one to see what it does and install it in one click.</p>
	</div>
	<div class="page-hero-actions">
		<Button href="/submit" variant="outline">
			<UploadIcon />
			Submit yours
		</Button>
	</div>
</section>

<form class="registry-toolbar" method="GET" aria-label="Filter plugins">
	<label class="search-field">
		<SearchIcon />
		<input name="q" value={data.filters.query} placeholder="Search by name, author or tag" aria-label="Search" />
	</label>
	<nav class="kind-filter" aria-label="Type">
		{#each kinds as kind}
			<a href={kindHref(kind.value)} class:active={data.filters.kind === kind.value}>{kind.label}</a>
		{/each}
	</nav>
	{#if data.filters.kind !== "all"}<input type="hidden" name="kind" value={data.filters.kind} />{/if}
	<select name="tag" aria-label="Tag" onchange={(event) => event.currentTarget.form?.requestSubmit()}>
		<option value="" selected={!data.filters.tag}>Any tag</option>
		{#each data.tags as tag}
			<option value={tag} selected={data.filters.tag === tag}>{tag}</option>
		{/each}
	</select>
	<Button type="submit" variant="secondary">Search</Button>
</form>

<p class="result-count">
	{data.items.length}
	{data.items.length === 1 ? "result" : "results"}
	{#if filtered}· <a href="/plugins">Clear filters</a>{/if}
</p>

<div class="listing-grid" aria-label="Plugins and themes">
	{#each data.items as item}
		<a class:featured-card={item.featured} class="listing-card" href={`/plugins/${item.slug}`}>
			<div class="listing-icon" class:has-icon={!!item.assets.icon?.url} aria-hidden="true">
				{#if item.assets.icon?.url}
					<img src={item.assets.icon.url} alt="" loading="lazy" />
				{:else if item.kind === "theme"}
					<PaletteIcon />
				{:else}
					<BoxIcon />
				{/if}
			</div>
			<div class="listing-body">
				<div class="listing-title">
					<h3>{item.name}</h3>
					{#if item.featured}<Badge>featured</Badge>{/if}
					{#if item.kind === "theme"}<Badge variant="secondary">theme</Badge>{/if}
				</div>
				<p>{item.description}</p>
				<div class="tag-row">
					{#each item.tags.slice(0, 4) as tag}
						<Badge variant="outline">{tag}</Badge>
					{/each}
				</div>
			</div>
			<div class="listing-meta">
				<span><UserIcon />{item.author.name}</span>
				<span>v{item.version}</span>
				<span><DownloadIcon />{(item.downloads ?? 0).toLocaleString()}</span>
				<ArrowRightIcon />
			</div>
		</a>
	{:else}
		<div class="empty-panel">
			<strong>{filtered ? "Nothing matches that search" : "No plugins yet"}</strong>
			<span>
				{filtered
					? "Try a different word or clear the filters."
					: "Be the first: submit a plugin and it shows up here once it's reviewed."}
			</span>
		</div>
	{/each}
</div>
