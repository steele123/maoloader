<script lang="ts">
  import CpuIcon from "@lucide/svelte/icons/cpu";
  import FolderOpenIcon from "@lucide/svelte/icons/folder-open";
  import MinusIcon from "@lucide/svelte/icons/minus";
  import PlugIcon from "@lucide/svelte/icons/plug";
  import PowerIcon from "@lucide/svelte/icons/power";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
  import SettingsIcon from "@lucide/svelte/icons/settings";
  import ShieldIcon from "@lucide/svelte/icons/shield";
  import XIcon from "@lucide/svelte/icons/x";
  import { onMount } from "svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";

  type AppStatus = {
    app_name: string;
    version: string;
    injector: string;
    core_exists: boolean;
    paths: LoaderPaths;
  };

  type LoaderPaths = {
    base_dir: string;
    config_path: string;
    core_path: string;
    plugins_dir: string;
  };

  type LoaderConfig = {
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

  type PluginEntry = {
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

  type StorePlugin = {
    name: string;
    slug: string;
    description: string;
    image: string;
    repo: string;
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

  type RuntimeStatus = {
    runtime_dir: string;
    preload_path: string;
    preload_exists: boolean;
    plugin_count: number;
  };

  type NativeCoreStatus = {
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
    error: string;
  };

  type ActivationStatus = {
    supported: boolean;
    mode: "universal" | "targeted";
    activated: boolean;
    admin: boolean;
    developer_mode: boolean;
    webview2_installed: boolean;
    message: string;
  };

  type TabId = "overview" | "plugins" | "runtime" | "settings";

  const tabs: { id: TabId; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "plugins", label: "Plugins" },
    { id: "runtime", label: "Runtime" },
    { id: "settings", label: "Settings" },
  ];

  const tabTitles: Record<TabId, string> = {
    overview: "Loader Control Center",
    plugins: "Plugin Manager",
    runtime: "Runtime Diagnostics",
    settings: "Client Settings",
  };

  const modules = [
    {
      name: "Client Detection",
      state: "Not connected",
      detail: "Waiting for a League client session before attaching loader hooks.",
    },
    {
      name: "Plugin Runtime",
      state: "Ready",
      detail: "Plugin management and runtime controls are ready.",
    },
    {
      name: "DLL Bridge",
      state: "Scaffolded",
      detail: "Native loader bridge is present and ready for client hooks.",
    },
  ];

  let status = $state<AppStatus | null>(null);
  let config = $state<LoaderConfig | null>(null);
  let plugins = $state<PluginEntry[]>([]);
  let storePlugins = $state<StorePlugin[]>([]);
  let installStates = $state<Record<string, string>>({});
  let runtime = $state<RuntimeStatus | null>(null);
  let nativeCore = $state<NativeCoreStatus | null>(null);
  let activation = $state<ActivationStatus | null>(null);
  let statusError = $state("");
  let saveState = $state("");
  let leagueDirState = $state("");
  let storeState = $state("");
  let activationBusy = $state(false);
  let runtimeMessage = $state("");
  let activeTab = $state<TabId>("overview");

  onMount(async () => {
    const { invoke } = await import("@tauri-apps/api/core");

    try {
      await invoke<LoaderPaths>("ensure_base_layout");
      status = await invoke<AppStatus>("app_status");
      config = await invoke<LoaderConfig>("read_loader_config");
      plugins = await invoke<PluginEntry[]>("list_plugins");
      runtime = await invoke<RuntimeStatus>("runtime_status");
      nativeCore = await invoke<NativeCoreStatus>("native_core_status");
      activation = await invoke<ActivationStatus>("activation_status");
    } catch (error) {
      statusError = String(error);
    }
  });

  async function reveal(path?: string) {
    if (!path) return;

    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("reveal_path", { path });
  }

  async function openPluginsFolder() {
    const { invoke } = await import("@tauri-apps/api/core");
    try {
      const path = await invoke<string>("open_plugins_folder");
      runtimeMessage = `Opened ${path}`;
    } catch (error) {
      runtimeMessage = String(error);
    }
  }

  async function saveConfig() {
    if (!config) return;

    const { invoke } = await import("@tauri-apps/api/core");
    saveState = "Saving...";

    try {
      if (activation?.activated && config.app.activation_mode !== activation.mode) {
        saveState = "Deactivate maoloader before changing activation mode";
        return;
      }

      if (config.app.activation_mode === "targeted") {
        const validLeagueDir = await invoke<boolean>("validate_league_dir", {
          path: config.app.league_dir,
        });

        if (!validLeagueDir) {
          leagueDirState = "Targeted activation requires a folder containing LeagueClientUx.exe";
          saveState = "League directory is not valid";
          return;
        }
      }

      await invoke("write_loader_config", { config });
      plugins = await invoke<PluginEntry[]>("list_plugins");
      activation = await invoke<ActivationStatus>("activation_status");
      runtime = await invoke<RuntimeStatus>("runtime_status");
      nativeCore = await invoke<NativeCoreStatus>("native_core_status");
      saveState = "Saved";
    } catch (error) {
      saveState = String(error);
    }
  }

  async function validateLeagueDir() {
    if (!config) return;

    const { invoke } = await import("@tauri-apps/api/core");
    const valid = await invoke<boolean>("validate_league_dir", {
      path: config.app.league_dir,
    });
    leagueDirState = valid
      ? "LeagueClientUx.exe found"
      : "Select a folder containing LeagueClientUx.exe";
  }

  async function findLeagueDir() {
    if (!config) return;

    const { invoke } = await import("@tauri-apps/api/core");
    leagueDirState = "Searching RiotClientInstalls.json...";

    try {
      const path = await invoke<string | null>("find_league_dir");
      if (path) {
        config.app.league_dir = path;
        leagueDirState = "League directory found";
      } else {
        leagueDirState = "No League installation found in RiotClientInstalls.json";
      }
    } catch (error) {
      leagueDirState = String(error);
    }
  }

  async function setActivation(active: boolean) {
    const { invoke } = await import("@tauri-apps/api/core");
    activationBusy = true;

    try {
      activation = await invoke<ActivationStatus>("set_activation", { active });
    } finally {
      activationBusy = false;
    }
  }

  async function syncRuntime() {
    const { invoke } = await import("@tauri-apps/api/core");
    runtimeMessage = "Syncing...";

    try {
      runtime = await invoke<RuntimeStatus>("sync_runtime_assets");
      nativeCore = await invoke<NativeCoreStatus>("native_core_status");
      runtimeMessage = "Runtime synced";
    } catch (error) {
      runtimeMessage = String(error);
    }
  }

  async function createSamplePlugin() {
    const { invoke } = await import("@tauri-apps/api/core");
    plugins = await invoke<PluginEntry[]>("create_sample_plugin");
    runtime = await invoke<RuntimeStatus>("runtime_status");
    nativeCore = await invoke<NativeCoreStatus>("native_core_status");
  }

  async function setPluginEnabled(plugin: PluginEntry, enabled: boolean) {
    const { invoke } = await import("@tauri-apps/api/core");
    plugins = await invoke<PluginEntry[]>("set_plugin_enabled", {
      toggle: { entry: plugin.entry, enabled },
    });
    nativeCore = await invoke<NativeCoreStatus>("native_core_status");
  }

  async function loadPluginStore() {
    const { invoke } = await import("@tauri-apps/api/core");
    storeState = "Loading plugin registry...";

    try {
      storePlugins = await invoke<StorePlugin[]>("fetch_store_plugins");
      storeState = storePlugins.length
        ? `${storePlugins.length} registry plugins loaded`
        : "Registry loaded, but no plugins were found";
    } catch (error) {
      storeState = String(error);
    }
  }

  async function installStorePlugin(plugin: StorePlugin) {
    const { invoke } = await import("@tauri-apps/api/core");
    const key = plugin.slug || plugin.name;
    installStates = { ...installStates, [key]: "Installing..." };

    try {
      const result = await invoke<StoreInstallResult>("install_store_plugin", {
        plugin: {
          name: plugin.name,
          slug: plugin.slug,
          repo: plugin.repo,
        },
      });
      plugins = await invoke<PluginEntry[]>("list_plugins");
      runtime = await invoke<RuntimeStatus>("runtime_status");
      nativeCore = await invoke<NativeCoreStatus>("native_core_status");
      storePlugins = storePlugins.map((entry) =>
        entry.slug === plugin.slug
          ? {
              ...entry,
              installed: true,
              installed_repo: result.manifest_path ? plugin.repo : "",
              installed_at: Math.floor(Date.now() / 1000),
              installed_entries: plugins
                .filter((local) => local.entry.startsWith(`${plugin.slug}/`))
                .map((local) => local.entry),
            }
          : entry,
      );
      installStates = {
        ...installStates,
        [key]: `Installed ${result.name}; ${result.plugin_count} local plugins detected`,
      };
    } catch (error) {
      installStates = { ...installStates, [key]: String(error) };
    }
  }

  async function uninstallStorePlugin(plugin: StorePlugin) {
    const { invoke } = await import("@tauri-apps/api/core");
    const key = plugin.slug || plugin.name;
    installStates = { ...installStates, [key]: "Uninstalling..." };

    try {
      const result = await invoke<StoreUninstallResult>("uninstall_store_plugin", {
        plugin: {
          name: plugin.name,
          slug: plugin.slug,
          repo: plugin.repo,
        },
      });
      plugins = await invoke<PluginEntry[]>("list_plugins");
      runtime = await invoke<RuntimeStatus>("runtime_status");
      nativeCore = await invoke<NativeCoreStatus>("native_core_status");
      storePlugins = storePlugins.map((entry) =>
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
      installStates = {
        ...installStates,
        [key]: `Uninstalled ${result.name}; ${result.plugin_count} local plugins detected`,
      };
    } catch (error) {
      installStates = { ...installStates, [key]: String(error) };
    }
  }

  async function openExternal(url?: string) {
    if (!url) return;

    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
    } catch {
      window.open(url, "_blank", "noreferrer");
    }
  }

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
      <Button variant="ghost" size="icon-sm" class="window-button" aria-label="Minimize window" onclick={minimizeWindow}>
        <MinusIcon />
      </Button>
      <Button variant="ghost" size="icon-sm" class="window-button close" aria-label="Close window" onclick={closeWindow}>
        <XIcon />
      </Button>
    </div>
  </div>

<main class="app-shell">
  <aside class="sidebar" aria-label="Primary">
    <div class="brand">
      <div class="mark">M</div>
      <div>
        <strong>maoloader</strong>
        <span>League client loader</span>
      </div>
    </div>

    <nav>
      {#each tabs as tab}
        <Button
          variant="ghost"
          size="sm"
          class={activeTab === tab.id ? "nav-button active" : "nav-button"}
          aria-current={activeTab === tab.id ? "page" : undefined}
          onclick={() => (activeTab = tab.id)}
        >
          {tab.label}
        </Button>
      {/each}
    </nav>
  </aside>

  <section class="workspace">
    <header>
      <div>
        <p class="eyebrow">Control center</p>
        <h1>{tabTitles[activeTab]}</h1>
      </div>
      <div class="version">
        {#if status}
          <span>{status.version}</span>
          <strong>{status.injector}</strong>
        {:else if statusError}
          <span>status unavailable</span>
          <strong>offline</strong>
        {:else}
          <span>loading</span>
          <strong>checking</strong>
        {/if}
      </div>
    </header>

    {#if activeTab === "overview"}
    <section class="home-hero" aria-label="Loader summary">
      <div class="home-hero-copy">
        <p class="eyebrow">Loader workspace</p>
        <h2>Manage injection, plugins, and local runtime files from one quiet control surface.</h2>
        <p>
          {#if status}
            {status.app_name} is ready; injector state is {status.injector}.
          {:else if statusError}
            Status unavailable: {statusError}
          {:else}
            Checking local loader state...
          {/if}
        </p>
      </div>

      <div class="home-hero-panel">
        <Badge variant={activation?.activated ? "secondary" : "outline"}>
          {activation?.activated ? "Active" : "Inactive"}
        </Badge>
        <strong>{runtime?.plugin_count ?? plugins.length} plugins</strong>
        <span>{status?.core_exists ? "core.dll found" : "core.dll missing"}</span>
      </div>
    </section>

    <section class="home-actions" aria-label="Quick actions">
      <Button onclick={() => reveal(status?.paths.base_dir)}>
        <FolderOpenIcon />
        Open Base
      </Button>
      <Button variant="outline" onclick={openPluginsFolder}>
        <PlugIcon />
        Plugins
      </Button>
      <Button variant="outline" onclick={syncRuntime}>
        <RefreshCwIcon />
        Sync Runtime
      </Button>
      {#if activation}
        <Button variant={activation.activated ? "destructive" : "secondary"} disabled={activationBusy} onclick={() => setActivation(!activation?.activated)}>
          <PowerIcon />
          {activationBusy ? "Working" : activation.activated ? "Deactivate" : "Activate"}
        </Button>
      {/if}
    </section>

    <section class="home-grid" aria-label="Current state">
      <article class="home-card">
        <div class="home-card-heading">
          <span><ShieldIcon /></span>
          <div>
            <p class="eyebrow">Activation</p>
            <h3>{activation?.activated ? "Installed" : "Not installed"}</h3>
          </div>
        </div>
        <p>
          {#if activation}
            {activation.mode === "targeted"
              ? "Targeted mode links into the configured League directory."
              : "Universal mode launches the client through the configured loader hook."}
          {:else}
            Activation state is still loading.
          {/if}
        </p>
        <div class="card-badges">
          <Badge variant="outline">{activation?.admin ? "Admin" : "Standard user"}</Badge>
          <Badge variant={activation?.webview2_installed ? "secondary" : "destructive"}>
            {activation?.webview2_installed ? "WebView2 ready" : "WebView2 missing"}
          </Badge>
        </div>
        {#if activation?.message}
          <p class="activation-error">{activation.message}</p>
        {/if}
      </article>

      <article class="home-card">
        <div class="home-card-heading">
          <span><CpuIcon /></span>
          <div>
            <p class="eyebrow">Runtime</p>
            <h3>{runtime?.preload_exists ? "Preload synced" : "Preload pending"}</h3>
          </div>
        </div>
        <p>{runtime?.preload_path ?? "Runtime assets are loading."}</p>
        <div class="card-badges">
          <Badge variant="secondary">{runtime?.plugin_count ?? plugins.length} plugins</Badge>
          <Badge variant="outline">{status?.core_exists ? "core ready" : "core missing"}</Badge>
        </div>
      </article>

      <article class="home-card">
        <div class="home-card-heading">
          <span><SettingsIcon /></span>
          <div>
            <p class="eyebrow">Configuration</p>
            <h3>{config?.app.league_dir ? "League path set" : "League path needed"}</h3>
          </div>
        </div>
        <p>{config?.app.league_dir || "Set the League directory before using targeted activation."}</p>
        <div class="card-badges">
          <Badge variant="outline">{config?.app.activation_mode ?? "loading"}</Badge>
          <Badge variant="outline">debug {config?.client.debug_port ?? "n/a"}</Badge>
        </div>
      </article>
    </section>

    {#if status}
      <section class="path-list" aria-label="Loader paths">
        <button class="path-card" type="button" onclick={() => reveal(status?.paths.config_path)}>
          <span>Config</span>
          <strong>{status.paths.config_path}</strong>
        </button>
        <button class="path-card" type="button" onclick={openPluginsFolder}>
          <span>Plugins</span>
          <strong>{status.paths.plugins_dir}</strong>
        </button>
        <button class="path-card" type="button" onclick={() => reveal(status?.paths.core_path)}>
          <span>Core module</span>
          <strong>{status.paths.core_path}</strong>
        </button>
      </section>
    {/if}
    {/if}

    {#if activeTab === "runtime"}
    {#if runtime}
      <section class="runtime-assets" aria-label="Runtime assets">
        <div>
          <p class="eyebrow">Injected runtime</p>
          <h2>{runtime.preload_exists ? "Preload synced" : "Preload missing"}</h2>
          <p>{runtime.preload_path}</p>
        </div>
        <div class="runtime-actions">
          <Badge variant="secondary">{runtime.plugin_count} plugins</Badge>
          <Button onclick={syncRuntime}>Sync Runtime</Button>
        </div>
        {#if runtimeMessage}
          <p class="save-state">{runtimeMessage}</p>
        {/if}
      </section>
    {/if}

    {#if nativeCore}
      <section class="native-core" aria-label="Native core diagnostics">
        <div>
          <p class="eyebrow">Native core</p>
          <h2>{nativeCore.loadable ? "core.dll loadable" : "core.dll unavailable"}</h2>
          <p>{nativeCore.path}</p>
          {#if nativeCore.error}
            <p class="activation-error">{nativeCore.error}</p>
          {/if}
        </div>
        <div class="native-stats">
          <span>{nativeCore.plugin_count} plugins</span>
          <span>{nativeCore.datastore_len} datastore bytes</span>
          <span>process {nativeCore.process_kind}</span>
          <span>
            CEF {nativeCore.libcef_version || "n/a"} / supported {nativeCore.supported_libcef_major || "n/a"}
          </span>
          <span>{nativeCore.libcef_supported ? "CEF supported" : "CEF unsupported"}</span>
          <span>browser hooks {nativeCore.browser_hook_symbols}/3</span>
          <span>renderer hooks {nativeCore.renderer_hook_symbols}/1</span>
          <span>{nativeCore.command_line_mutations} cmd switches</span>
          <span>{nativeCore.plugins_scheme_registrations} plugin schemes</span>
          <span>{nativeCore.riotclient_scheme_registrations} riot schemes</span>
          <span>{nativeCore.riotclient_credential_captures} riot auth captures</span>
          <span>{nativeCore.riotclient_scheme_creates} riot requests</span>
          <span>{nativeCore.riotclient_proxy_targets} riot targets</span>
          <span>{nativeCore.riotclient_proxy_requests} riot prepared</span>
          <span>{nativeCore.riotclient_urlrequest_launches} riot fetches</span>
          <span>{nativeCore.riotclient_urlrequest_completes} riot completed</span>
          <span>{nativeCore.riotclient_urlrequest_data_bytes} riot bytes</span>
          <span>{nativeCore.riotclient_credentials_ready ? "riot auth ready" : "riot auth pending"}</span>
          <span>{nativeCore.plugins_scheme_creates} scheme requests</span>
          <span>{nativeCore.plugins_asset_resolves} asset hits</span>
          <span>{nativeCore.renderer_main_contexts} renderer contexts</span>
          <span>{nativeCore.renderer_native_exposes} native exposes</span>
          <span>{nativeCore.renderer_preload_executes} preload runs</span>
          <span>{nativeCore.browser_main_client_hooks} browser clients</span>
          <span>{nativeCore.browser_native_messages} native messages</span>
          <span>{nativeCore.browser_background_patches} background patches</span>
          <span>{nativeCore.devtools_open_attempts} devtools requests</span>
          <span>{nativeCore.devtools_open_successes} devtools opened</span>
          <span>{nativeCore.hook_ready ? "hook ready" : "hook pending"}</span>
        </div>
      </section>
    {/if}
    {/if}

    {#if activeTab === "plugins"}
    <section class="plugins" aria-label="Local plugins">
      <div class="settings-heading">
        <div>
          <h2>Local Plugins</h2>
          <p>JavaScript plugins discovered from the configured plugin directory.</p>
        </div>
        <div class="section-actions">
          <button type="button" onclick={createSamplePlugin}>Sample</button>
          <button type="button" onclick={openPluginsFolder}>Open</button>
        </div>
      </div>

      {#if plugins.length > 0}
        <div class="plugin-list">
          {#each plugins as plugin}
            <article class:disabled={!plugin.enabled}>
              <button type="button" onclick={() => reveal(plugin.path)}>
                <span>{plugin.enabled ? "Enabled" : "Disabled"} - {plugin.kind} - {plugin.hash}</span>
                <strong>{plugin.description ? plugin.name : plugin.entry}</strong>
                {#if plugin.description}
                  <small>{plugin.description}</small>
                {/if}
                {#if plugin.author || plugin.link}
                  <em>
                    {#if plugin.author}{plugin.author}{/if}
                    {#if plugin.author && plugin.link} - {/if}
                    {#if plugin.link}{plugin.link}{/if}
                  </em>
                {/if}
                {#if plugin.description}
                  <small>{plugin.entry}</small>
                {/if}
              </button>
              <button type="button" onclick={() => setPluginEnabled(plugin, !plugin.enabled)}>
                {plugin.enabled ? "Disable" : "Enable"}
              </button>
            </article>
          {/each}
        </div>
      {:else}
        <p class="empty-state">No local plugins found yet.</p>
      {/if}
    </section>

    <section class="plugin-store" aria-label="Plugin store">
      <div class="settings-heading">
        <div>
          <h2>Plugin Store</h2>
          <p>Registry preview for compatible plugins.</p>
        </div>
        <div class="section-actions">
          <button type="button" onclick={loadPluginStore}>Refresh</button>
          <button type="button" onclick={() => openExternal("https://github.com/PenguLoader/plugin-store")}>
            Source
          </button>
        </div>
      </div>

      {#if storeState}
        <p class="save-state">{storeState}</p>
      {/if}

      {#if storePlugins.length > 0}
        <div class="store-grid">
          {#each storePlugins as plugin}
            <article>
              <div class="store-icon" aria-hidden="true">
                {#if plugin.image}
                  <img src={plugin.image} alt="" />
                {:else}
                  <span>{plugin.name.slice(0, 1)}</span>
                {/if}
              </div>
              <div>
                <div class="store-heading">
                  <h3>{plugin.name}</h3>
                  <div class="store-actions">
                    <button
                      type="button"
                      disabled={installStates[plugin.slug || plugin.name] === "Installing..."}
                      onclick={() => installStorePlugin(plugin)}
                    >
                      {installStates[plugin.slug || plugin.name] === "Installing..."
                        ? "Installing"
                        : plugin.installed
                          ? "Reinstall"
                          : "Install"}
                    </button>
                    {#if plugin.installed && plugin.installed_repo}
                      <button
                        type="button"
                        disabled={installStates[plugin.slug || plugin.name] === "Uninstalling..."}
                        onclick={() => uninstallStorePlugin(plugin)}
                      >
                        {installStates[plugin.slug || plugin.name] === "Uninstalling..."
                          ? "Removing"
                          : "Uninstall"}
                      </button>
                    {/if}
                    <button type="button" onclick={() => openExternal(plugin.repo)}>Repo</button>
                  </div>
                </div>
                {#if plugin.author}
                  <small>by {plugin.author}</small>
                {/if}
                <p>{plugin.description || "No description provided."}</p>
                {#if installStates[plugin.slug || plugin.name]}
                  <p class="install-state">{installStates[plugin.slug || plugin.name]}</p>
                {/if}
                {#if plugin.installed && plugin.installed_repo}
                  <small>source {plugin.installed_repo}</small>
                {/if}
                <div class="store-tags">
                  {#if plugin.installed}<span>installed</span>{/if}
                  {#if plugin.theme}<span>theme</span>{/if}
                  {#if plugin.auto_update}<span>auto-update</span>{/if}
                  {#each plugin.tags as tag}<span>{tag}</span>{/each}
                </div>
                {#if plugin.installed_entries.length > 0}
                  <small>{plugin.installed_entries.join(", ")}</small>
                {/if}
              </div>
            </article>
          {/each}
        </div>
      {:else}
        <p class="empty-state">Plugin Store is coming soon. Refresh to preview the public registry.</p>
      {/if}
    </section>
    {/if}

    {#if activeTab === "settings"}
    {#if config}
      <section class="settings" aria-label="Client settings">
        <div class="settings-heading">
          <div>
            <h2>Client Settings</h2>
            <p>These persist to the local loader config file.</p>
          </div>
          <button type="button" onclick={saveConfig}>Save</button>
        </div>

        <div class="settings-grid">
          <div class="field-with-actions">
            <label>
              <span>League Directory</span>
              <input bind:value={config.app.league_dir} placeholder="Path to League of Legends" />
            </label>
            <div class="field-actions">
              <button type="button" onclick={validateLeagueDir}>Validate</button>
              <button type="button" onclick={findLeagueDir}>Find</button>
            </div>
            {#if leagueDirState}
              <p class="field-state">{leagueDirState}</p>
            {/if}
          </div>
          <label>
            <span>Plugins Directory</span>
            <input bind:value={config.app.plugins_dir} placeholder="Leave empty for default plugins folder" />
          </label>
          <label>
            <span>Activation Mode</span>
            <select bind:value={config.app.activation_mode}>
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
              bind:value={config.client.debug_port}
              placeholder="0"
            />
          </label>
        </div>

        <div class="toggles">
          <label>
            <input type="checkbox" bind:checked={config.client.use_hotkeys} />
            <span>Hotkeys</span>
          </label>
          <label>
            <input type="checkbox" bind:checked={config.client.optimized_client} />
            <span>Optimized Client</span>
          </label>
          <label>
            <input type="checkbox" bind:checked={config.client.use_devtools} />
            <span>DevTools</span>
          </label>
          <label>
            <input type="checkbox" bind:checked={config.client.silent_mode} />
            <span>Silent Mode</span>
          </label>
          <label>
            <input type="checkbox" bind:checked={config.client.super_potato} />
            <span>Super Potato</span>
          </label>
          <label>
            <input type="checkbox" bind:checked={config.client.insecure_mode} />
            <span>Insecure Mode</span>
          </label>
          <label>
            <input type="checkbox" bind:checked={config.client.use_riotclient} />
            <span>Riot Client Hooks</span>
          </label>
          <label>
            <input type="checkbox" bind:checked={config.client.use_proxy} />
            <span>Riot Proxy</span>
          </label>
        </div>

        {#if saveState}
          <p class="save-state">{saveState}</p>
        {/if}
      </section>
    {/if}
    {/if}
  </section>
</main>
</div>

<style>
:root {
  color: #17201c;
  font-size: 16px;
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
    sans-serif;
  line-height: 1.5;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  -webkit-text-size-adjust: 100%;
}

* {
  box-sizing: border-box;
}

:global(body) {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
  background: transparent;
}

:global(html) {
  background: transparent;
}

.app-frame {
  min-height: 100vh;
  overflow: hidden;
  border: 1px solid rgba(15, 25, 22, 0.18);
  border-radius: 10px;
  background: rgba(244, 241, 232, 0.96);
  box-shadow: 0 18px 52px rgba(0, 0, 0, 0.24);
}

.titlebar {
  display: flex;
  height: 34px;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px 0 14px;
  background: rgba(22, 35, 31, 0.82);
  color: #f7f3ea;
  user-select: none;
}

.titlebar-brand {
  display: flex;
  align-items: center;
  min-width: 0;
  flex: 1;
  font-size: 0.78rem;
  font-weight: 800;
}

.window-controls {
  display: flex;
  gap: 4px;
}

.window-controls :global([data-slot="button"]) {
  display: grid;
  width: 34px;
  height: 26px;
  min-width: 0;
  padding: 0;
  place-items: center;
  border-radius: 6px;
  background: transparent;
  color: #dbe6df;
}

.window-controls :global([data-slot="button"]:hover) {
  background: rgba(255, 255, 255, 0.12);
}

.window-controls :global([data-slot="button"].close:hover) {
  background: #b43228;
  color: #ffffff;
}

.app-shell {
  display: flex;
  min-height: calc(100vh - 34px);
}

.sidebar {
  width: 228px;
  padding: 24px 18px;
  background: #16231f;
  color: #f7f3ea;
}

.brand {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 36px;
}

.mark {
  display: flex;
  width: 40px;
  height: 40px;
  align-items: center;
  justify-content: center;
  border: 1px solid #6ebf8d;
  border-radius: 8px;
  background: #23342e;
  color: #9be2b2;
  font-weight: 800;
}

.brand strong,
.brand span {
  display: block;
}

.brand span {
  color: #a9bcb3;
  font-size: 0.82rem;
}

nav {
  display: grid;
  gap: 8px;
}

nav :global([data-slot="button"]) {
  justify-content: flex-start;
  width: 100%;
  min-width: 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: transparent;
  color: #c8d4ce;
  font-weight: 500;
  text-align: left;
  text-decoration: none;
}

nav :global([data-slot="button"].active),
nav :global([data-slot="button"]:hover) {
  background: #273d35;
  color: #ffffff;
}

.workspace {
  flex: 1;
  padding: 28px;
  overflow: auto;
}

header {
  display: flex;
  gap: 20px;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 24px;
}

.eyebrow {
  margin: 0 0 6px;
  color: #5f7168;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h1,
h2,
h3,
p {
  margin-top: 0;
}

h1 {
  margin-bottom: 0;
  color: #17201c;
  font-size: 2rem;
  line-height: 1.1;
}

.version {
  min-width: 140px;
  padding: 10px 12px;
  border: 1px solid #d8d0c0;
  border-radius: 8px;
  background: #fffdf7;
  text-align: right;
}

.version span,
.version strong {
  display: block;
}

.version span {
  color: #66766e;
  font-size: 0.8rem;
}

button {
  min-width: 116px;
  padding: 10px 14px;
  border: 0;
  border-radius: 8px;
  background: #9be2b2;
  color: #14211c;
  cursor: pointer;
  font: inherit;
  font-weight: 800;
}

button:hover {
  background: #b8efc8;
}

article,
.settings,
.plugins,
.runtime-assets,
.native-core,
.home-card,
.path-card {
  border: 1px solid #d8d0c0;
  border-radius: 8px;
  background: #fffdf7;
}

article {
  padding: 18px;
}

.home-hero {
  display: flex;
  gap: 20px;
  align-items: stretch;
  justify-content: space-between;
  margin-bottom: 16px;
  padding: 22px;
  border: 1px solid rgba(110, 191, 141, 0.38);
  border-radius: 8px;
  background: linear-gradient(135deg, #ffffff, #edf4ee);
}

.home-hero-copy {
  display: grid;
  gap: 6px;
  max-width: 680px;
}

.home-hero h2 {
  margin-bottom: 0;
  font-size: 1.65rem;
  line-height: 1.15;
}

.home-hero p {
  margin-bottom: 0;
  color: #5f7168;
}

.home-hero-panel {
  display: grid;
  min-width: 170px;
  align-content: center;
  gap: 6px;
  padding: 14px;
  border: 1px solid #d8d0c0;
  border-radius: 8px;
  background: rgba(255, 253, 247, 0.86);
}

.home-hero-panel strong {
  color: #17201c;
  font-size: 1.4rem;
  line-height: 1;
}

.home-hero-panel span {
  color: #66766e;
  font-size: 0.84rem;
  font-weight: 700;
}

.home-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.home-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 20px;
}

.home-card {
  display: grid;
  align-content: start;
  gap: 12px;
  padding: 18px;
}

.home-card-heading {
  display: flex;
  gap: 12px;
  align-items: center;
}

.home-card-heading > span {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 8px;
  background: #edf0e8;
  color: #235137;
}

.home-card-heading h3 {
  margin-bottom: 0;
  font-size: 1.05rem;
}

.home-card p {
  margin-bottom: 0;
  color: #5f7168;
  overflow-wrap: anywhere;
}

.card-badges {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.path-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.path-card {
  min-width: 0;
  padding: 12px;
  color: inherit;
  text-align: left;
}

.path-card:hover {
  background: #ffffff;
}

.path-card span,
.path-card strong {
  display: block;
}

.path-card span {
  margin-bottom: 4px;
  color: #66766e;
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
}

.path-card strong {
  overflow: hidden;
  font-size: 0.82rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.runtime-assets {
  display: grid;
  gap: 12px;
  padding: 20px;
  margin-bottom: 20px;
}

.runtime-assets h2 {
  margin-bottom: 6px;
  font-size: 1.25rem;
}

.runtime-assets p {
  margin-bottom: 0;
  color: #5f7168;
  overflow-wrap: anywhere;
}

.native-core {
  display: grid;
  gap: 12px;
  padding: 20px;
  margin-bottom: 20px;
}

.native-core h2 {
  margin-bottom: 6px;
  font-size: 1.25rem;
}

.native-core p {
  margin-bottom: 0;
  color: #5f7168;
  overflow-wrap: anywhere;
}

.native-stats {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.native-stats span {
  padding: 8px 10px;
  border-radius: 8px;
  background: #edf0e8;
  color: #33443d;
  font-size: 0.84rem;
  font-weight: 800;
}

.runtime-actions,
.section-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.activation-error {
  margin-top: 10px;
  color: #a13422 !important;
  font-weight: 800;
}

button:disabled {
  cursor: wait;
  opacity: 0.7;
}

.settings {
  padding: 20px;
}

.plugins {
  padding: 20px;
  margin-bottom: 20px;
}

.plugin-store {
  padding: 20px;
  margin-bottom: 20px;
}

.settings-heading {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 18px;
}

.settings-heading h2 {
  margin-bottom: 4px;
  font-size: 1.2rem;
}

.settings-heading p {
  margin-bottom: 0;
  color: #5f7168;
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 16px;
}

.settings-grid label {
  display: grid;
  gap: 6px;
}

.field-with-actions {
  display: grid;
  gap: 8px;
}

.field-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.field-actions button {
  min-width: 96px;
  padding: 8px 10px;
}

.field-state {
  margin: 0;
  color: #5f7168;
  font-size: 0.86rem;
  font-weight: 700;
}

.settings-grid span {
  color: #34453e;
  font-size: 0.84rem;
  font-weight: 800;
}

.settings-grid input {
  width: 100%;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid #d8d0c0;
  border-radius: 8px;
  background: #fefbf3;
  color: #17201c;
  font: inherit;
}

.settings-grid select {
  width: 100%;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid #d8d0c0;
  border-radius: 8px;
  background: #fefbf3;
  color: #17201c;
  font: inherit;
}

.toggles {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.toggles label {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  border-radius: 8px;
  background: #edf0e8;
  color: #33443d;
  font-weight: 700;
}

.save-state {
  margin: 14px 0 0;
  color: #235137;
  font-weight: 800;
}

.plugin-list {
  display: grid;
  gap: 10px;
}

.plugin-list article {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: stretch;
  padding: 0;
  border: 0;
  background: transparent;
}

.plugin-list article.disabled {
  opacity: 0.72;
}

.plugin-list button {
  width: 100%;
  padding: 12px;
  background: #edf0e8;
  color: #17201c;
  text-align: left;
}

.plugin-list article > button:last-child {
  width: auto;
  min-width: 92px;
  text-align: center;
}

.plugin-list span,
.plugin-list strong,
.plugin-list small,
.plugin-list em {
  display: block;
}

.plugin-list span {
  color: #66766e;
  font-size: 0.78rem;
  font-weight: 800;
  text-transform: uppercase;
}

.plugin-list small,
.plugin-list em {
  margin-top: 4px;
  color: #52635b;
  font-size: 0.84rem;
  font-style: normal;
}

.empty-state {
  margin-bottom: 0;
  color: #5f7168;
}

.store-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 14px;
}

.store-grid article {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  gap: 12px;
  padding: 14px;
}

.store-icon {
  display: flex;
  width: 44px;
  height: 44px;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 8px;
  background: #edf0e8;
  color: #235137;
  font-weight: 900;
}

.store-icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.store-heading {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  justify-content: space-between;
}

.store-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.store-heading h3 {
  margin-bottom: 6px;
  font-size: 1rem;
}

.store-heading button {
  min-width: 70px;
  padding: 7px 10px;
}

.store-grid p {
  margin-bottom: 10px;
  color: #5f7168;
  font-size: 0.9rem;
}

.store-grid small {
  display: block;
  margin: -2px 0 8px;
  color: #52635b;
  font-size: 0.8rem;
  font-weight: 800;
}

.install-state {
  margin-top: -4px;
  color: #235137 !important;
  font-weight: 800;
}

.store-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.store-tags span {
  padding: 4px 7px;
  border-radius: 999px;
  background: #e8f5ec;
  color: #235137;
  font-size: 0.72rem;
  font-weight: 800;
}

@media (max-width: 860px) {
  .app-shell {
    display: block;
  }

  .sidebar {
    width: auto;
    padding: 16px;
  }

  .brand {
    margin-bottom: 16px;
  }

  nav {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  nav :global([data-slot="button"]) {
    text-align: center;
  }

  .workspace {
    padding: 20px;
  }

  .home-hero,
  header {
    align-items: stretch;
    flex-direction: column;
  }

  .version {
    text-align: left;
  }

  .home-grid,
  .path-list,
  .settings-grid,
  .store-grid {
    grid-template-columns: 1fr;
  }

  .plugin-list article {
    grid-template-columns: 1fr;
  }
}
</style>
