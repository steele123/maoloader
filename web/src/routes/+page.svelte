<script lang="ts">
	import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
	import BoxIcon from "@lucide/svelte/icons/box";
	import DownloadIcon from "@lucide/svelte/icons/download";
	import PackageCheckIcon from "@lucide/svelte/icons/package-check";
	import PaletteIcon from "@lucide/svelte/icons/palette";
	import SearchIcon from "@lucide/svelte/icons/search";
	import SparklesIcon from "@lucide/svelte/icons/sparkles";
	import TagsIcon from "@lucide/svelte/icons/tags";
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Label } from "$lib/components/ui/label";
	import type { PageData } from "./$types";

	let { data }: { data: PageData } = $props();

	const featured = $derived(data.items.filter((item) => item.featured));
	const pluginCount = $derived(data.items.filter((item) => item.kind === "plugin").length);
	const themeCount = $derived(data.items.filter((item) => item.kind === "theme").length);
	const totalDownloads = $derived(
		data.items.reduce((total, item) => total + (item.downloads ?? 0), 0)
	);
</script>

<svelte:head>
	<title>maoloader plugins</title>
	<meta
		name="description"
		content="Browse plugins and themes for maoloader, backed by Cloudflare D1 and R2."
	/>
</svelte:head>

<section class="hero">
	<div class="hero-copy">
		<p class="eyebrow">Plugin registry</p>
		<h1>Find plugins that are ready for maoloader.</h1>
		<p>
			Browse reviewed plugins and themes, open their manifests, or copy install links directly
			into the desktop app.
		</p>
		<div class="hero-actions">
			<Button href="/download">
				<DownloadIcon />
				Download app
			</Button>
			<Button href="/submit" variant="outline">
				<SparklesIcon />
				Submit plugin
			</Button>
			<Button href="#registry" variant="outline">
				<SearchIcon />
				Browse registry
			</Button>
		</div>
	</div>
	<div class="hero-visual" aria-label="Registry stats">
		<div class="hero-logo">
			<img src="/maologo.png" alt="MaoLoader" />
		</div>
		<div class="hero-stats">
			<span><strong>{pluginCount}</strong> plugins</span>
			<span><strong>{themeCount}</strong> themes</span>
			<span><strong>{featured.length}</strong> featured</span>
		</div>
	</div>
</section>

<section class="registry-summary" aria-label="Registry overview">
	<div>
		<PackageCheckIcon />
		<span>{data.items.length} listings</span>
	</div>
	<div>
		<TagsIcon />
		<span>{data.tags.length} searchable tags</span>
	</div>
	<div>
		<DownloadIcon />
		<span>{totalDownloads} downloads tracked</span>
	</div>
</section>

<section class="registry-section" id="registry">
	<div class="section-heading">
		<div>
			<p class="eyebrow">Library</p>
			<h2>Plugins and themes</h2>
		</div>
		<span>{data.items.length} results</span>
	</div>

	<form class="registry-toolbar" method="GET" aria-label="Filter registry">
		<Label class="search-field">
			<SearchIcon />
			<span>Search</span>
			<Input name="q" value={data.filters.query} placeholder="Search plugins and themes" />
		</Label>
		<Label>
			<span>Kind</span>
			<select name="kind">
				<option value="all" selected={data.filters.kind === "all"}>All</option>
				<option value="plugin" selected={data.filters.kind === "plugin"}>Plugins</option>
				<option value="theme" selected={data.filters.kind === "theme"}>Themes</option>
			</select>
		</Label>
		<Label>
			<span>Tag</span>
			<select name="tag">
				<option value="" selected={!data.filters.tag}>Any tag</option>
				{#each data.tags as tag}
					<option value={tag} selected={data.filters.tag === tag}>{tag}</option>
				{/each}
			</select>
		</Label>
		<Button type="submit">Filter</Button>
	</form>

	<div class="listing-grid" aria-label="Registry listings">
		{#each data.items as item}
			<a class:featured-card={item.featured} class="listing-card" href={`/plugins/${item.slug}`}>
				<div class="listing-icon" aria-hidden="true">
					{#if item.kind === "theme"}
						<PaletteIcon />
					{:else}
						<BoxIcon />
					{/if}
				</div>
				<div class="listing-body">
					<div class="listing-title">
						<h3>{item.name}</h3>
						<Badge variant={item.featured ? "default" : "secondary"}>
							{item.featured ? "featured" : item.kind}
						</Badge>
					</div>
					<p>{item.description}</p>
					<div class="tag-row">
						{#each item.tags.slice(0, 4) as tag}
							<Badge variant="outline">{tag}</Badge>
						{/each}
					</div>
				</div>
				<div class="listing-meta">
					<span>v{item.version}</span>
					<span><DownloadIcon /> {item.downloads ?? 0}</span>
					<ArrowRightIcon />
				</div>
			</a>
		{:else}
			<p class="empty-state">No matching plugins or themes yet.</p>
		{/each}
	</div>
</section>
