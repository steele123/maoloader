<script lang="ts">
	import MinusIcon from "@lucide/svelte/icons/minus";
	import XIcon from "@lucide/svelte/icons/x";
	import { page } from "$app/stores";
	import { onMount, setContext } from "svelte";
	import { APP_STATE_KEY, AppState } from "$lib/app-state.svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import "./layout.css";

	const { children } = $props();

	const state = new AppState();
	setContext(APP_STATE_KEY, state);

	const navItems = [
		{ href: "/", label: "Overview", title: "Loader Control Center" },
		{ href: "/plugins", label: "Plugins", title: "Plugin Manager" },
		{ href: "/runtime", label: "Runtime", title: "Runtime Diagnostics" },
		{ href: "/settings", label: "Settings", title: "Client Settings" },
	];

	let currentTitle = $derived(
		navItems.find((item) => item.href === $page.url.pathname)?.title ?? "Loader Control Center",
	);

	onMount(() => {
		void state.initialize();
	});

	async function minimizeWindow() {
		const { getCurrentWindow } = await import("@tauri-apps/api/window");
		await getCurrentWindow().minimize();
	}

	async function closeWindow() {
		const { getCurrentWindow } = await import("@tauri-apps/api/window");
		await getCurrentWindow().close();
	}

	async function startDragging(event: PointerEvent) {
		if (event.button !== 0) return;

		const target = event.target as HTMLElement | null;
		if (target?.closest(".window-controls")) return;

		try {
			const { getCurrentWindow } = await import("@tauri-apps/api/window");
			await getCurrentWindow().startDragging();
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
		data-tauri-drag-region
		onpointerdown={startDragging}
	>
		<div class="titlebar-brand" data-tauri-drag-region>
			<span data-tauri-drag-region>maoloader</span>
		</div>
		<div class="window-controls">
			<Button
				variant="ghost"
				size="icon-sm"
				class="window-button"
				aria-label="Minimize window"
				onclick={minimizeWindow}
			>
				<MinusIcon />
			</Button>
			<Button
				variant="ghost"
				size="icon-sm"
				class="window-button close"
				aria-label="Close window"
				onclick={closeWindow}
			>
				<XIcon />
			</Button>
		</div>
	</div>

	<main class="app-shell">
		<aside class="sidebar" aria-label="Primary">
			<div class="brand">
				<div class="mark" aria-hidden="true">
					<img src="/maologo.png" alt="" />
				</div>
				<div>
					<strong>maoloader</strong>
					<span>{state.status ? `v${state.status.version}` : "v0.1.0"}</span>
				</div>
			</div>

			<nav>
				{#each navItems as item}
					<a
						href={item.href}
						class={$page.url.pathname === item.href ? "nav-button active" : "nav-button"}
						aria-current={$page.url.pathname === item.href ? "page" : undefined}
					>
						{item.label}
					</a>
				{/each}
			</nav>
		</aside>

		<section class="workspace">
			<header>
				<div>
					<p class="eyebrow">Control center</p>
					<h1>{currentTitle}</h1>
				</div>
			</header>

			{@render children()}
		</section>
	</main>
</div>
