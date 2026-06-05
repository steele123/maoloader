<script lang="ts">
	import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
	import BoxIcon from "@lucide/svelte/icons/box";
	import CheckCircleIcon from "@lucide/svelte/icons/check-circle";
	import DownloadIcon from "@lucide/svelte/icons/download";
	import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
	import PackageCheckIcon from "@lucide/svelte/icons/package-check";
	import PaletteIcon from "@lucide/svelte/icons/palette";
	import PlugIcon from "@lucide/svelte/icons/plug";
	import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
	import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";
	import SparklesIcon from "@lucide/svelte/icons/sparkles";
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import type { PageData } from "./$types";

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>maoloader</title>
	<meta
		name="description"
		content="maoloader is a desktop loader and plugin manager for League Client customization."
	/>
</svelte:head>

<section class="home-landing">
	<div class="home-landing-copy">
		<p class="eyebrow">League Client plugin loader</p>
		<h1>maoloader</h1>
		<p>
			A desktop app for activating the client runtime, installing reviewed plugins, and keeping
			your setup current from one place.
		</p>
		<div class="hero-actions">
			<Button href="/download" size="lg">
				<DownloadIcon />
				Download
			</Button>
			<Button href="/plugins" variant="outline" size="lg">
				<PlugIcon />
				Browse plugins
			</Button>
			<Button href="https://github.com/steele123/maoloader" variant="outline" size="lg">
				<ExternalLinkIcon />
				GitHub
			</Button>
		</div>
	</div>
	<div class="home-landing-panel">
		<div class="home-logo-stage">
			<img src="/maologo.png" alt="" />
		</div>
		<div class="release-strip">
			<span>Latest release</span>
			<strong>{data.release ? `v${data.release.version}` : "pending"}</strong>
			{#if data.release}
				<Button href="/download" variant="secondary" size="sm">Get installer</Button>
			{/if}
		</div>
	</div>
</section>

<section class="product-stats" aria-label="Project overview">
	<div>
		<PackageCheckIcon />
		<span>{data.listingCount} registry listings</span>
	</div>
	<div>
		<BoxIcon />
		<span>{data.pluginCount} plugins</span>
	</div>
	<div>
		<PaletteIcon />
		<span>{data.themeCount} themes</span>
	</div>
	<div>
		<DownloadIcon />
		<span>{data.totalDownloads} downloads tracked</span>
	</div>
</section>

<section class="feature-grid" aria-label="What maoloader does">
	<article>
		<div class="article-heading">
			<ShieldCheckIcon />
			<h2>Activate the runtime</h2>
		</div>
		<p>
			Configure activation, sync runtime assets, and see whether the client hook is ready from
			the desktop app.
		</p>
	</article>
	<article>
		<div class="article-heading">
			<PlugIcon />
			<h2>Install plugins</h2>
		</div>
		<p>
			Browse reviewed plugins from the store, install them into your plugin folder, and manage
			local enable states.
		</p>
	</article>
	<article>
		<div class="article-heading">
			<RefreshCwIcon />
			<h2>Update in place</h2>
		</div>
		<p>
			Release builds use signed Tauri updater artifacts, with downloads served from
			fs.maoloader.com.
		</p>
	</article>
	<article>
		<div class="article-heading">
			<SparklesIcon />
			<h2>Publish safely</h2>
		</div>
		<p>
			Submit GitHub repos or direct zip packages for review before they appear in the public
			registry.
		</p>
	</article>
</section>

<section class="homepage-band">
	<div>
		<p class="eyebrow">Registry</p>
		<h2>Featured plugins and themes</h2>
		<p>Start with reviewed listings, then paste install links into the desktop app or install from the built-in store.</p>
	</div>
	<Button href="/plugins" variant="outline">
		View registry
		<ArrowRightIcon />
	</Button>
</section>

<section class="featured-row" aria-label="Featured registry listings">
	{#each data.featured as item}
		<a class="featured-mini-card" href={`/plugins/${item.slug}`}>
			<div class="listing-icon" aria-hidden="true">
				{#if item.kind === "theme"}
					<PaletteIcon />
				{:else}
					<BoxIcon />
				{/if}
			</div>
			<div>
				<h3>{item.name}</h3>
				<p>{item.description}</p>
				<div class="tag-row">
					<Badge variant="secondary">{item.kind}</Badge>
					<Badge variant="outline">v{item.version}</Badge>
				</div>
			</div>
		</a>
	{:else}
		<article class="featured-mini-card">
			<div class="listing-icon" aria-hidden="true">
				<CheckCircleIcon />
			</div>
			<div>
				<h3>Registry opening soon</h3>
				<p>Approved plugins will appear here after the first listings are published.</p>
				<div class="tag-row">
					<Badge variant="outline">{data.tagCount} tags ready</Badge>
				</div>
			</div>
		</article>
	{/each}
</section>
