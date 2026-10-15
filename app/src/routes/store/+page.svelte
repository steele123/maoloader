<script lang="ts">
	import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
	import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
	import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
	import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
	import SearchIcon from "@lucide/svelte/icons/search";
	import StoreIcon from "@lucide/svelte/icons/store";
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { getContext, onMount } from "svelte";
	import { APP_STATE_KEY, type AppState, type StorePlugin } from "$lib/app-state.svelte";
	import { Button } from "$lib/components/ui/button/index.js";

	const app = getContext<AppState>(APP_STATE_KEY);
	const registryWebsite = import.meta.env.DEV ? "http://localhost:5173" : "https://maoloader.com";

	type StoreFilter = "all" | "plugin" | "theme";
	let search = $state("");
	let filter: StoreFilter = $state("all");
	let previewKey = $state("");

	const key = (plugin: StorePlugin) => plugin.slug || plugin.name;
	const shown = $derived(
		app.storePlugins.filter((plugin) => {
			if (filter !== "all" && plugin.kind !== filter) return false;
			const query = search.trim().toLowerCase();
			return (
				!query ||
				[plugin.name, plugin.slug, plugin.description, plugin.author, plugin.kind, ...plugin.tags].join(" ").toLowerCase().includes(query)
			);
		}),
	);
	const preview = $derived(app.storePlugins.find((plugin) => key(plugin) === previewKey));
	const loading = $derived(app.storeState === "Loading plugin registry...");

	// A maoloader://install/<slug> link from the website lands here as ?install=<slug>.
	let pendingInstall = $state("");
	let refreshedForLink = $state(false);
	let linkNotice = $state("");

	$effect(() => {
		const slug = page.url.searchParams.get("install");
		if (!slug) return;
		pendingInstall = slug;
		refreshedForLink = false;
		linkNotice = "";
		void goto("/store", { replaceState: true, keepFocus: true, noScroll: true });
	});

	$effect(() => {
		if (!pendingInstall || loading) return;
		const match = app.storePlugins.find((plugin) => plugin.slug === pendingInstall);
		if (match) {
			pendingInstall = "";
			if (match.installed) linkNotice = `${match.name} is already installed.`;
			else previewKey = key(match);
		} else if (!refreshedForLink) {
			// It may be newer than the list we have.
			refreshedForLink = true;
			void app.loadPluginStore();
		} else {
			linkNotice = `Couldn't find "${pendingInstall}" in the store. It may have been removed.`;
			pendingInstall = "";
		}
	});

	onMount(() => {
		if (!app.storePlugins.length && !app.storeState) {
			app.loadPluginStore();
		}
	});

	function busy(plugin: StorePlugin) {
		const value = app.installStates[key(plugin)];
		return value === "Installing..." || value === "Uninstalling...";
	}

	async function confirmInstall() {
		if (!preview) return;
		const plugin = preview;
		previewKey = "";
		await app.installStorePlugin(plugin);
	}
</script>

<header class="page-header">
	<div>
		<h1>Store</h1>
		<p>{app.storePlugins.length ? `${app.storePlugins.length} plugins and themes` : "Plugins and themes from maoloader.com"}</p>
	</div>
	<div class="page-tools">
		<label class="search">
			<SearchIcon />
			<input bind:value={search} type="search" placeholder="Search the store" aria-label="Search the store" />
		</label>
		<button class="icon-button" type="button" aria-label="Refresh the store" title="Refresh" onclick={() => app.loadPluginStore()}>
			<RefreshCwIcon class={loading ? "spin" : ""} />
		</button>
		<button class="icon-button" type="button" aria-label="Open maoloader.com" title="Open maoloader.com" onclick={() => app.openExternal(registryWebsite)}>
			<ExternalLinkIcon />
		</button>
	</div>
</header>

<div class="page-header" style="margin-bottom: 10px">
	<div class="segmented" role="group" aria-label="Show">
		<button type="button" aria-pressed={filter === "all"} onclick={() => (filter = "all")}>All</button>
		<button type="button" aria-pressed={filter === "plugin"} onclick={() => (filter = "plugin")}>Plugins</button>
		<button type="button" aria-pressed={filter === "theme"} onclick={() => (filter = "theme")}>Themes</button>
	</div>
