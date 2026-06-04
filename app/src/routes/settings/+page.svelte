<script lang="ts">
	import { getContext } from "svelte";
	import { APP_STATE_KEY, type AppState } from "$lib/app-state.svelte";
	import { Button } from "$lib/components/ui/button/index.js";

	const state = getContext<AppState>(APP_STATE_KEY);
</script>

{#if state.config}
	<section class="settings" aria-label="Client settings">
		<div class="settings-heading">
			<div>
				<h2>Client Settings</h2>
				<p>These persist to the local loader config file.</p>
			</div>
			<Button onclick={() => state.saveConfig()}>Save</Button>
		</div>

		<div class="settings-grid">
			<div class="field-with-actions">
				<label>
					<span>League Directory</span>
					<input bind:value={state.config.app.league_dir} placeholder="Path to League of Legends" />
				</label>
				<div class="field-actions">
					<Button variant="outline" onclick={() => state.validateLeagueDir()}>Validate</Button>
					<Button variant="outline" onclick={() => state.findLeagueDir()}>Find</Button>
				</div>
				{#if state.leagueDirState}
					<p class="field-state">{state.leagueDirState}</p>
				{/if}
			</div>
			<label>
				<span>Plugins Directory</span>
				<input bind:value={state.config.app.plugins_dir} placeholder="Leave empty for default plugins folder" />
			</label>
			<label>
				<span>Activation Mode</span>
				<select bind:value={state.config.app.activation_mode}>
					<option value="universal">Universal</option>
					<option value="targeted">Targeted</option>
				</select>
			</label>
			<label>
				<span>Debug Port</span>
				<input
					type="number"
					min="0"
					max="65534"
					step="1"
					bind:value={state.config.client.debug_port}
					placeholder="0"
				/>
			</label>
		</div>

		<div class="toggles">
			<label>
				<input type="checkbox" bind:checked={state.config.client.use_hotkeys} />
				<span>Hotkeys</span>
			</label>
			<label>
				<input type="checkbox" bind:checked={state.config.client.optimized_client} />
				<span>Optimized Client</span>
			</label>
			<label>
				<input type="checkbox" bind:checked={state.config.client.use_devtools} />
				<span>DevTools</span>
			</label>
			<label>
				<input type="checkbox" bind:checked={state.config.client.silent_mode} />
				<span>Silent Mode</span>
			</label>
			<label>
				<input type="checkbox" bind:checked={state.config.client.super_potato} />
				<span>Super Potato</span>
			</label>
			<label>
				<input type="checkbox" bind:checked={state.config.client.insecure_mode} />
				<span>Insecure Mode</span>
			</label>
			<label>
				<input type="checkbox" bind:checked={state.config.client.use_riotclient} />
				<span>Riot Client Hooks</span>
			</label>
			<label>
				<input type="checkbox" bind:checked={state.config.client.use_proxy} />
				<span>Riot Proxy</span>
			</label>
		</div>

		{#if state.saveState}
			<p class="save-state">{state.saveState}</p>
		{/if}
	</section>
{/if}
