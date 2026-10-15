<script lang="ts">
	import FolderOpenIcon from "@lucide/svelte/icons/folder-open";
	import PuzzleIcon from "@lucide/svelte/icons/puzzle";
	import SearchIcon from "@lucide/svelte/icons/search";
	import { getContext } from "svelte";
	import { APP_STATE_KEY, type AppState, type PluginEntry } from "$lib/app-state.svelte";
	import { Button } from "$lib/components/ui/button/index.js";

	const app = getContext<AppState>(APP_STATE_KEY);

	type Filter = "all" | "on" | "off";
	let search = $state("");
	let filter: Filter = $state("all");

	const enabledCount = $derived(app.plugins.filter((plugin) => plugin.enabled).length);
	const shown = $derived(
		app.plugins.filter((plugin) => {
			if (filter === "on" && !plugin.enabled) return false;
			if (filter === "off" && plugin.enabled) return false;
			const query = search.trim().toLowerCase();
			return !query || [plugin.name, plugin.entry, plugin.description, plugin.author].join(" ").toLowerCase().includes(query);
		}),
	);

	function title(plugin: PluginEntry) {
		return plugin.name || plugin.entry;
	}
</script>

<header class="page-header">
	<div>
		<h1>Plugins</h1>
		<p>{enabledCount} of {app.plugins.length} enabled</p>
	</div>
	<div class="page-tools">
		<label class="search">
			<SearchIcon />
			<input bind:value={search} type="search" placeholder="Search plugins" aria-label="Search plugins" />
		</label>
		<Button variant="outline" size="sm" onclick={() => app.openPluginsFolder()}>
			<FolderOpenIcon />
			Folder
		</Button>
	</div>
</header>

<div class="page-header" style="margin-bottom: 10px">
	<div class="segmented" role="group" aria-label="Show">
		<button type="button" aria-pressed={filter === "all"} onclick={() => (filter = "all")}>All</button>
		<button type="button" aria-pressed={filter === "on"} onclick={() => (filter = "on")}>Enabled</button>
		<button type="button" aria-pressed={filter === "off"} onclick={() => (filter = "off")}>Disabled</button>
	</div>
</div>

{#if app.plugins.length === 0}
	<div class="panel empty">
		<PuzzleIcon />
		<strong>No plugins yet</strong>
		<span>Browse the Store, or drop a plugin folder into your plugins folder.</span>
	</div>
{:else if shown.length === 0}
	<div class="panel empty">
		<SearchIcon />
		<strong>Nothing matches</strong>
		<span>Try another search or filter.</span>
	</div>
{:else}
	<div class="panel plugin-rows">
		{#each shown as plugin (plugin.entry)}
			<div class="plugin-row" class:is-off={!plugin.enabled}>
				<div class="plugin-avatar" class:is-theme={plugin.kind === "theme"} class:has-icon={!!plugin.icon} aria-hidden="true">
					{#if plugin.icon}
						<img src={plugin.icon} alt="" />
					{:else}
						{title(plugin).slice(0, 1)}
					{/if}
				</div>
				<div class="plugin-copy">
					<strong>
						{title(plugin)}
						{#if plugin.kind === "theme"}<span class="kind-tag">Theme</span>{/if}
					</strong>
					<small title={plugin.description || plugin.entry}>{plugin.description || plugin.entry}</small>
				</div>
				<button
					class="icon-button"
					type="button"
					aria-label={`Show ${title(plugin)} in its folder`}
					title="Show in folder"
					onclick={() => app.reveal(plugin.path)}
				>
					<FolderOpenIcon />
				</button>
				<input
					class="switch"
					type="checkbox"
					checked={plugin.enabled}
					aria-label={`${plugin.enabled ? "Disable" : "Enable"} ${title(plugin)}`}
					onchange={(event) => app.setPluginEnabled(plugin, event.currentTarget.checked)}
				/>
			</div>
		{/each}
	</div>
{/if}

<div class="list-footer">
	<span>Changes apply the next time the League client loads.</span>
	<span>{app.plugins.length} installed</span>
</div>
