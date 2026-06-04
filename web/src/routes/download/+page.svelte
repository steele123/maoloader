<script lang="ts">
	import AlertCircleIcon from "@lucide/svelte/icons/alert-circle";
	import BadgeCheckIcon from "@lucide/svelte/icons/badge-check";
	import DownloadIcon from "@lucide/svelte/icons/download";
	import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
	import FileArchiveIcon from "@lucide/svelte/icons/file-archive";
	import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import type { PageData } from "./$types";

	let { data }: { data: PageData } = $props();
	const release = $derived(data.release);
</script>

<svelte:head>
	<title>Download maoloader</title>
	<meta
		name="description"
		content="Download the latest maoloader desktop installer for Windows."
	/>
</svelte:head>

<section class="download-hero">
	<div>
		<p class="eyebrow">Desktop app</p>
		<h1>Download maoloader.</h1>
		<p>
			Install the desktop app, activate the runtime, and manage reviewed plugins from the
			built-in store.
		</p>
		<div class="hero-actions">
			{#if release}
				<Button href={release.platform.installer_url || release.platform.url} size="lg">
					<DownloadIcon />
					Download for Windows
				</Button>
			{:else}
				<Button disabled size="lg">
					<DownloadIcon />
					No release yet
				</Button>
			{/if}
			<Button href="https://github.com/steele123/maoloader" variant="outline" size="lg">
				<ExternalLinkIcon />
				View source
			</Button>
		</div>
	</div>
	<div class="download-card">
		<div class="download-mark">
			<img src="/maologo.png" alt="" />
		</div>
		{#if release}
			<strong>v{release.version}</strong>
			<span>{release.platform.installer_name || "maoloader installer"}</span>
			<Badge variant="secondary">{release.platform_key}</Badge>
		{:else}
			<strong>Release pending</strong>
			<span>The installer will appear here after the first published build.</span>
		{/if}
	</div>
</section>

<section class="download-grid" aria-label="Distribution details">
	<article>
		<div class="article-heading">
			<FileArchiveIcon />
			<h2>Installer</h2>
		</div>
		<p>
			The website serves the Windows installer from Cloudflare R2. Future platforms can be
			added by publishing another artifact into the same release manifest.
		</p>
	</article>
	<article>
		<div class="article-heading">
			<ShieldCheckIcon />
			<h2>Updates</h2>
		</div>
		<p>
			Release builds generate Tauri updater artifacts and signatures. The app checks the
			website release endpoint once the updater public key is configured.
		</p>
	</article>
	<article>
		<div class="article-heading">
			<BadgeCheckIcon />
			<h2>Current version</h2>
		</div>
		<p>{release ? `Latest published version is v${release.version}.` : "No build has been published yet."}</p>
	</article>
	<article>
		<div class="article-heading">
			<AlertCircleIcon />
			<h2>Signing</h2>
		</div>
		<p>
			Windows may still show reputation warnings until maoloader is code-signed with a trusted
			certificate and enough users have installed it.
		</p>
	</article>
</section>
