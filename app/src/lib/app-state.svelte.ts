export type AppStatus = {
	app_name: string;
	version: string;
	injector: string;
	core_exists: boolean;
	paths: LoaderPaths;
};

export type LoaderPaths = {
	base_dir: string;
	config_path: string;
	core_path: string;
	plugins_dir: string;
};

export type LoaderConfig = {
	app: {
		language: string;
		plugins_dir: string;
		league_dir: string;
		disabled_plugins: string;
		activation_mode: string;
	};
	client: {
		use_hotkeys: boolean;
		optimized_client: boolean;
		silent_mode: boolean;
		super_potato: boolean;
		insecure_mode: boolean;
		use_devtools: boolean;
		use_riotclient: boolean;
		use_proxy: boolean;
		debug_port: number;
	};
};

export type PluginEntry = {
	name: string;
	entry: string;
	path: string;
	kind: string;
	hash: string;
	enabled: boolean;
	description?: string;
	author?: string;
	link?: string;
};

export type StorePlugin = {
	name: string;
	slug: string;
	version: string;
	kind: string;
	description: string;
	image: string;
	repo: string;
	detail_url: string;
	download_url: string;
	homepage: string;
	author: string;
	tags: string[];
	theme: boolean;
	auto_update: boolean;
	discord: string;
	readme: string;
	installed: boolean;
	installed_entries: string[];
	installed_repo: string;
	installed_at: number;
};

type StoreInstallResult = {
	name: string;
	installed_path: string;
	plugin_count: number;
	manifest_path: string;
};

type StoreUninstallResult = {
	name: string;
	removed_path: string;
	plugin_count: number;
};

export type RuntimeStatus = {
	runtime_dir: string;
	preload_path: string;
	preload_exists: boolean;
	plugin_count: number;
};

export type NativeCoreStatus = {
	path: string;
	loadable: boolean;
	plugin_count: number;
	datastore_len: number;
	process_kind: number;
	libcef_version: number;
	supported_libcef_major: number;
	libcef_supported: boolean;
	hook_ready: boolean;
	browser_hook_symbols: number;
	renderer_hook_symbols: number;
	command_line_mutations: number;
	plugins_scheme_registrations: number;
	riotclient_scheme_registrations: number;
	riotclient_credential_captures: number;
	riotclient_scheme_creates: number;
	riotclient_proxy_targets: number;
	riotclient_proxy_requests: number;
	riotclient_urlrequest_launches: number;
	riotclient_urlrequest_completes: number;
	riotclient_urlrequest_data_bytes: number;
	riotclient_credentials_ready: boolean;
	plugins_scheme_creates: number;
	plugins_asset_resolves: number;
	renderer_main_contexts: number;
	renderer_preload_executes: number;
	renderer_native_exposes: number;
	browser_main_client_hooks: number;
	browser_native_messages: number;
	browser_background_patches: number;
	devtools_open_attempts: number;
	devtools_open_successes: number;
	diagnostics_trace_records: number;
	diagnostics_rotated: boolean;
	diagnostics_latest_event: string;
	diagnostics_latest_session: string;
	diagnostics_latest_pid: number;
	diagnostics_latest_ts: number;
	error: string;
};

export type ActivationStatus = {
	supported: boolean;
	mode: "universal" | "targeted";
	activated: boolean;
	admin: boolean;
	developer_mode: boolean;
	webview2_installed: boolean;
	message: string;
};

export const APP_STATE_KEY = Symbol("maoloader-app-state");

export class AppState {
	status = $state<AppStatus | null>(null);
	config = $state<LoaderConfig | null>(null);
	plugins = $state<PluginEntry[]>([]);
	storePlugins = $state<StorePlugin[]>([]);
	installStates = $state<Record<string, string>>({});
	runtime = $state<RuntimeStatus | null>(null);
	nativeCore = $state<NativeCoreStatus | null>(null);
	activation = $state<ActivationStatus | null>(null);
	statusError = $state("");
	saveState = $state("");
	leagueDirState = $state("");
	storeState = $state("");
	activationBusy = $state(false);
	activationNotice = $state("");
	runtimeMessage = $state("");
	updateBusy = $state(false);
	updateMessage = $state("");
	updateProgress = $state(0);
	updateAvailableVersion = $state("");
	diagnosticsMessage = $state("");

