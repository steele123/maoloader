import { strFromU8, unzipSync, zipSync } from "fflate";

// Reads a plugin .zip without unpacking more than it needs. Runs in the browser (to preview a
// submission before it is sent) and on the server (to check it again before it is stored).

export const MAX_PACKAGE_BYTES = 25 * 1024 * 1024;
const MAX_FILES = 2000;
const MAX_README_BYTES = 64 * 1024;
const MAX_ICON_BYTES = 2 * 1024 * 1024;

export type PackageZip = {
	/** Folder inside the zip that holds the plugin, "" when files sit at the zip root. */
	root: string;
	/** Paths relative to `root`, folders left out. */
	files: string[];
	manifestText?: string;
	readme?: string;
	/** The entry the app would load when nothing says otherwise. */
	defaultEntry?: string;
	readFile(path: string, maxBytes?: number): Uint8Array | undefined;
};

export function readPackageZip(bytes: Uint8Array): PackageZip {
	const names: string[] = [];
	try {
		// The filter sees every entry; returning false skips decompressing it.
		unzipSync(bytes, {
			filter(file) {
				names.push(file.name);
				return false;
			}
		});
	} catch {
		throw new Error("That file is not a readable .zip.");
	}

	const paths = names.map(normalizePath).filter((path) => path && !path.endsWith("/"));
	for (const path of paths) {
		if (path.split("/").includes("..")) {
			throw new Error(`The zip has an unsafe path: ${path}`);
		}
	}
	const visible = paths.filter((path) => !path.startsWith("__MACOSX/") && !path.split("/").some((part) => part === ".DS_Store"));
	if (!visible.length) throw new Error("The zip is empty.");
	if (visible.length > MAX_FILES) throw new Error(`The zip has more than ${MAX_FILES} files.`);

	const root = packageRoot(visible);
	const files = visible.filter((path) => path.startsWith(root)).map((path) => path.slice(root.length));
	const byLowerName = new Map(files.map((path) => [path.toLowerCase(), path]));

	const readFile = (path: string, maxBytes = MAX_PACKAGE_BYTES) => {
		const wanted = root + normalizePath(path);
		let found: Uint8Array | undefined;
		const out = unzipSync(bytes, {
			filter: (file) => normalizePath(file.name) === wanted && file.originalSize <= maxBytes
		});
		for (const value of Object.values(out)) found = value;
		return found;
	};
	const readText = (path: string | undefined, maxBytes: number) => {
		const data = path ? readFile(path, maxBytes) : undefined;
		return data ? strFromU8(data) : undefined;
	};

	const manifestPath = byLowerName.get("maoloader.json");
	const readmePath = byLowerName.get("readme.md") ?? byLowerName.get("readme.txt") ?? byLowerName.get("readme");
	const rootScripts = files.filter((path) => !path.includes("/") && /\.js$/i.test(path));
	const defaultEntry = byLowerName.get("index.js") ?? (rootScripts.length === 1 ? rootScripts[0] : undefined);

	return {
		root,
		files,
		manifestText: readText(manifestPath, 256 * 1024),
		readme: readText(readmePath, MAX_README_BYTES),
		defaultEntry,
		readFile
	};
}

export function readPackageIcon(zip: PackageZip, path: string | undefined) {
	if (!path) return undefined;
	const type = imageType(path);
	if (!type) return undefined;
	const data = zip.readFile(path, MAX_ICON_BYTES);
	return data ? { data, type, extension: path.split(".").pop()!.toLowerCase() } : undefined;
}

function imageType(path: string) {
	const extension = path.split(".").pop()?.toLowerCase();
	return (
		{ png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" } as Record<
			string,
			string
		>
	)[extension ?? ""];
}

// Zips made by "Send to > Compressed folder" wrap everything in one folder; look inside it.
function packageRoot(paths: string[]) {
	if (paths.some((path) => path.toLowerCase() === "maoloader.json" || !path.includes("/"))) return "";
	const tops = new Set(paths.map((path) => path.split("/")[0]));
	return tops.size === 1 ? `${[...tops][0]}/` : "";
}

function normalizePath(path: string) {
	return path.replaceAll("\\", "/").replace(/^\.?\/+/, "");
}

/**
 * The desktop app drops the first folder of every archive (GitHub archives always have one), so
 * zips with files at the root are stored inside a folder to install the same way.
 */
export function wrapPackageZip(bytes: Uint8Array, folder: string): Uint8Array {
	const entries = unzipSync(bytes, {
		filter: (file) => !normalizePath(file.name).endsWith("/")
	});
	return zipSync(
		Object.fromEntries(Object.entries(entries).map(([name, data]) => [`${folder}/${normalizePath(name)}`, data]))
	);
}
