import type { RegistryListing } from "./types";

export const seedListings: RegistryListing[] = [
	{
		schema: "https://maoloader.dev/schemas/plugin.v1.json",
		kind: "plugin",
		slug: "maoloader-example",
		name: "maoloader Example",
		version: "0.1.0",
		entry: "index.js",
		description:
			"Reference plugin showing CSS imports, DataStore, Toast, CommandBar, and optional LCU socket hooks.",
		author: {
			name: "maoloader",
			url: "https://maoloader.dev"
		},
		repository: "https://github.com/steele123/maoloader",
		homepage: "https://maoloader.dev/plugins/maoloader-example",
		tags: ["example", "plugin", "theme", "datastore", "commandbar"],
		compatibility: {
			maoloader: ">=0.1.0"
		},
		files: ["index.js", "styles.css", "README.md", "maoloader.plugin.json"],
		featured: true,
		downloads: 0,
		updated_at: "2026-06-04T00:00:00.000Z",
		assets: {
			package: {
				key: "plugins/maoloader-example/maoloader-example-0.1.0.zip",
				url: "/api/plugins/maoloader-example/download"
			},
			icon: {
				key: "plugins/maoloader-example/icon.png"
			},
			screenshots: []
		}
	}
];