	async initialize() {
		const { invoke } = await import("@tauri-apps/api/core");

		try {
			await invoke<LoaderPaths>("ensure_base_layout");
			this.status = await invoke<AppStatus>("app_status");
			this.config = await invoke<LoaderConfig>("read_loader_config");
			this.plugins = await invoke<PluginEntry[]>("list_plugins");
			this.runtime = await invoke<RuntimeStatus>("runtime_status");
			this.nativeCore = await invoke<NativeCoreStatus>("native_core_status");
			this.activation = await invoke<ActivationStatus>("activation_status");
		} catch (error) {
			this.statusError = String(error);
		}
	}

	async reveal(path?: string) {
		if (!path) return;

		const { invoke } = await import("@tauri-apps/api/core");
		await invoke("reveal_path", { path });
	}

	async openPluginsFolder() {
		const { invoke } = await import("@tauri-apps/api/core");
		try {
			const path = await invoke<string>("open_plugins_folder");
			this.runtimeMessage = `Opened ${path}`;
		} catch (error) {
			this.runtimeMessage = String(error);
		}
	}

	async saveConfig() {
		if (!this.config) return;

		const { invoke } = await import("@tauri-apps/api/core");
		this.saveState = "Saving...";

		try {
			if (this.activation?.activated && this.config.app.activation_mode !== this.activation.mode) {
				this.saveState = "Deactivate maoloader before changing activation mode";
				return;
			}

			if (this.config.app.activation_mode === "targeted") {
				const validLeagueDir = await invoke<boolean>("validate_league_dir", {
					path: this.config.app.league_dir,
				});

				if (!validLeagueDir) {
					this.leagueDirState = "Targeted activation requires a folder containing LeagueClientUx.exe";
					this.saveState = "League directory is not valid";
					return;
				}
			}

			await invoke("write_loader_config", { config: this.config });
			this.plugins = await invoke<PluginEntry[]>("list_plugins");
			this.activation = await invoke<ActivationStatus>("activation_status");
			this.runtime = await invoke<RuntimeStatus>("runtime_status");
			this.nativeCore = await invoke<NativeCoreStatus>("native_core_status");
			this.saveState = "Saved";
		} catch (error) {
			this.saveState = String(error);
		}
	}

	async validateLeagueDir() {
		if (!this.config) return;

		const { invoke } = await import("@tauri-apps/api/core");
		const valid = await invoke<boolean>("validate_league_dir", {
			path: this.config.app.league_dir,
		});
		this.leagueDirState = valid
			? "LeagueClientUx.exe found"
			: "Select a folder containing LeagueClientUx.exe";
	}

	async findLeagueDir() {
		if (!this.config) return;

		const { invoke } = await import("@tauri-apps/api/core");
		this.leagueDirState = "Searching RiotClientInstalls.json...";

		try {
			const path = await invoke<string | null>("find_league_dir");
			if (path) {
				this.config.app.league_dir = path;
				this.leagueDirState = "League directory found";
			} else {
				this.leagueDirState = "No League installation found in RiotClientInstalls.json";
			}
		} catch (error) {
			this.leagueDirState = String(error);
		}
	}

	async setActivation(active: boolean) {
		const { invoke } = await import("@tauri-apps/api/core");
		this.activationBusy = true;
		this.activationNotice = "";

		try {
			this.activation = await invoke<ActivationStatus>("set_activation", { active });
			if (active && this.activation.activated) {
				this.activationNotice =
					"If League is already open, restart the League client so it can load maoloader.";
			}
		} finally {
			this.activationBusy = false;
		}
	}

	async syncRuntime() {
		const { invoke } = await import("@tauri-apps/api/core");
		this.runtimeMessage = "Syncing...";

		try {
			this.runtime = await invoke<RuntimeStatus>("sync_runtime_assets");
			this.nativeCore = await invoke<NativeCoreStatus>("native_core_status");
			this.runtimeMessage = "Runtime synced";
		} catch (error) {
			this.runtimeMessage = String(error);
		}
	}

	async checkAndInstallUpdate() {
		this.updateBusy = true;
		this.updateProgress = 0;
		this.updateAvailableVersion = "";
		this.updateMessage = "Checking for updates...";

		try {
			const { check } = await import("@tauri-apps/plugin-updater");
			const update = await check();

			if (!update) {
				this.updateMessage = "You are on the latest version";
				return;
			}

			let downloaded = 0;
			let total = 0;
			this.updateAvailableVersion = update.version;
			this.updateMessage = `Downloading v${update.version}...`;

			await update.downloadAndInstall((event) => {
				if (event.event === "Started") {
					total = event.data.contentLength || 0;
					downloaded = 0;
					this.updateProgress = 0;
				} else if (event.event === "Progress") {
					downloaded += event.data.chunkLength;
					this.updateProgress = total ? Math.round((downloaded / total) * 100) : 0;
				} else if (event.event === "Finished") {
					this.updateProgress = 100;
					this.updateMessage = `Installed v${update.version}. Restart maoloader to finish.`;
				}
			});

			this.updateMessage = `Installed v${update.version}. Restart maoloader to finish.`;
		} catch (error) {
			this.updateMessage = String(error);
		} finally {
			this.updateBusy = false;
		}
	}

