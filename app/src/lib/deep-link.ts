// maoloader://install/<slug> links from maoloader.com plugin pages.
export function installSlugFromUrl(raw: string): string | undefined {
	let url: URL;
	try {
		url = new URL(raw.trim());
	} catch {
		return undefined;
	}
	if (url.protocol !== "maoloader:") return undefined;

	// Windows hands the link over as-is, so "install" lands in the host and the slug in the path.
	const parts = [url.hostname, ...url.pathname.split("/")].filter(Boolean).map(decodeURIComponent);
	if (parts[0] !== "install") return undefined;

	const slug = parts[1]?.toLowerCase();
	return slug && /^[a-z0-9][a-z0-9._-]{0,63}$/.test(slug) ? slug : undefined;
}

// Calls `onInstall` for the link that launched the app and for any that arrive later.
export async function listenForInstallLinks(onInstall: (slug: string) => void) {
	try {
		const { getCurrent, onOpenUrl } = await import("@tauri-apps/plugin-deep-link");
		const handle = (urls: string[] | null) => {
			for (const raw of urls ?? []) {
				const slug = installSlugFromUrl(raw);
				if (slug) return onInstall(slug);
			}
		};
		handle(await getCurrent());
		return await onOpenUrl(handle);
	} catch {
		// The browser preview has no deep-link plugin.
		return undefined;
	}
}
