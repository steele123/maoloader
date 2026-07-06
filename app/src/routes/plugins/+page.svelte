<script lang="ts">
	import { getContext, onMount } from "svelte";
	import { APP_STATE_KEY, type AppState } from "$lib/app-state.svelte";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { Button } from "$lib/components/ui/button/index.js";

	const appState = getContext<AppState>(APP_STATE_KEY);
	const registryWebsite = import.meta.env.DEV ? "http://localhost:5173" : "https://maoloader.com";
	type StoreFilter = "all" | "plugin" | "theme";
	let storeSearch = $state("");
	let storeFilter: StoreFilter = $state("all");
	let previewSlug = $state("");
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
	const previewPlugin = $derived(
		appState.storePlugins.find((plugin) => (plugin.slug || plugin.name) === previewSlug)
	);
	const rendererLoads = $derived(appState.nativeCore?.renderer_preload_executes ?? 0);
	const pluginAssetResolves = $derived(appState.nativeCore?.plugins_asset_resolves ?? 0);
	const pluginSchemeCreates = $derived(appState.nativeCore?.plugins_scheme_creates ?? 0);

	onMount(() => {
		if (!appState.storePlugins.length && !appState.storeState) {
			appState.loadPluginStore();
		}
	});

	async function confirmInstall() {
		if (!previewPlugin) return;
		const plugin = previewPlugin;
		previewSlug = "";
		await appState.installStorePlugin(plugin);
	}
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

<section class="plugin-diagnostics" aria-label="Plugin diagnostics">
	<div class="settings-heading">
		<div>
			<h2>Load Report</h2>
			<p>Renderer and asset counters from the injected runtime.</p>
		</div>
		<div class="section-actions">
			<Button variant="outline" onclick={() => appState.syncRuntime()}>Refresh</Button>
			<Button onclick={() => appState.createDiagnosticsBundle()}>Export</Button>
		</div>
	</div>

	<div class="diagnostic-grid">
		<div>
			<span>Renderer preloads</span>
			<strong>{rendererLoads}</strong>
		</div>
		<div>
			<span>Plugin requests</span>
			<strong>{pluginSchemeCreates}</strong>
		</div>
		<div>
			<span>Assets resolved</span>
			<strong>{pluginAssetResolves}</strong>
		</div>
	</div>

	{#if appState.diagnosticsMessage}
		<p class="diagnostics-message">{appState.diagnosticsMessage}</p>
	{/if}
	<p class="diagnostics-hint">
		In-client plugin reports are also exposed as <code>window.__maoloaderPluginReports</code>,
		<code>window.__maoloaderPluginLogs</code>, and
		<code>window.__maoloaderResetPluginSafeMode()</code> in DevTools.
	</p>
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

					<div class="trust-badges" aria-label="Trust signals">
						<Badge variant="secondary">Manifest valid</Badge>
						{#if plugin.download_url}<Badge variant="outline">Mirrored</Badge>{/if}
						{#if plugin.repo}<Badge variant="outline">Repository</Badge>{/if}
						{#if plugin.auto_update}<Badge variant="outline">Auto update</Badge>{/if}
					</div>

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
								onclick={() => (previewSlug = plugin.slug || plugin.name)}
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

{#if previewPlugin}
	<div class="install-preview" role="dialog" aria-modal="true" aria-label="Install preview">
		<div class="install-preview-panel">
			<div class="settings-heading">
				<div>
					<h2>Install {previewPlugin.name}</h2>
					<p>{previewPlugin.description || "No description provided."}</p>
				</div>
				<Badge variant="secondary">{previewPlugin.kind}</Badge>
			</div>
			<div class="preview-grid">
				<div>
					<span>Version</span>
					<strong>v{previewPlugin.version}</strong>
				</div>
				<div>
					<span>Author</span>
					<strong>{previewPlugin.author || "Unknown"}</strong>
				</div>
				<div>
					<span>Source</span>
					<strong>{previewPlugin.repo ? "GitHub + mirror" : "maoloader mirror"}</strong>
				</div>
			</div>
			<div class="trust-badges">
				<Badge variant="secondary">Manifest valid</Badge>
				{#if previewPlugin.download_url}<Badge variant="outline">Mirrored package</Badge>{/if}
				{#if previewPlugin.repo}<Badge variant="outline">Repository linked</Badge>{/if}
			</div>
			<div class="preview-actions">
				<Button variant="outline" onclick={() => (previewSlug = "")}>Cancel</Button>
				<Button onclick={confirmInstall}>Install</Button>
			</div>
		</div>
	</div>
{/if}
