<script lang="ts">
	import CpuIcon from "@lucide/svelte/icons/cpu";
	import FolderOpenIcon from "@lucide/svelte/icons/folder-open";
	import PlugIcon from "@lucide/svelte/icons/plug";
	import PowerIcon from "@lucide/svelte/icons/power";
	import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
	import SettingsIcon from "@lucide/svelte/icons/settings";
	import ShieldIcon from "@lucide/svelte/icons/shield";
	import { getContext } from "svelte";
	import { APP_STATE_KEY, type AppState } from "$lib/app-state.svelte";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { Button } from "$lib/components/ui/button/index.js";

	const state = getContext<AppState>(APP_STATE_KEY);
</script>

<section class="home-hero" aria-label="Loader summary">
	<div class="home-hero-copy">
		<p class="eyebrow">Loader workspace</p>
		<h2>Manage activation, plugins, and runtime state.</h2>
		<p>
			{#if state.status}
				{state.status.app_name} is ready; injector state is {state.status.injector}.
			{:else if state.statusError}
				Status unavailable: {state.statusError}
			{:else}
				Checking local loader state...
			{/if}
		</p>
	</div>

	<div class="home-hero-panel">
		<Badge variant={state.activation?.activated ? "secondary" : "outline"}>
			{state.activation?.activated ? "Active" : "Inactive"}
		</Badge>
		<strong>{state.runtime?.plugin_count ?? state.plugins.length} plugins</strong>
		<span>{state.status?.core_exists ? "core.dll found" : "core.dll missing"}</span>
	</div>
</section>

<section class="home-actions" aria-label="Quick actions">
	<Button onclick={() => state.reveal(state.status?.paths.base_dir)}>
		<FolderOpenIcon />
		Open Base
	</Button>
	<Button variant="outline" onclick={() => state.openPluginsFolder()}>
		<PlugIcon />
		Plugins
	</Button>
	<Button variant="outline" onclick={() => state.syncRuntime()}>
		<RefreshCwIcon />
		Sync Runtime
	</Button>
	{#if state.activation}
		<Button
			variant={state.activation.activated ? "destructive" : "secondary"}
			disabled={state.activationBusy}
			onclick={() => state.setActivation(!state.activation?.activated)}
		>
			<PowerIcon />
			{state.activationBusy ? "Working" : state.activation.activated ? "Deactivate" : "Activate"}
		</Button>
	{/if}
</section>

{#if state.activationNotice}
	<p class="activation-notice">{state.activationNotice}</p>
{/if}

<section class="home-grid" aria-label="Current state">
	<article class="home-card">
		<div class="home-card-heading">
			<span><ShieldIcon /></span>
			<div>
				<p class="eyebrow">Activation</p>
				<h3>{state.activation?.activated ? "Installed" : "Not installed"}</h3>
			</div>
		</div>
		<p>
			{#if state.activation}
				{state.activation.mode === "targeted"
					? "Targeted mode links into the configured League directory."
					: "Universal mode launches the client through the configured loader hook."}
			{:else}
				Activation state is still loading.
			{/if}
		</p>
		<div class="card-badges">
			<Badge variant="outline">{state.activation?.admin ? "Admin" : "Standard user"}</Badge>
			<Badge variant={state.activation?.webview2_installed ? "secondary" : "destructive"}>
				{state.activation?.webview2_installed ? "WebView2 ready" : "WebView2 missing"}
			</Badge>
		</div>
		{#if state.activation?.message}
			<p class="activation-error">{state.activation.message}</p>
		{/if}
	</article>

	<article class="home-card">
		<div class="home-card-heading">
			<span><CpuIcon /></span>
			<div>
				<p class="eyebrow">Runtime</p>
				<h3>{state.runtime?.preload_exists ? "Preload synced" : "Preload pending"}</h3>
			</div>
		</div>
		<p>
			{state.runtime?.preload_exists
				? "The injected preload is ready for the client runtime."
				: "Runtime assets are loading."}
		</p>
		<div class="card-badges">
			<Badge variant="secondary">{state.runtime?.plugin_count ?? state.plugins.length} plugins</Badge>
			<Badge variant="outline">{state.status?.core_exists ? "core ready" : "core missing"}</Badge>
		</div>
	</article>

	<article class="home-card">
		<div class="home-card-heading">
			<span><SettingsIcon /></span>
			<div>
				<p class="eyebrow">Configuration</p>
				<h3>{state.config?.app.league_dir ? "League path set" : "League path needed"}</h3>
			</div>
		</div>
		<p>{state.config?.app.league_dir || "Set the League directory before using targeted activation."}</p>
		<div class="card-badges">
			<Badge variant="outline">{state.config?.app.activation_mode ?? "loading"}</Badge>
			<Badge variant="outline">debug {state.config?.client.debug_port ?? "n/a"}</Badge>
		</div>
	</article>
</section>

{#if state.status}
	<section class="path-list" aria-label="Loader paths">
		<Button variant="outline" class="path-card" onclick={() => state.reveal(state.status?.paths.config_path)}>
			<span>Config</span>
			<strong>Open config location</strong>
		</Button>
		<Button variant="outline" class="path-card" onclick={() => state.openPluginsFolder()}>
			<span>Plugins</span>
			<strong>Open plugin folder</strong>
		</Button>
	</section>
{/if}
