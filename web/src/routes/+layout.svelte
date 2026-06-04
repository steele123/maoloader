<script lang="ts">
	import './layout.css';

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href="/maologo-icon.png" /></svelte:head>
<div class="site-shell">
	<header class="site-header">
		<a class="brand" href="/">
			<span class="brand-mark"><img src="/maologo-icon.png" alt="" /></span>
			<span>maoloader</span>
		</a>
		<nav aria-label="Primary">
			<a href="/">Registry</a>
			<a href="/submit">Submit</a>
			<a href="/api/plugins">API</a>
			<a href="/admin">Admin</a>
			<a href="https://github.com/steele123/maoloader">GitHub</a>
		</nav>
	</header>

	<main>
		{@render children()}
	</main>
</div>
