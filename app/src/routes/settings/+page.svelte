<script lang="ts">
	import ActivityIcon from "@lucide/svelte/icons/activity";
	import CircleAlertIcon from "@lucide/svelte/icons/circle-alert";
	import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
	import CircleXIcon from "@lucide/svelte/icons/circle-x";
	import Gamepad2Icon from "@lucide/svelte/icons/gamepad-2";
	import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
	import SaveIcon from "@lucide/svelte/icons/save";
	import SparklesIcon from "@lucide/svelte/icons/sparkles";
	import WrenchIcon from "@lucide/svelte/icons/wrench";
	import { getContext } from "svelte";
	import { APP_STATE_KEY, type AppState, type LoaderConfig } from "$lib/app-state.svelte";
	import { Button } from "$lib/components/ui/button/index.js";

	const app = getContext<AppState>(APP_STATE_KEY);

	type ClientOption = keyof Omit<LoaderConfig["client"], "debug_port">;

	// What each switch does, from how maoloader's core applies it.
	const clientOptions: { key: ClientOption; label: string; description: string }[] = [
		{ key: "use_hotkeys", label: "Hotkeys", description: "F12 for DevTools and Ctrl+Shift+Enter to restart the client." },
		{ key: "use_devtools", label: "DevTools", description: "Lets F12 and the command bar open DevTools in the client." },
		{ key: "optimized_client", label: "Optimized client", description: "Turns off background throttling, telemetry and other Chromium extras." },
		{ key: "super_potato", label: "Super potato", description: "Turns off smooth scrolling and animations for low-end PCs." },
		{ key: "silent_mode", label: "Silent mode", description: "Stops the client window from stealing focus when it opens." },
	];
	const advancedOptions: { key: ClientOption; label: string; description: string; warning?: string }[] = [
		{ key: "use_riotclient", label: "Riot Client access", description: "Lets plugins call the Riot Client's API, not just League's." },
		{ key: "use_proxy", label: "Use system proxy", description: "Detects your proxy settings instead of connecting directly." },
		{
			key: "insecure_mode",
			label: "Insecure mode",
			description: "Turns off web security in the client. Only for plugin development.",
			warning: "Risky",
		},
	];

	const leagueState = $derived(
		app.leagueDirState.includes("found") && !app.leagueDirState.startsWith("No")
			? "good"
			: app.leagueDirState.startsWith("Search")
				? "pending"
				: app.leagueDirState
					? "bad"
					: "",
	);
	const modeLocked = $derived(Boolean(app.activation?.activated));
	const saving = $derived(app.saveState === "Saving...");
</script>

<header class="page-header">
	<div>
		<h1>Settings</h1>
		<p>{app.saveState === "Saved" && !app.configDirty ? "All changes saved." : "Changes apply the next time the League client starts."}</p>
	</div>
</header>