</div>

{#if linkNotice}
	<p class="notice" role="status">{linkNotice}</p>
{/if}

{#if loading && !app.storePlugins.length}
	<div class="panel empty">
		<LoaderCircleIcon class="spin" />
		<strong>Loading the store…</strong>
	</div>
{:else if !app.storePlugins.length}
	<div class="panel empty">
		<StoreIcon />
		<strong>The store is empty right now</strong>
		<span>{app.storeState || "Try refreshing in a moment."}</span>
	</div>
{:else if shown.length === 0}
	<div class="panel empty">
		<SearchIcon />
		<strong>Nothing matches</strong>
		<span>Try another search or filter.</span>
	</div>
{:else}
	<div class="store-grid">
		{#each shown as plugin (key(plugin))}
			<article class="panel store-card" class:is-installed={plugin.installed}>
				<header>
					<div class="plugin-avatar" class:is-theme={plugin.kind === "theme"} aria-hidden="true">
						{#if plugin.image}
							<img src={plugin.image} alt="" />
						{:else}
							{plugin.name.slice(0, 1)}
						{/if}
					</div>
					<div style="min-width: 0">
						<h3>{plugin.name}</h3>
						<small>{plugin.author ? `by ${plugin.author} · ` : ""}v{plugin.version}</small>
					</div>
				</header>

				<p>{plugin.description || "No description provided."}</p>

				<footer>
					<div class="tags">
						{#if plugin.kind === "theme"}<span class="kind-tag">Theme</span>{/if}
						{#each plugin.tags.filter((tag) => tag !== plugin.kind).slice(0, 3) as tag}<span class="tag">{tag}</span>{/each}
					</div>
					<div class="page-tools">
						{#if plugin.repo}
							<button class="icon-button" type="button" aria-label={`Open ${plugin.name}'s repository`} title="Repository" onclick={() => app.openExternal(plugin.repo)}>
								<ExternalLinkIcon />
							</button>
						{/if}
						{#if plugin.installed}
							<span class="installed-pill"><CircleCheckIcon />Installed</span>
							{#if plugin.installed_repo}
								<Button variant="outline" size="sm" disabled={busy(plugin)} onclick={() => app.uninstallStorePlugin(plugin)}>
									{app.installStates[key(plugin)] === "Uninstalling..." ? "Removing…" : "Remove"}
								</Button>
							{/if}
						{:else}
							<Button size="sm" disabled={busy(plugin)} onclick={() => (previewKey = key(plugin))}>
								{app.installStates[key(plugin)] === "Installing..." ? "Installing…" : "Install"}
							</Button>
						{/if}
					</div>
				</footer>

				{#if app.installStates[key(plugin)] && !busy(plugin)}
					<small class="muted">{app.installStates[key(plugin)]}</small>
				{/if}
			</article>
		{/each}
	</div>
{/if}

{#if preview}
	<div class="modal-backdrop" role="presentation" onclick={(event) => event.target === event.currentTarget && (previewKey = "")}>
		<div class="panel modal" role="dialog" aria-modal="true" aria-label={`Install ${preview.name}`}>
			<p class="eyebrow">Install {preview.kind}</p>
			<h2>{preview.name}</h2>
			<p class="muted" style="margin: 6px 0 0">{preview.description || "No description provided."}</p>
			<div class="modal-facts">
				<div><span>Version</span><strong>v{preview.version}</strong></div>
				<div><span>Author</span><strong>{preview.author || "Unknown"}</strong></div>
				<div><span>Source</span><strong>{preview.repo ? "GitHub + mirror" : "maoloader mirror"}</strong></div>
			</div>
			<p class="muted" style="margin: 0; font-size: 12px">Plugins run inside your League client. Only install ones you trust.</p>
			<div class="modal-actions">
				<Button variant="outline" onclick={() => (previewKey = "")}>Cancel</Button>
				<Button onclick={confirmInstall}>Install</Button>
			</div>
		</div>
	</div>
{/if}
