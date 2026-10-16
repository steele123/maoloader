<script lang="ts">
	import BoxIcon from "@lucide/svelte/icons/box";
	import DownloadIcon from "@lucide/svelte/icons/download";
	import { Button } from "$lib/components/ui/button";
	import type { PageData } from "./$types";

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Changelog · maoloader</title>
	<meta name="description" content="What's new in maoloader and its plugins." />
</svelte:head>

<section class="page-hero">
	<div>
		<p class="eyebrow">Changelog</p>
		<h1>What's new</h1>
		<p>Every maoloader release, plus the latest updates to plugins in the store.</p>
	</div>
	<div class="page-hero-actions">
		<Button href="/download"><DownloadIcon />Get the latest</Button>
	</div>
</section>

<div class="changelog-layout">
	<section class="readme-panel changelog-panel" aria-labelledby="app-heading">
		<div class="article-heading"><h2 id="app-heading">maoloader</h2></div>
		{#each data.releases as release, index}
			<article class="release" id={`v${release.version}`}>
				<header>
					<strong>v{release.version}</strong>
					{#if index === 0}<span class="latest-pill">Latest</span>{/if}
					{#if release.date}<span>{release.date}</span>{/if}
				</header>
				<!-- Rendered on the server with raw HTML escaped and unsafe links dropped. -->
				<div class="readme">{@html release.html}</div>
			</article>
		{/each}
	</section>

	<aside class="readme-panel changelog-panel" aria-labelledby="plugins-heading">
		<div class="article-heading"><h2 id="plugins-heading">Plugin updates</h2></div>
		{#each data.pluginUpdates as update}
			<article class="release plugin-update">
				<header>
					<a class="plugin-update-name" href={`/plugins/${update.slug}`}>
						<span class="listing-icon" class:has-icon={!!update.icon} aria-hidden="true">
							{#if update.icon}<img src={update.icon} alt="" loading="lazy" />{:else}<BoxIcon />{/if}
						</span>
						<strong>{update.name}</strong>
					</a>
					<span>v{update.version}{update.date ? ` · ${update.date}` : ""}</span>
				</header>
				<div class="readme">{@html update.html}</div>
			</article>
		{:else}
			<p class="muted">Plugin changelogs show up here once plugins include a CHANGELOG.md.</p>
		{/each}
	</aside>
</div>