{#snippet option(key: ClientOption, label: string, description: string, warning?: string)}
	{#if app.config}
		<label class="setting">
			<span class="setting-copy">
				<strong>{label}{#if warning}<span class="warning-tag">{warning}</span>{/if}</strong>
				<small>{description}</small>
			</span>
			<input class="switch" type="checkbox" bind:checked={app.config.client[key]} />
		</label>
	{/if}
{/snippet}

{#if !app.config}
	<div class="panel empty">
		{#if app.statusError}
			<CircleAlertIcon />
			<strong>Settings couldn't be loaded</strong>
			<span>{app.statusError}</span>
		{:else}
			<LoaderCircleIcon class="spin" />
			<strong>Loading settings…</strong>
		{/if}
	</div>
{:else}
	<section class="panel settings-section" aria-label="League of Legends">
		<header><Gamepad2Icon /><h2>League of Legends</h2></header>

		<div class="setting is-stacked">
			<span class="setting-copy">
				<strong>How maoloader hooks League</strong>
				<small>
					{app.config.app.activation_mode === "targeted"
						? "Targeted links into the one League folder below."
						: "Universal works wherever League is installed, and asks for admin when you turn maoloader on."}
				</small>
			</span>
			<div class="segmented" role="group" aria-label="Activation mode">
				<button
					type="button"
					aria-pressed={app.config.app.activation_mode === "universal"}
					disabled={modeLocked}
					onclick={() => app.config && (app.config.app.activation_mode = "universal")}>Universal</button
				>
				<button
					type="button"
					aria-pressed={app.config.app.activation_mode === "targeted"}
					disabled={modeLocked}
					onclick={() => app.config && (app.config.app.activation_mode = "targeted")}>Targeted</button
				>
			</div>
			{#if modeLocked}
				<p class="field-state">Turn maoloader off on Home to switch modes.</p>
			{/if}
		</div>

		<div class="setting is-stacked">
			<span class="setting-copy">
				<strong>League folder</strong>
				<small>The folder with LeagueClientUx.exe. Needed for Targeted mode.</small>
			</span>
			<div class="input-row">
				<input class="text-input" bind:value={app.config.app.league_dir} placeholder="C:\Riot Games\League of Legends" aria-label="League folder" />
				<Button variant="outline" size="sm" onclick={() => app.findLeagueDir()}>Find it</Button>
				<Button variant="outline" size="sm" onclick={() => app.validateLeagueDir()}>Check</Button>
			</div>
			{#if app.leagueDirState}
				<p class="field-state" class:is-good={leagueState === "good"} class:is-bad={leagueState === "bad"}>
					{#if leagueState === "good"}<CircleCheckIcon />{:else if leagueState === "bad"}<CircleXIcon />{:else}<LoaderCircleIcon class="spin" />{/if}
					{app.leagueDirState}
				</p>
			{/if}
		</div>
	</section>

	<section class="panel settings-section" aria-label="In the client">
		<header><SparklesIcon /><h2>In the client</h2></header>
		{#each clientOptions as item (item.key)}
			{@render option(item.key, item.label, item.description)}
		{/each}
	</section>

	<section class="panel settings-section" aria-label="Advanced">
		<header><WrenchIcon /><h2>Advanced</h2></header>
		<div class="setting is-stacked">
			<span class="setting-copy">
				<strong>Plugins folder</strong>
				<small>Leave empty to use the plugins folder next to maoloader.</small>
			</span>
			<input class="text-input" bind:value={app.config.app.plugins_dir} placeholder="Default" aria-label="Plugins folder" />
		</div>
		{#each advancedOptions as item (item.key)}
			{@render option(item.key, item.label, item.description, item.warning)}
		{/each}
		<label class="setting">
			<span class="setting-copy">
				<strong>Remote debugging port</strong>
				<small>For attaching outside DevTools. 0 turns it off.</small>
			</span>
			<input class="text-input number-input" type="number" min="0" max="65534" step="1" bind:value={app.config.client.debug_port} />
		</label>
	</section>

	<section class="panel settings-section" aria-label="Diagnostics">
		<header><ActivityIcon /><h2>Diagnostics</h2></header>
		<div class="setting">
			<span class="setting-copy">
				<strong>Diagnostics bundle</strong>
				<small>{app.diagnosticsMessage || "Collects logs and status into a file you can share when reporting a problem."}</small>
			</span>
			<Button variant="outline" size="sm" onclick={() => app.createDiagnosticsBundle()}>Export</Button>
		</div>
		<div class="diag-grid">
			<div><span>Client pages loaded</span><strong>{app.nativeCore?.renderer_preload_executes ?? 0}</strong></div>
			<div><span>Plugin file requests</span><strong>{app.nativeCore?.plugins_scheme_creates ?? 0}</strong></div>
			<div><span>Plugin files served</span><strong>{app.nativeCore?.plugins_asset_resolves ?? 0}</strong></div>
		</div>
		<p class="diag-hint">
			In the client's DevTools: <code>__maoloaderPluginReports</code>, <code>__maoloaderPluginLogs</code>,
			<code>__maoloaderResetPluginSafeMode()</code>.
		</p>
	</section>

	{#if app.configDirty || (app.saveState && app.saveState !== "Saved")}
		<div class="save-bar" role="status">
			<span>
				{saving ? "Saving…" : "You have unsaved changes"}
				{#if app.saveState && app.saveState !== "Saved" && !saving}
					<small>{app.saveState}</small>
				{/if}
			</span>
			<div class="page-tools">
				<Button variant="outline" size="sm" disabled={saving} onclick={() => app.discardConfigChanges()}>Discard</Button>
				<button class="hero-button" type="button" disabled={saving} onclick={() => app.saveConfig()}>
					<SaveIcon />Save
				</button>
			</div>
		</div>
	{/if}
{/if}
