<script lang="ts">
	import { page } from "$app/state";
	import { Toaster } from "$lib/components/ui/sonner";
	import './layout.css';

	let { children } = $props();
	const pathname = $derived(page.url.pathname);
</script>

<svelte:head><link rel="icon" href="/maologo-icon.png" /></svelte:head>
<div class="site-shell">
	<header class="site-header">
		<a class="brand" href="/">
			<span class="brand-mark"><img src="/maologo-icon.png" alt="" /></span>
			<span>
				<strong>MaoLoader</strong>
				<small>Loader</small>
			</span>
		</a>
		<nav aria-label="Primary">
			<a class:active={pathname === "/"} href="/">Home</a>
			<a class:active={pathname.startsWith("/download")} href="/download">Download</a>
			<a class:active={pathname.startsWith("/plugins")} href="/plugins">Plugins</a>
			<a class:active={pathname.startsWith("/docs")} href="/docs">Docs</a>
			<a class:active={pathname.startsWith("/submit")} href="/submit">Submit</a>
			<a href="https://github.com/steele123/maoloader">GitHub</a>
		</nav>
	</header>

	<main>
		{@render children()}
	</main>
</div>

<Toaster position="bottom-right" richColors />
