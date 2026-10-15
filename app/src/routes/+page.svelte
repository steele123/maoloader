<script lang="ts">
	import ActivityIcon from "@lucide/svelte/icons/activity";
	import CircleAlertIcon from "@lucide/svelte/icons/circle-alert";
	import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
	import CircleXIcon from "@lucide/svelte/icons/circle-x";
	import DownloadIcon from "@lucide/svelte/icons/download";
	import FileCogIcon from "@lucide/svelte/icons/file-cog";
	import FolderOpenIcon from "@lucide/svelte/icons/folder-open";
	import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
	import PowerIcon from "@lucide/svelte/icons/power";
	import PuzzleIcon from "@lucide/svelte/icons/puzzle";
	import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
	import { getContext } from "svelte";
	import { APP_STATE_KEY, type AppState } from "$lib/app-state.svelte";

	const state = getContext<AppState>(APP_STATE_KEY);

	const active = $derived(state.activation?.activated ?? false);
	const enabledCount = $derived(state.plugins.filter((plugin) => plugin.enabled).length);
	const universal = $derived((state.config?.app.activation_mode ?? "universal") === "universal");

	// Each check is a requirement for plugins to load; null means still loading.
	const checks = $derived([
		{
			label: universal ? "Universal mode" : state.config?.app.league_dir ? "League folder set" : "League folder needed",
			ok: state.config ? universal || Boolean(state.config.app.league_dir) : null,
		},
		{ label: state.status?.core_exists === false ? "Core missing" : "Core ready", ok: state.status ? state.status.core_exists : null },
		{
			label: state.activation?.webview2_installed === false ? "WebView2 missing" : "WebView2 ready",
			ok: state.activation ? state.activation.webview2_installed : null,
		},
		{
			label: state.runtime?.preload_exists === false ? "Runtime not synced" : "Runtime synced",
			ok: state.runtime ? state.runtime.preload_exists : null,
		},
	]);
</script>

<section class="panel status-hero" class:is-off={!active} aria-label="maoloader status">
	<div class="medallion is-large" class:is-off={!active} aria-hidden="true">
		<img src="/maologo.png" alt="" />
	</div>

	<div class="status-copy">
		<p class="eyebrow">Status</p>
		<h2>
			{#if !state.activation}
				Checking…
			{:else if active}
				maoloader is on
			{:else}
				maoloader is off
			{/if}
		</h2>
		<p>
			{#if active}
				Your plugins load whenever League starts. If it's open now, restart it.
			{:else if state.activation}
				Turn it on to load your plugins into the League client.
			{:else}
				Reading your setup…
			{/if}
		</p>
	</div>

	{#if state.activation}
		<button
			class="hero-button"
			class:is-off={active}
			type="button"
			disabled={state.activationBusy}
			onclick={() => state.setActivation(!active)}
		>
			{#if state.activationBusy}
				<LoaderCircleIcon class="spin" />
				Working
			{:else}
				<PowerIcon />
				{active ? "Turn off" : "Turn on"}
			{/if}
		</button>
	{/if}

	<div class="checks" aria-label="Requirements">
		{#each checks as check}
			<span class="check-chip" class:is-bad={check.ok === false} class:is-pending={check.ok === null}>
				{#if check.ok === null}
					<LoaderCircleIcon class="spin" />
				{:else if check.ok}
					<CircleCheckIcon />
				{:else}
					<CircleXIcon />
				{/if}
				{check.label}
			</span>
		{/each}
	</div>
</section>

{#if state.statusError}
	<p class="notice is-error"><CircleAlertIcon />{state.statusError}</p>
{/if}
{#if state.activation?.message}
	<p class="notice is-error"><CircleAlertIcon />{state.activation.message}</p>
{/if}
{#if state.activationNotice}
	<p class="notice"><CircleAlertIcon />{state.activationNotice}</p>
{/if}

<div class="tiles">
	<a class="panel tile" href="/plugins">
		<span class="tile-label"><PuzzleIcon />Plugins</span>
		<strong>{enabledCount}<small>&nbsp;/ {state.plugins.length}</small></strong>
		<span class="tile-note">enabled</span>
	</a>

	<div class="panel tile">
		<span class="tile-label"><ActivityIcon />Client loads</span>
		<strong>{state.nativeCore?.renderer_preload_executes ?? 0}</strong>
		<span class="tile-note">pages maoloader ran in</span>
	</div>

	<button class="panel tile" type="button" disabled={state.updateBusy} onclick={() => state.checkAndInstallUpdate()}>
		<span class="tile-label"><DownloadIcon />Version</span>
		<strong>v{state.status?.version ?? "…"}</strong>
		<span class="tile-note">
			{state.updateMessage || (state.updateBusy ? "Checking…" : "Check for updates")}
		</span>
		{#if state.updateProgress > 0}
			<span class="tile-progress" aria-label="Update progress"><span style={`width: ${state.updateProgress}%`}></span></span>
		{/if}
	</button>
</div>

<h3 class="section-title">Quick actions</h3>
<div class="quick-actions">
	<button class="panel quick-action" type="button" onclick={() => state.openPluginsFolder()}>
		<span><FolderOpenIcon /></span>Plugins folder
	</button>
	<button class="panel quick-action" type="button" onclick={() => state.reveal(state.status?.paths.base_dir)}>
		<span><FolderOpenIcon /></span>maoloader folder
	</button>
	<button class="panel quick-action" type="button" onclick={() => state.reveal(state.status?.paths.config_path)}>
		<span><FileCogIcon /></span>Config file
	</button>
	<button class="panel quick-action" type="button" onclick={() => state.syncRuntime()}>
		<span><RefreshCwIcon /></span>{state.runtimeMessage === "Syncing..." ? "Syncing…" : "Sync runtime"}
	</button>
</div>
