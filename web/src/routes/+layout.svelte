<script lang="ts">
	import { page } from "$app/state";
	import DownloadIcon from "@lucide/svelte/icons/download";
	import { Toaster } from "$lib/components/ui/sonner";
	import { DISCORD_URL } from "$lib/links";
	import './layout.css';

	let { children } = $props();
	const pathname = $derived(page.url.pathname);

	const nav = [
		{ href: "/plugins", label: "Plugins" },
		{ href: "/docs", label: "Docs" },
		{ href: "/changelog", label: "Changelog" },
		{ href: "/submit", label: "Submit" }
	];
</script>

<svelte:head><link rel="icon" href="/maologo-icon.png" /></svelte:head>

<div class="site-shell">
	<header class="site-header">
		<a class="brand" href="/" aria-label="maoloader home">
			<span class="brand-mark" aria-hidden="true"><img src="/maologo.png" alt="" /></span>
			<strong>maoloader</strong>
		</a>
		<nav aria-label="Primary">
			{#each nav as item}
				<a class:active={pathname.startsWith(item.href)} href={item.href}>{item.label}</a>
			{/each}
			<a class="nav-external" href="https://github.com/steele123/maoloader" target="_blank" rel="noreferrer">GitHub</a>
			{#if DISCORD_URL}
				<a class="nav-external" href={DISCORD_URL} target="_blank" rel="noreferrer">Discord</a>
			{/if}
		</nav>
		<a class="header-cta" class:active={pathname.startsWith("/download")} href="/download">
			<DownloadIcon />
			<span>Download</span>
		</a>
	</header>

	<main>
		{@render children()}
	</main>

	<footer class="site-footer">
		<div class="footer-brand">
			<a class="brand" href="/">
				<span class="brand-mark" aria-hidden="true"><img src="/maologo.png" alt="" /></span>
				<strong>maoloader</strong>
			</a>
			<p>Plugins and themes for the League of Legends client, in one small desktop app.</p>
		</div>
		<nav class="footer-links" aria-label="Footer">
			<div>
				<strong>Get started</strong>
				<a href="/download">Download</a>
				<a href="/plugins">Browse plugins</a>
				<a href="/changelog">What's new</a>
			</div>
			<div>
				<strong>Build</strong>
				<a href="/docs">Plugin docs</a>
				<a href="/submit">Submit a plugin</a>
			</div>
			<div>
				<strong>Community</strong>
				<a href="https://github.com/steele123/maoloader" target="_blank" rel="noreferrer">GitHub</a>
				{#if DISCORD_URL}<a href={DISCORD_URL} target="_blank" rel="noreferrer">Discord</a>{/if}
			</div>
		</nav>
		<p class="footer-legal">
			maoloader isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games
			or anyone officially involved in producing or managing Riot Games properties. Riot Games and
			all associated properties are trademarks or registered trademarks of Riot Games, Inc.
		</p>
	</footer>
</div>

<Toaster position="bottom-right" theme="dark" richColors />
