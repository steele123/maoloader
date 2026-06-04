export const RELEASE_CHANNEL_KEY = "releases/maoloader/latest.json";

export type ReleasePlatform = {
	url: string;
	signature: string;
	installer_url?: string;
	installer_name?: string;
	size?: number;
	sha256?: string;
};

export type ReleaseManifest = {
	version: string;
	notes?: string;
	pub_date?: string;
	platforms: Record<string, ReleasePlatform>;
};

export type DownloadRelease = {
	version: string;
	notes: string;
	pub_date: string;
	platform: ReleasePlatform;
	platform_key: string;
};

export async function getLatestRelease(
	platform?: App.Platform
): Promise<ReleaseManifest | undefined> {
	const bucket = releaseBucket(platform);
	if (!bucket) {
		return fallbackRelease();
	}

	const object = await bucket.get(RELEASE_CHANNEL_KEY);
	if (!object) {
		return undefined;
	}

	return JSON.parse(await object.text()) as ReleaseManifest;
}

export async function getDownloadRelease(
	platform?: App.Platform,
	platformKey = "windows-x86_64"
): Promise<DownloadRelease | undefined> {
	const manifest = await getLatestRelease(platform);
	const releasePlatform = manifest?.platforms?.[platformKey];
	if (!manifest || !releasePlatform) {
		return undefined;
	}

	return {
		version: manifest.version,
		notes: manifest.notes || "",
		pub_date: manifest.pub_date || "",
		platform: releasePlatform,
		platform_key: platformKey
	};
}

export function releaseBucket(platform?: App.Platform) {
	return platform?.env?.PLUGIN_BUCKET;
}

export function absoluteUrl(origin: string, path: string) {
	return path.startsWith("http") ? path : new URL(path, origin).toString();
}

export function platformKey(target: string, arch: string) {
	return `${target}-${arch}`;
}

export function isNewerVersion(latest: string, current: string) {
	const latestParts = normalizeVersion(latest);
	const currentParts = normalizeVersion(current);
	for (let index = 0; index < Math.max(latestParts.length, currentParts.length); index += 1) {
		const left = latestParts[index] || 0;
		const right = currentParts[index] || 0;
		if (left !== right) {
			return left > right;
		}
	}
	return false;
}

function normalizeVersion(version: string) {
	return version
		.trim()
		.replace(/^v/i, "")
		.split(/[.+-]/)
		.map((part) => Number.parseInt(part, 10))
		.map((part) => (Number.isFinite(part) ? part : 0));
}

function fallbackRelease(): ReleaseManifest | undefined {
	const url = "/api/releases/download/releases/maoloader/v0.1.0/windows-x86_64/maoloader-setup.exe";
	return {
		version: "0.1.0",
		notes: "Initial maoloader desktop release.",
		pub_date: "2026-06-04T00:00:00Z",
		platforms: {
			"windows-x86_64": {
				url,
				installer_url: url,
				installer_name: "maoloader-setup.exe",
				signature: ""
			}
		}
	};
}
