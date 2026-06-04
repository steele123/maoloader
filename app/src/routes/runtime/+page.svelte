<script lang="ts">
	import { getContext } from "svelte";
	import { APP_STATE_KEY, type AppState } from "$lib/app-state.svelte";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { Button } from "$lib/components/ui/button/index.js";

	const state = getContext<AppState>(APP_STATE_KEY);
</script>

{#if state.runtime}
	<section class="runtime-assets" aria-label="Runtime assets">
		<div>
			<p class="eyebrow">Injected runtime</p>
			<h2>{state.runtime.preload_exists ? "Preload synced" : "Preload missing"}</h2>
			<p>
				{state.runtime.preload_exists
					? "The injected preload is ready for the client runtime."
					: "Sync runtime assets before launching the client."}
			</p>
		</div>
		<div class="runtime-actions">
			<Badge variant="secondary">{state.runtime.plugin_count} plugins</Badge>
			<Button onclick={() => state.syncRuntime()}>Sync Runtime</Button>
		</div>
		{#if state.runtimeMessage}
			<p class="save-state">{state.runtimeMessage}</p>
		{/if}
	</section>
{/if}

{#if state.nativeCore}
	<section class="native-core" aria-label="Native core diagnostics">
		<div>
			<p class="eyebrow">Native core</p>
			<h2>{state.nativeCore.loadable ? "core.dll loadable" : "core.dll unavailable"}</h2>
			<p>
				{state.nativeCore.loadable
					? "Native diagnostics are available from the current loader core."
					: "Build or sync the native core before activating the loader."}
			</p>
			{#if state.nativeCore.error}
				<p class="activation-error">{state.nativeCore.error}</p>
			{/if}
		</div>
		<div class="native-stats">
			<span>{state.nativeCore.plugin_count} plugins</span>
			<span>
				CEF {state.nativeCore.libcef_version || "n/a"} / supported
				{state.nativeCore.supported_libcef_major || "n/a"}
			</span>
			<span>{state.nativeCore.libcef_supported ? "CEF supported" : "CEF unsupported"}</span>
			<span>{state.nativeCore.riotclient_credentials_ready ? "riot auth ready" : "riot auth pending"}</span>
			<span>{state.nativeCore.plugins_scheme_creates} plugin scheme requests</span>
			<span>{state.nativeCore.plugins_asset_resolves} plugin asset hits</span>
			<span>{state.nativeCore.renderer_main_contexts} renderer contexts</span>
			<span>{state.nativeCore.renderer_native_exposes} native exposes</span>
			<span>{state.nativeCore.renderer_preload_executes} preload runs</span>
			<span>latest {state.nativeCore.diagnostics_latest_event || "n/a"}</span>
			<span>{state.nativeCore.hook_ready ? "hook ready" : "hook pending"}</span>
		</div>
	</section>
{/if}
