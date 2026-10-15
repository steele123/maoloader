<script lang="ts">
	import DownloadIcon from "@lucide/svelte/icons/download";
	import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
	import MonitorIcon from "@lucide/svelte/icons/monitor";
	import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
	import ShieldAlertIcon from "@lucide/svelte/icons/shield-alert";
	import { Button } from "$lib/components/ui/button";
	import type { PageData } from "./$types";

	let { data }: { data: PageData } = $props();
	const release = $derived(data.release);

	const formatSize = (bytes?: number) => (bytes ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : undefined);
	const formatDate = (value?: string) =>
		value ? new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : undefined;
	const facts = $derived(
		release
			? [formatDate(release.pub_date), formatSize(release.platform.size), "Windows 10/11, 64-bit"].filter(Boolean)
			: []
	);
</script>

<svelte:head>
	<title>Download maoloader</title>
	<meta name="description" content="Download the latest maoloader desktop app for Windows." />
</svelte:head>

<section class="download-hero">
	<div>
		<p class="eyebrow">Desktop app</p>
		<h1>Download <span class="gold-text">maoloader</span></h1>
		<p class="lede">
			Install the app, turn it on, and restart the League client. Your plugins load every time
			the client starts from then on.
		</p>
		<div class="hero-actions">
			<Button href="/plugins" variant="outline" size="lg">Browse plugins first</Button>
			<Button href="https://github.com/steele123/maoloader" variant="outline" size="lg" target="_blank" rel="noreferrer">
				<ExternalLinkIcon />
				Source on GitHub
			</Button>
		</div>
	</div>

	<div class="download-card">
		<div class="download-mark"><img src="/maologo.png" alt="" /></div>
		{#if release}
			<strong>v{release.version}</strong>
			<span>{facts.join(" · ")}</span>
			<Button href={release.platform.installer_url || release.platform.url} size="lg">
				<DownloadIcon />
				Download for Windows
			</Button>
			{#if release.platform.installer_name}
				<span>{release.platform.installer_name}</span>
			{/if}
		{:else}
			<strong>Coming soon</strong>
			<span>The installer shows up here as soon as the first build is published.</span>
			<Button disabled size="lg">
				<DownloadIcon />
				No release yet
			</Button>
		{/if}
	</div>
</section>

<section class="download-grid" aria-label="Before you install">
	<article>
		<div class="icon-chip"><MonitorIcon /></div>
		<h3>What you need</h3>
		<p>
			Windows 10 or 11 and the League of Legends client. maoloader also needs Microsoft
			WebView2; the app tells you if it's missing.
		</p>
	</article>
	<article>
		<div class="icon-chip"><ShieldAlertIcon /></div>
		<h3>"Windows protected your PC"</h3>
		<p>
			maoloader isn't code-signed yet, so SmartScreen may warn you. Click
			<strong>More info</strong>, then <strong>Run anyway</strong>.
		</p>
	</article>
	<article>
		<div class="icon-chip"><RefreshCwIcon /></div>
		<h3>Updates</h3>
		<p>
			Once installed, new versions come from inside the app. Click the version tile on its Home
			page to check for updates.
		</p>
	</article>
</section>

{#if release?.notes}
	<section class="home-section surface release-notes">
		<p class="eyebrow">What's new in v{release.version}</p>
		<p>{release.notes}</p>
	</section>
{/if}
