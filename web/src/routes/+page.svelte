<script lang="ts">
	import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
	import BoxIcon from "@lucide/svelte/icons/box";
	import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
	import CodeIcon from "@lucide/svelte/icons/code";
	import DownloadIcon from "@lucide/svelte/icons/download";
	import MousePointerClickIcon from "@lucide/svelte/icons/mouse-pointer-click";
	import PaletteIcon from "@lucide/svelte/icons/palette";
	import PowerIcon from "@lucide/svelte/icons/power";
	import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
	import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import type { PageData } from "./$types";

	let { data }: { data: PageData } = $props();

	// The wall of icons around the logo; the middle 2x2 is the logo itself.
	const mosaic = [
		"auto-accept",
		"champ-select-tools",
		"chat-status",
		"client-declutter",
		"friend-alerts",
		"steeles-ui",
		"rune-presets",
		"loot-helper",
		"session-tracker",
		"lobby-tools",
		"plugin-health-overlay",
		"maoloader-devtools"
	];
	// Grid cells (row-major, 4x4) that are not covered by the logo.
	const cells = [0, 1, 2, 3, 4, 7, 8, 11, 12, 13, 14, 15];
	const faded = new Set([0, 3, 12, 15]);

	const features = [
		{
			icon: PowerIcon,
			title: "One switch",
			text: "Turn maoloader on and every plugin loads the next time the League client starts. Turn it off and the client is untouched."
		},
		{
			icon: MousePointerClickIcon,
			title: "One-click installs",
			text: "Hit Install in maoloader on any plugin page and the app opens straight to it. No folders, no copying files."
		},
		{
			icon: ShieldCheckIcon,
			title: "Reviewed plugins",
			text: "Everything in the store is checked by a person before it's listed, and you see what a plugin contains before you install it."
		},
		{
			icon: RefreshCwIcon,
			title: "Easy updates",
			text: "New versions install from inside the app with one click. No hunting for a new installer after a League patch."
		}
	];
</script>

<svelte:head>
	<title>maoloader · Plugins for the League client</title>
	<meta
		name="description"
		content="maoloader is a small desktop app that loads plugins and themes into the League of Legends client. Install reviewed plugins in one click."
	/>
</svelte:head>

<section class="home-hero">
	<div>
		<p class="eyebrow">League client plugin loader</p>
		<h1>Make the League client <span class="gold-text">yours.</span></h1>
		<p class="lede">
			maoloader is a small desktop app that loads plugins and themes into the League client.
			Auto-accept queues, clean up the home screen, save rune pages and more, with one click
			each.
		</p>
		<div class="hero-actions">
			<Button href="/download" size="lg">
				<DownloadIcon />
				{data.release ? `Download v${data.release.version}` : "Download"}
			</Button>
			<Button href="/plugins" variant="outline" size="lg">
				Browse plugins
				<ArrowRightIcon />
			</Button>
		</div>
		<p class="hero-note">
			<span><CircleCheckIcon />Free, source on GitHub</span>
			<span><CircleCheckIcon />Windows 10 and 11</span>
			{#if data.totalDownloads > 0}
				<span><CircleCheckIcon />{data.totalDownloads.toLocaleString()} plugin installs</span>
			{/if}
		</p>
	</div>

	<div class="icon-mosaic" aria-hidden="true">
		{#each cells as cell, index}
			<div
				class="mosaic-tile"
				class:is-faded={faded.has(cell)}
				style={`grid-row: ${Math.floor(cell / 4) + 1}; grid-column: ${(cell % 4) + 1}; --i: ${index}`}
			>
				<img src={`/plugin-icons/${mosaic[index]}.svg`} alt="" />
			</div>
		{/each}
		<div class="mosaic-center"><img src="/maologo.png" alt="" /></div>
	</div>
</section>

<section class="home-section" aria-labelledby="how-heading">
	<div class="section-heading">
		<div>
			<p class="eyebrow">How it works</p>
			<h2 id="how-heading">Up and running in a minute</h2>
		</div>
	</div>
	<ol class="step-grid">
		<li>
			<h3>Install the app</h3>
			<p>Download maoloader for Windows and run the installer.</p>
		</li>
		<li>
			<h3>Turn it on</h3>
			<p>Flip the switch in the app, then start (or restart) the League client.</p>
		</li>
		<li>
			<h3>Add plugins</h3>
			<p>Pick plugins from the store in the app or on this site. They're live on the next client start.</p>
		</li>
	</ol>
</section>

<section class="home-section" aria-labelledby="why-heading">
	<div class="section-heading">
		<div>
			<p class="eyebrow">Why maoloader</p>
			<h2 id="why-heading">Built to stay out of your way</h2>
		</div>
	</div>
	<div class="feature-grid">
		{#each features as feature}
			<article>
				<div class="icon-chip"><feature.icon /></div>
				<h3>{feature.title}</h3>
				<p>{feature.text}</p>
			</article>
		{/each}
	</div>
</section>

{#if data.highlights.length}
	<section class="home-section" aria-labelledby="plugins-heading">
		<div class="section-heading">
			<div>
				<p class="eyebrow">Plugins</p>
				<h2 id="plugins-heading">Popular right now</h2>
			</div>
			<Button href="/plugins" variant="outline">
				All {data.listingCount} plugins
				<ArrowRightIcon />
			</Button>
		</div>
		<div class="featured-row">
			{#each data.highlights as item}
				<a class="featured-mini-card" href={`/plugins/${item.slug}`}>
					<div class="listing-icon" class:has-icon={!!item.assets.icon?.url} aria-hidden="true">
						{#if item.assets.icon?.url}
							<img src={item.assets.icon.url} alt="" loading="lazy" />
						{:else if item.kind === "theme"}
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
			{/each}
		</div>
	</section>
{/if}

<section class="home-section cta-band" aria-labelledby="build-heading">
	<div>
		<p class="eyebrow">For creators</p>
		<h2 id="build-heading">Made a plugin? Share it.</h2>
		<p>
			Plugins are plain JavaScript. Drop your .zip on the submit page or point us at a GitHub repo,
			and it's in the store once it's reviewed.
		</p>
	</div>
	<div class="hero-actions">
		<Button href="/submit">Submit a plugin</Button>
		<Button href="/docs" variant="outline">
			<CodeIcon />
			Read the docs
		</Button>
	</div>
</section>