	async setPluginEnabled(plugin: PluginEntry, enabled: boolean) {
		const { invoke } = await import("@tauri-apps/api/core");
		this.plugins = await invoke<PluginEntry[]>("set_plugin_enabled", {
			toggle: { entry: plugin.entry, enabled },
		});
		this.nativeCore = await invoke<NativeCoreStatus>("native_core_status");
	}

	async loadPluginStore() {
		const { invoke } = await import("@tauri-apps/api/core");
		this.storeState = "Loading plugin registry...";

		try {
			this.storePlugins = await invoke<StorePlugin[]>("fetch_store_plugins");
			this.storeState = this.storePlugins.length
				? `${this.storePlugins.length} registry plugins loaded`
				: "Registry loaded, but no plugins were found";
		} catch (error) {
			this.storeState = String(error);
		}
	}

	async installStorePlugin(plugin: StorePlugin) {
		const { invoke } = await import("@tauri-apps/api/core");
		const key = plugin.slug || plugin.name;
		this.installStates = { ...this.installStates, [key]: "Installing..." };

		try {
			const result = await invoke<StoreInstallResult>("install_store_plugin", {
				plugin: {
					name: plugin.name,
					slug: plugin.slug,
					repo: plugin.repo,
					detail_url: plugin.detail_url,
					download_url: plugin.download_url,
				},
			});
			this.plugins = await invoke<PluginEntry[]>("list_plugins");
			this.runtime = await invoke<RuntimeStatus>("runtime_status");
			this.nativeCore = await invoke<NativeCoreStatus>("native_core_status");
			this.storePlugins = this.storePlugins.map((entry) =>
				entry.slug === plugin.slug
					? {
							...entry,
							installed: true,
							installed_repo: result.manifest_path ? plugin.detail_url || plugin.download_url || plugin.repo : "",
							installed_at: Math.floor(Date.now() / 1000),
							installed_entries: this.plugins
								.filter((local) => local.entry.startsWith(`${plugin.slug}/`))
								.map((local) => local.entry),
						}
					: entry,
			);
			this.installStates = {
				...this.installStates,
				[key]: `Installed ${result.name}; ${result.plugin_count} local plugins detected`,
			};
		} catch (error) {
			this.installStates = { ...this.installStates, [key]: String(error) };
		}
	}

	async uninstallStorePlugin(plugin: StorePlugin) {
		const { invoke } = await import("@tauri-apps/api/core");
		const key = plugin.slug || plugin.name;
		this.installStates = { ...this.installStates, [key]: "Uninstalling..." };

		try {
			const result = await invoke<StoreUninstallResult>("uninstall_store_plugin", {
				plugin: {
					name: plugin.name,
					slug: plugin.slug,
					repo: plugin.repo,
					detail_url: plugin.detail_url,
					download_url: plugin.download_url,
				},
			});
			this.plugins = await invoke<PluginEntry[]>("list_plugins");
			this.runtime = await invoke<RuntimeStatus>("runtime_status");
			this.nativeCore = await invoke<NativeCoreStatus>("native_core_status");
			this.storePlugins = this.storePlugins.map((entry) =>
				entry.slug === plugin.slug
					? {
							...entry,
							installed: false,
							installed_repo: "",
							installed_at: 0,
							installed_entries: [],
						}
					: entry,
			);
			this.installStates = {
				...this.installStates,
				[key]: `Uninstalled ${result.name}; ${result.plugin_count} local plugins detected`,
			};
		} catch (error) {
			this.installStates = { ...this.installStates, [key]: String(error) };
		}
	}

	async openExternal(url?: string) {
		if (!url) return;

		try {
			const { openUrl } = await import("@tauri-apps/plugin-opener");
			await openUrl(url);
		} catch {
			window.open(url, "_blank", "noreferrer");
		}
	}

	async createDiagnosticsBundle() {
		const { invoke } = await import("@tauri-apps/api/core");
		this.diagnosticsMessage = "Collecting diagnostics...";

		try {
			const path = await invoke<string>("create_diagnostics_bundle");
			this.diagnosticsMessage = `Saved diagnostics to ${path}`;
			await this.reveal(path);
		} catch (error) {
			this.diagnosticsMessage = String(error);
		}
	}
}
