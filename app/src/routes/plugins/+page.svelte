<script lang="ts">
	import { getContext } from "svelte";
	import { APP_STATE_KEY, type AppState } from "$lib/app-state.svelte";
	import { Button } from "$lib/components/ui/button/index.js";

	const state = getContext<AppState>(APP_STATE_KEY);
</script>

<section class="plugins" aria-label="Local plugins">
	<div class="settings-heading">
		<div>
			<h2>Local Plugins</h2>
			<p>JavaScript plugins discovered from the configured plugin directory.</p>
		</div>
		<div class="section-actions">
			<Button variant="outline" onclick={() => state.createSamplePlugin()}>Sample</Button>
			<Button onclick={() => state.openPluginsFolder()}>Open</Button>
		</div>
	</div>

	{#if state.plugins.length > 0}
		<div class="plugin-list">
			{#each state.plugins as plugin}
				<article class:disabled={!plugin.enabled}>
					<Button variant="outline" class="plugin-detail" onclick={() => state.reveal(plugin.path)}>
						<span>{plugin.enabled ? "Enabled" : "Disabled"} - {plugin.kind} - {plugin.hash}</span>
						<strong>{plugin.description ? plugin.name : plugin.entry}</strong>
						{#if plugin.description}
							<small>{plugin.description}</small>
						{/if}
						{#if plugin.author || plugin.link}
							<em>
								{#if plugin.author}{plugin.author}{/if}
								{#if plugin.author && plugin.link} - {/if}
								{#if plugin.link}{plugin.link}{/if}
							</em>
						{/if}
						{#if plugin.description}
							<small>{plugin.entry}</small>
						{/if}
					</Button>
					<Button
						variant={plugin.enabled ? "outline" : "secondary"}
						class="plugin-toggle"
						onclick={() => state.setPluginEnabled(plugin, !plugin.enabled)}
					>
						{plugin.enabled ? "Disable" : "Enable"}
					</Button>
				</article>
			{/each}
		</div>
	{:else}
		<p class="empty-state">No local plugins found yet.</p>
	{/if}
</section>

<section class="plugin-store" aria-label="Plugin store">
	<div class="settings-heading">
		<div>
			<h2>Plugin Store</h2>
			<p>Registry preview for compatible plugins.</p>
		</div>
		<div class="section-actions">
			<Button variant="outline" onclick={() => state.loadPluginStore()}>Refresh</Button>
			<Button variant="outline" onclick={() => state.openExternal("https://github.com/PenguLoader/plugin-store")}>
				Source
			</Button>
		</div>
	</div>

	{#if state.storeState}
		<p class="save-state">{state.storeState}</p>
	{/if}

	{#if state.storePlugins.length > 0}
		<div class="store-grid">
			{#each state.storePlugins as plugin}
				<article>
					<div class="store-icon" aria-hidden="true">
						{#if plugin.image}
							<img src={plugin.image} alt="" />
						{:else}
							<span>{plugin.name.slice(0, 1)}</span>
						{/if}
					</div>
					<div>
						<div class="store-heading">
							<h3>{plugin.name}</h3>
							<div class="store-actions">
								<Button
									size="sm"
									disabled={state.installStates[plugin.slug || plugin.name] === "Installing..."}
									onclick={() => state.installStorePlugin(plugin)}
								>
									{state.installStates[plugin.slug || plugin.name] === "Installing..."
										? "Installing"
										: plugin.installed
											? "Reinstall"
											: "Install"}
								</Button>
								{#if plugin.installed && plugin.installed_repo}
									<Button
										variant="outline"
										size="sm"
										disabled={state.installStates[plugin.slug || plugin.name] === "Uninstalling..."}
										onclick={() => state.uninstallStorePlugin(plugin)}
									>
										{state.installStates[plugin.slug || plugin.name] === "Uninstalling..."
											? "Removing"
											: "Uninstall"}
									</Button>
								{/if}
								<Button variant="outline" size="sm" onclick={() => state.openExternal(plugin.repo)}>Repo</Button>
							</div>
						</div>
						{#if plugin.author}
							<small>by {plugin.author}</small>
						{/if}
						<p>{plugin.description || "No description provided."}</p>
						{#if state.installStates[plugin.slug || plugin.name]}
							<p class="install-state">{state.installStates[plugin.slug || plugin.name]}</p>
						{/if}
						{#if plugin.installed && plugin.installed_repo}
							<small>source {plugin.installed_repo}</small>
						{/if}
						<div class="store-tags">
							{#if plugin.installed}<span>installed</span>{/if}
							{#if plugin.theme}<span>theme</span>{/if}
							{#if plugin.auto_update}<span>auto-update</span>{/if}
							{#each plugin.tags as tag}<span>{tag}</span>{/each}
						</div>
						{#if plugin.installed_entries.length > 0}
							<small>{plugin.installed_entries.join(", ")}</small>
						{/if}
					</div>
				</article>
			{/each}
		</div>
	{:else}
		<p class="empty-state">Plugin Store is coming soon. Refresh to preview the public registry.</p>
	{/if}
</section>
