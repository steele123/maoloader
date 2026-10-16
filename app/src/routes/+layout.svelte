<script lang="ts">
	import HouseIcon from "@lucide/svelte/icons/house";
	import MinusIcon from "@lucide/svelte/icons/minus";
	import PuzzleIcon from "@lucide/svelte/icons/puzzle";
	import SettingsIcon from "@lucide/svelte/icons/settings";
	import StoreIcon from "@lucide/svelte/icons/store";
	import XIcon from "@lucide/svelte/icons/x";
	import { goto } from "$app/navigation";
	import { page } from "$app/stores";
	import { getCurrentWindow } from "@tauri-apps/api/window";
	import { onMount, setContext } from "svelte";
	import { APP_STATE_KEY, AppState } from "$lib/app-state.svelte";
	import { listenForInstallLinks } from "$lib/deep-link";
	import { Button } from "$lib/components/ui/button/index.js";
	import { releaseNotesHtml } from "$lib/release-notes";
	import { DISCORD_URL } from "$lib/links";
	import "./layout.css";

	const { children } = $props();

	const state = new AppState();
	setContext(APP_STATE_KEY, state);

	const navItems = [
		{ href: "/", label: "Home", icon: HouseIcon },
		{ href: "/plugins", label: "Plugins", icon: PuzzleIcon },
		{ href: "/store", label: "Store", icon: StoreIcon },
		{ href: "/settings", label: "Settings", icon: SettingsIcon },
	];

	const active = $derived(state.activation?.activated ?? false);
	const enabledCount = $derived(state.plugins.filter((plugin) => plugin.enabled).length);

	onMount(() => {
		void state.initialize();
		const stopListening = listenForInstallLinks((slug) => goto(`/store?install=${encodeURIComponent(slug)}`));
		return () => void stopListening.then((unlisten) => unlisten?.());
	});

	function minimizeWindow() {
		void getCurrentWindow().minimize();
	}

	function closeWindow() {
		void getCurrentWindow().close();
	}

	// The only drag handler for the title bar. It must start the drag in the same tick as the
	// press: anything awaited first lets the button come up before Windows starts moving the window.
	function startDragging(event: PointerEvent) {
		if (event.button !== 0 || event.detail > 1) return;
		if ((event.target as HTMLElement | null)?.closest(".window-controls")) return;

		event.preventDefault();
		try {
			getCurrentWindow()
				.startDragging()
				.catch(() => {});
		} catch {
			// The browser preview does not provide the Tauri window API.
		}
	}
</script>

<svelte:head>
	<title>maoloader</title>
</svelte:head>

<div class="app-frame">
	<div
		class="titlebar"
		role="toolbar"
		aria-label="Window controls"
		tabindex="-1"
		onpointerdown={startDragging}
	>
		<div class="titlebar-brand">
			<span>maoloader</span>
			{#if state.status}
				<span class="titlebar-version">v{state.status.version}</span>
			{/if}
		</div>
		<div class="window-controls">
			<button class="window-button" type="button" aria-label="Minimize window" onclick={minimizeWindow}>
				<MinusIcon />
			</button>
			<button class="window-button close" type="button" aria-label="Close window" onclick={closeWindow}>
				<XIcon />
			</button>
		</div>
	</div>

	<main class="app-shell">
		<aside class="sidebar" aria-label="Primary">
			<div class="brand">
				<div class="medallion" class:is-off={!active} aria-hidden="true">
					<img src="/maologo.png" alt="" />
				</div>
				<div>
					<strong>maoloader</strong>
					<small>
						<span class="status-dot" class:is-on={active}></span>
						{state.activation ? (active ? "Active" : "Inactive") : "Checking…"}
					</small>
				</div>
			</div>

			<nav class="nav">
				{#each navItems as item}
					{@const Icon = item.icon}
					<a
						href={item.href}
						class="nav-link"
						class:active={$page.url.pathname === item.href}
						aria-current={$page.url.pathname === item.href ? "page" : undefined}
					>
						<Icon />
						{item.label}
						{#if item.href === "/plugins" && state.plugins.length}
							<span class="nav-count">{enabledCount}</span>
						{/if}
					</a>
				{/each}
			</nav>

			{#if DISCORD_URL}
				<button class="nav-link sidebar-discord" type="button" onclick={() => state.openExternal(DISCORD_URL)}>
					<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19.3 5.3A16.6 16.6 0 0 0 15.2 4l-.5 1a15.4 15.4 0 0 0-4.6 0l-.5-1a16.5 16.5 0 0 0-4.1 1.3A17.3 17.3 0 0 0 2.6 17a16.7 16.7 0 0 0 5 2.6l1.1-1.7a10.8 10.8 0 0 1-1.7-.8l.4-.3a11.9 11.9 0 0 0 10.2 0l.4.3c-.5.3-1.1.6-1.7.8l1.1 1.7a16.6 16.6 0 0 0 5-2.6 17.2 17.2 0 0 0-3.1-11.7ZM8.7 14.6c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm6.6 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z"/></svg>
					Discord
				</button>
			{/if}
		</aside>

		<section class="workspace">
			{@render children()}
		</section>
	</main>
</div>

{#if state.updatePromptOpen && state.updateAvailableVersion}
	<div class="modal-backdrop" role="presentation" onclick={(event) => event.target === event.currentTarget && state.dismissUpdatePrompt()}>
		<div class="panel modal update-modal" role="dialog" aria-modal="true" aria-label={`maoloader v${state.updateAvailableVersion}`}>
			<p class="eyebrow">Update available</p>
			<h2>maoloader v{state.updateAvailableVersion}</h2>
			{#if state.updateNotes}
				<!-- Notes are escaped by releaseNotesHtml before any markup is added. -->
				<div class="release-notes">{@html releaseNotesHtml(state.updateNotes)}</div>
			{:else}
				<p class="muted">A new version is ready.</p>
			{/if}
			<div class="modal-actions">
				<Button variant="outline" onclick={() => state.dismissUpdatePrompt()}>Later</Button>
				<Button onclick={() => state.installUpdate()}>Install update</Button>
			</div>
		</div>
	</div>
{/if}
