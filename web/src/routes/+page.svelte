<script lang="ts">
	import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
	import BoxIcon from "@lucide/svelte/icons/box";
	import DownloadIcon from "@lucide/svelte/icons/download";
	import PaletteIcon from "@lucide/svelte/icons/palette";
	import SearchIcon from "@lucide/svelte/icons/search";
	import type { PageData } from "./$types";

	let { data }: { data: PageData } = $props();

	const featured = $derived(data.items.filter((item) => item.featured));
	const pluginCount = $derived(data.items.filter((item) => item.kind === "plugin").length);
	const themeCount = $derived(data.items.filter((item) => item.kind === "theme").length);
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
		<h1>Plugins and themes for maoloader.</h1>
		<p>
			A public registry for client plugins, themes, package metadata, and install assets. The
			first seed entry is the example plugin used by the desktop app.
		</p>
	</div>
	<div class="hero-stats" aria-label="Registry stats">
		<span><strong>{pluginCount}</strong> plugins</span>
		<span><strong>{themeCount}</strong> themes</span>
		<span><strong>{data.tags.length}</strong> tags</span>
	</div>
</section>

<form class="registry-toolbar" method="GET" aria-label="Filter registry">
	<label class="search-field">
		<SearchIcon />
		<span>Search</span>
		<input name="q" value={data.filters.query} placeholder="Search plugins and themes" />
	</label>
	<label>
		<span>Kind</span>
		<select name="kind">
			<option value="all" selected={data.filters.kind === "all"}>All</option>
			<option value="plugin" selected={data.filters.kind === "plugin"}>Plugins</option>
			<option value="theme" selected={data.filters.kind === "theme"}>Themes</option>
		</select>
	</label>
	<label>
		<span>Tag</span>
		<select name="tag">
			<option value="" selected={!data.filters.tag}>Any tag</option>
			{#each data.tags as tag}
				<option value={tag} selected={data.filters.tag === tag}>{tag}</option>
			{/each}
		</select>
	</label>
	<button type="submit">Filter</button>
</form>

{#if featured.length > 0}
	<section class="section-heading">
		<div>
			<p class="eyebrow">Featured</p>
			<h2>Good starting points</h2>
		</div>
	</section>
{/if}

<section class="listing-grid" aria-label="Registry listings">
	{#each data.items as item}
		<a class="listing-card" href={`/plugins/${item.slug}`}>
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
					<span>{item.kind}</span>
				</div>
				<p>{item.description}</p>
				<div class="tag-row">
					{#each item.tags.slice(0, 4) as tag}
						<span>{tag}</span>
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
</section>
