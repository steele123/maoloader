<script lang="ts">
	import { getContext, onMount } from "svelte";
	import { APP_STATE_KEY, type AppState } from "$lib/app-state.svelte";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { Button } from "$lib/components/ui/button/index.js";

	const appState = getContext<AppState>(APP_STATE_KEY);
	const registryWebsite = import.meta.env.DEV ? "http://localhost:5173" : "https://maoloader.dev";
	type StoreFilter = "all" | "plugin" | "theme";
	let storeSearch = $state("");
	let storeFilter: StoreFilter = $state("all");
	const filteredStorePlugins = $derived(
		appState.storePlugins.filter((plugin) => {
			const kindMatches = storeFilter === "all" || plugin.kind === storeFilter;
			const query = storeSearch.trim().toLowerCase();
			if (!kindMatches) {
				return false;
			}
			if (!query) {
				return true;
			}
			return [
				plugin.name,
				plugin.slug,
				plugin.description,
				plugin.author,
				plugin.kind,
				plugin.version,
				...plugin.tags,
			]
				.join(" ")
				.toLowerCase()
				.includes(query);
		})
	);

	onMount(() => {
		if (!appState.storePlugins.length && !appState.storeState) {
			appState.loadPluginStore();
		}
	});
</script>

<section class="plugins" aria-label="Local plugins">
	<div class="settings-heading">
		<div>
			<h2>Local Plugins</h2>
			<p>{appState.plugins.length} discovered in your plugin directory.</p>
		</div>
		<div class="section-actions">
			<Button onclick={() => appState.openPluginsFolder()}>Open</Button>
		</div>
	</div>

	{#if appState.plugins.length > 0}
		<div class="plugin-list">
			{#each appState.plugins as plugin}
				<article class:disabled={!plugin.enabled}>
					<div class="plugin-main">
						<div class="plugin-title-row">
							<div>
								<h3>{plugin.description ? plugin.name : plugin.entry}</h3>
								{#if plugin.description}
									<p>{plugin.description}</p>
								{/if}
							</div>
							<Badge variant={plugin.enabled ? "secondary" : "outline"}>
								{plugin.enabled ? "Enabled" : "Disabled"}
							</Badge>
						</div>
						<div class="plugin-meta">
							<span>{plugin.kind}</span>
							<span>{plugin.entry}</span>
							{#if plugin.author}<span>{plugin.author}</span>{/if}
							{#if plugin.link}<span>{plugin.link}</span>{/if}
							<span>{plugin.hash}</span>
						</div>
					</div>
					<div class="plugin-actions">
						<Button variant="outline" size="sm" onclick={() => appState.reveal(plugin.path)}>Reveal</Button>
						<Button
							variant={plugin.enabled ? "outline" : "secondary"}
							size="sm"
							onclick={() => appState.setPluginEnabled(plugin, !plugin.enabled)}
						>
							{plugin.enabled ? "Disable" : "Enable"}
						</Button>
					</div>
				</article>
			{/each}
		</div>
	{:else}
		<div class="empty-panel">
			<strong>No local plugins found</strong>
			<p>Open the plugin folder and add a JavaScript plugin to get started.</p>
		</div>
	{/if}
</section>

<section class="plugin-store" aria-label="Plugin store">
	<div class="settings-heading">
		<div>
			<h2>Plugin Store</h2>
			<p>{appState.storePlugins.length} registry listings available.</p>
		</div>
		<div class="section-actions">
			<Button variant="outline" onclick={() => appState.loadPluginStore()}>Refresh</Button>
			<Button variant="outline" onclick={() => appState.openExternal(registryWebsite)}>
				Website
			</Button>
		</div>
	</div>

	{#if appState.storeState}
		<p class="store-state">{appState.storeState}</p>
	{/if}

	{#if appState.storePlugins.length > 0}
		<div class="store-filters" aria-label="Plugin store filters">
			<label>
				<span>Search</span>
				<input bind:value={storeSearch} type="search" placeholder="Search by name, author, or tag" />
			</label>
			<div class="store-filter-group" aria-label="Filter listing type">
				<Button
					variant={storeFilter === "all" ? "secondary" : "outline"}
					size="sm"
					onclick={() => (storeFilter = "all")}
				>
					All
				</Button>
				<Button
					variant={storeFilter === "plugin" ? "secondary" : "outline"}
					size="sm"
					onclick={() => (storeFilter = "plugin")}
				>
					Plugins
				</Button>
				<Button
					variant={storeFilter === "theme" ? "secondary" : "outline"}
					size="sm"
					onclick={() => (storeFilter = "theme")}
				>
					Themes
				</Button>
			</div>
		</div>

		{#if filteredStorePlugins.length === 0}
			<div class="empty-panel">
				<strong>No matching listings</strong>
				<p>Try a different search term or switch the plugin/theme filter.</p>
			</div>
		{:else}
		<div class="store-grid">
			{#each filteredStorePlugins as plugin}
				<article class:installed={plugin.installed}>
					<header class="store-card-header">
						<div class="store-icon" aria-hidden="true">
							{#if plugin.image}
								<img src={plugin.image} alt="" />
							{:else}
								<span>{plugin.name.slice(0, 1)}</span>
							{/if}
						</div>
						<div>
							<div class="store-kicker">
								<Badge variant={plugin.installed ? "secondary" : "outline"}>
									{plugin.installed ? "Installed" : plugin.kind}
								</Badge>
								<span>v{plugin.version}</span>
							</div>
							<h3>{plugin.name}</h3>
							{#if plugin.author}
								<small>by {plugin.author}</small>
							{/if}
						</div>
					</header>

					<p>{plugin.description || "No description provided."}</p>

					{#if appState.installStates[plugin.slug || plugin.name]}
						<p class="install-state">{appState.installStates[plugin.slug || plugin.name]}</p>
					{/if}

					<div class="store-card-footer">
						<div class="store-tags">
							<span>{plugin.kind}</span>
							{#if plugin.auto_update}<span>auto-update</span>{/if}
							{#each plugin.tags as tag}<span>{tag}</span>{/each}
						</div>
						<div class="store-actions">
							<Button
								size="sm"
								disabled={appState.installStates[plugin.slug || plugin.name] === "Installing..."}
								onclick={() => appState.installStorePlugin(plugin)}
							>
								{appState.installStates[plugin.slug || plugin.name] === "Installing..."
									? "Installing"
									: plugin.installed
										? "Reinstall"
										: "Install"}
							</Button>
							{#if plugin.installed && plugin.installed_repo}
								<Button
									variant="outline"
									size="sm"
									disabled={appState.installStates[plugin.slug || plugin.name] === "Uninstalling..."}
									onclick={() => appState.uninstallStorePlugin(plugin)}
								>
									{appState.installStates[plugin.slug || plugin.name] === "Uninstalling..."
										? "Removing"
										: "Uninstall"}
								</Button>
							{/if}
							{#if plugin.repo}
								<Button variant="outline" size="sm" onclick={() => appState.openExternal(plugin.repo)}>Repo</Button>
							{/if}
						</div>
					</div>

					{#if plugin.installed_entries.length > 0}
						<small class="installed-files">{plugin.installed_entries.join(", ")}</small>
					{/if}
				</article>
			{/each}
		</div>
		{/if}
	{:else}
		<div class="empty-panel">
			<strong>No registry plugins found</strong>
			<p>Refresh after approved plugins are available from the website registry.</p>
		</div>
	{/if}
</section>
