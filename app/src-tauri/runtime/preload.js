(function () {
  // Stamped with the app's version when the maoloader app writes this file (see runtime.rs).
  // Compared with a pattern, not the placeholder text, since every copy of that text gets replaced.
  const MAOLOADER_VERSION = "__MAOLOADER_VERSION__";
  const HAS_MAOLOADER_VERSION = /^\d+\.\d+\.\d+/.test(MAOLOADER_VERSION);
  const MAOLOADER_RELEASES_URL = "https://maoloader.com/api/releases/latest.json";
  const MAOLOADER_DOWNLOAD_URL = "https://maoloader.com/download";
  const pengu = window.Pengu || {};
  const plugins = Array.isArray(pengu.plugins) ? pengu.plugins : [];
  const native = window.__native || {};
  try {
    delete window.__native;
  } catch {}
  const disabled = new Set(
    String(pengu.disabledPlugins || "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );

  function fnv1a(value) {
    const data = new TextEncoder().encode(String(value).toLowerCase().replace(/\\/g, "/"));
    let hash = 0x811c9dc5;

    for (const byte of data) {
      hash ^= byte;
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }

    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function isDisabled(entry) {
    return disabled.has(fnv1a(entry));
  }

  for (let index = plugins.length - 1; index >= 0; index--) {
    const entry = plugins[index];
    if (isDisabled(entry) || /^@default\//i.test(entry) || !isLoadablePluginEntry(entry)) {
      plugins.splice(index, 1);
    }
  }

  function pluginUrl(entry) {
    return `https://plugins/${entry}`;
  }

  function normalizePluginEntry(entry) {
    return String(entry || "")
      .replace(/^https:\/\/plugins\//i, "")
      .replace(/^[\\/]+/, "")
      .replace(/\\/g, "/")
      .split(/[?#]/)[0];
  }

  function resolvePluginImport(specifier, baseEntry) {
    if (/^https:\/\/plugins\//i.test(specifier)) {
      return normalizePluginEntry(specifier);
    }

    if (!/^(?:\.{1,2}\/|\/)/.test(specifier)) {
      throw new Error(`Bare plugin import "${specifier}" is not supported.`);
    }

    const base = pluginUrl(normalizePluginEntry(baseEntry));
    return normalizePluginEntry(new URL(specifier, base).href);
  }

  function pluginRootFromPath(path) {
    const normalized = normalizePluginEntry(path);
    const parts = normalized.split("/").filter(Boolean);

    if (parts.length === 0 || (parts.length === 1 && isScriptPluginEntry(parts[0]))) {
      return undefined;
    }

    if (parts[0]?.startsWith("@") && parts.length >= 2) {
      return `${parts[0]}/${parts[1]}`;
    }

    return parts[0];
  }

  function pluginExtension(entry) {
    return String(entry).split("?")[0].split("#")[0].split(".").pop()?.toLowerCase() || "";
  }

  function isScriptPluginEntry(entry) {
    return /(?:^|\/)[^/]+\.(?:js|mjs|cjs)$/i.test(String(entry));
  }

  function isStylePluginEntry(entry) {
    return /(?:^|\/)[^/]+\.css$/i.test(String(entry));
  }

  function isLoadablePluginEntry(entry) {
    return typeof entry === "string" && (isScriptPluginEntry(entry) || isStylePluginEntry(entry));
  }

  function looksLikeCommonJs(source) {
    return /\bmodule\.exports\b|\bexports\.[\w$]+\s*=|\bexports\s*\[|Object\.defineProperty\s*\(\s*exports\b/.test(
      source,
    );
  }

  function looksLikeModule(source) {
    return /^\s*import\s+|^\s*export\s+/m.test(source);
  }

  if (!Object.hasOwn) {
    Object.hasOwn = function (object, property) {
      return Object.prototype.hasOwnProperty.call(object, property);
    };
  }

  if (!Array.prototype.at) {
    Array.prototype.at = function (index) {
      let offset = Number(index) || 0;
      if (offset < 0) {
        offset += this.length;
      }
      return offset < 0 || offset >= this.length ? undefined : this[offset];
    };
  }

  if (!window.Pengu) {
    window.Pengu = pengu;
  }

  let windowLoaded = typeof document !== "undefined" && document.readyState === "complete";
  if (typeof window.addEventListener === "function") {
    window.addEventListener("load", function () {
      windowLoaded = true;
    });
  }

  if (typeof window.addEventListener === "function") {
    const windowAddEventListener = window.addEventListener;
    window.addEventListener = function (type, listener, options) {
      if (type === "load" && windowLoaded) {
        setTimeout(listener, 1);
      } else if (
        type === "DOMContentLoaded" &&
        typeof document !== "undefined" &&
        document.readyState === "complete"
      ) {
        setTimeout(listener, 1);
      } else {
        windowAddEventListener.call(this, type, listener, options);
      }
    };
  }

  if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    const documentAddEventListener = document.addEventListener;
    document.addEventListener = function (type, listener, options) {
      if (
        type === "DOMContentLoaded" &&
        (document.readyState === "interactive" || document.readyState === "complete")
      ) {
        setTimeout(listener, 1);
      } else {
        documentAddEventListener.call(this, type, listener, options);
      }
    };
  }

  const superPotatoGlobalStyle = `
*:not(.store-loading):not(.spinner):not([animated]):not(.lol-loading-screen-spinner):not(.lol-uikit-vignette-celebration-layer *), *:before, *:after {
  transition: none !important;
  transition-property: none !important;
}`;
  const superPotatoShadowStyle = `
*:not(.spinner):not([animated]), *:before, *:after {
  transition: none !important;
  transition-property: none !important;
}`;

  function enableSuperPotato() {
    if (typeof document === "undefined") {
      return;
    }

    const style = document.createElement?.("style");
    if (style && document.body?.appendChild) {
      style.textContent = superPotatoGlobalStyle;
      document.body.appendChild(style);
    }

    if (typeof document.createElement === "function") {
      const createElement = document.createElement;
      document.createElement = function (name, options) {
        const element = createElement.call(this, name, options);
        if (element?.shadowRoot?.appendChild) {
          const shadowStyle = createElement.call(this, "style");
          shadowStyle.textContent = superPotatoShadowStyle;
          element.shadowRoot.appendChild(shadowStyle);
        }
        return element;
      };
    }

    fetch("/lol-settings/v1/local/lol-user-experience", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        schemaVersion: 3,
        data: { potatoModeEnabled: true },
      }),
    });
  }

  if (pengu.superPotato) {
    window.addEventListener("load", enableSuperPotato);
  }

  let datastore;

  function data() {
    if (datastore === undefined) {
      try {
        datastore = new Map(Object.entries(JSON.parse(native.LoadDataStore())));
      } catch {
        datastore = new Map();
      }
    }

    return datastore;
  }

  function commit() {
    if (typeof native.SaveDataStore === "function") {
      native.SaveDataStore(JSON.stringify(Object.fromEntries(data())));
    }
  }

  window.DataStore = {
    has(key) {
      return data().has(String(key));
    },
    get(key, fallback) {
      if (typeof key !== "string") {
        return undefined;
      }

      return data().has(key) ? data().get(key) : fallback;
    },
    set(key, value) {
      if (typeof key !== "string") {
        return false;
      }

      data().set(key, value);
      commit();
      return true;
    },
    remove(key) {
      const removed = data().delete(String(key));
      commit();
      return removed;
    },
  };

  const pluginReports = [];
  const pluginLogs = [];
  let activePluginEntry;
  const PLUGIN_FAILURES_KEY = "maoloader-plugin-failures";
  const PLUGIN_SAFE_MODE_THRESHOLD = 3;

  function shortError(error) {
    if (!error) {
      return "";
    }
    if (error instanceof Error) {
      return error.stack || error.message || String(error);
    }
    return String(error);
  }

  function pluginReport(entry, stage, status, detail = {}) {
    const report = {
      entry: normalizePluginEntry(entry),
      root: pluginRootFromPath(entry) || normalizePluginEntry(entry),
      stage,
      status,
      ts: Date.now(),
      ...detail,
    };
    pluginReports.push(report);
    if (pluginReports.length > 300) {
      pluginReports.splice(0, pluginReports.length - 300);
    }
    return report;
  }

  function failureCounts() {
    const value = window.DataStore?.get?.(PLUGIN_FAILURES_KEY, {});
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function pluginFailureCount(entry) {
    const counts = failureCounts();
    return Number(counts[normalizePluginEntry(entry)] || 0);
  }

  function setPluginFailureCount(entry, count) {
    const counts = failureCounts();
    const key = normalizePluginEntry(entry);
    if (count > 0) {
      counts[key] = count;
    } else {
      delete counts[key];
    }
    window.DataStore?.set?.(PLUGIN_FAILURES_KEY, counts);
  }

  function recordPluginFailure(entry, error) {
    const count = pluginFailureCount(entry) + 1;
    setPluginFailureCount(entry, count);
    return pluginReport(entry, "safe-mode", "failure-counted", {
      failures: count,
      threshold: PLUGIN_SAFE_MODE_THRESHOLD,
      error: shortError(error),
    });
  }

  function resetPluginFailure(entry) {
    setPluginFailureCount(entry, 0);
  }

  function withPluginExecution(entry, action) {
    const previous = activePluginEntry;
    activePluginEntry = normalizePluginEntry(entry);
    try {
      return action();
    } finally {
      activePluginEntry = previous;
    }
  }

  function wrapPluginCallback(entry, callback) {
    return function (...args) {
      return withPluginExecution(entry, () => callback.apply(this, args));
    };
  }

  function installConsoleCapture() {
    if (typeof console !== "object" || !console) {
      return;
    }

    for (const level of ["debug", "log", "info", "warn", "error"]) {
      const original = console[level];
      if (typeof original !== "function") {
        continue;
      }

      console[level] = function (...args) {
        if (activePluginEntry) {
          pluginLogs.push({
            entry: activePluginEntry,
            root: pluginRootFromPath(activePluginEntry) || activePluginEntry,
            level,
            ts: Date.now(),
            message: args.map((arg) => (typeof arg === "string" ? arg : shortError(arg))).join(" "),
          });
          if (pluginLogs.length > 500) {
            pluginLogs.splice(0, pluginLogs.length - 500);
          }
        }
        return original.apply(this, args);
      };
    }
  }

  installConsoleCapture();

  Object.defineProperty(window, "__maoloaderPluginReports", {
    value: pluginReports,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  Object.defineProperty(window, "__maoloaderPluginLogs", {
    value: pluginLogs,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  Object.defineProperty(window, "__maoloaderResetPluginSafeMode", {
    value(entry) {
      if (entry) {
        resetPluginFailure(entry);
      } else {
        window.DataStore?.remove?.(PLUGIN_FAILURES_KEY);
      }
      return true;
    },
    enumerable: false,
    configurable: false,
    writable: false,
  });

  function pluginFsCallerRoot() {
    return pluginRootFromPath(window.getScriptPath?.());
  }

  function pluginFsNative(operation, path, content, flag) {
    if (typeof native.PluginFS !== "function") {
      return undefined;
    }

    const root = pluginFsCallerRoot();
    if (!root) {
      return undefined;
    }

    try {
      const result = JSON.parse(native.PluginFS(operation, root, String(path || ""), content ?? "", Boolean(flag)));
      return result?.ok ? result.value : undefined;
    } catch (error) {
      console.warn("[PluginFS] Native operation failed.", error);
      return undefined;
    }
  }

  window.PluginFS = {
    read(path) {
      return Promise.resolve(pluginFsNative("read", path));
    },
    write(path, content, enableAppendMode = false) {
      return Promise.resolve(pluginFsNative("write", path, String(content ?? ""), enableAppendMode) === true);
    },
    mkdir(path) {
      return Promise.resolve(pluginFsNative("mkdir", path) === true);
    },
    stat(path) {
      return Promise.resolve(pluginFsNative("stat", path));
    },
    ls(path) {
      return Promise.resolve(pluginFsNative("ls", path));
    },
    rm(path, recursively = false) {
      return Promise.resolve(Number(pluginFsNative("rm", path, "", recursively) || 0));
    },
  };

  window.openDevTools = function () {
    if (typeof native.OpenDevTools === "function") {
      native.OpenDevTools();
    }
  };

  window.openPluginsFolder = function (path) {
    if (typeof native.OpenPluginsFolder !== "function") {
      return false;
    }

    if (typeof path === "string" && path) {
      let subpath = path;
      if (!subpath.startsWith("..") && !/[\\/]\.\.[\\/]/.test(subpath)) {
        if (/^[\\/]/.test(subpath)) {
          subpath = subpath.substring(1);
        }
        return native.OpenPluginsFolder(subpath);
      }
    }

    return native.OpenPluginsFolder();
  };

  window.reloadClient = function () {
    if (typeof native.ReloadClient === "function") {
      native.ReloadClient();
    }
  };

  window.restartClient = function () {
    fetch("/riotclient/kill-and-restart-ux", {
      method: "POST",
    });
  };

  window.getScriptPath = function () {
    const stack = new Error().stack;
    return stack?.match(/(?:http|https):\/\/[^\s]+\.js/g)?.[0];
  };

  const nsVisualEffectMaterial = {
    Titlebar: 3,
    Selection: 4,
    Menu: 5,
    Popover: 6,
    Sidebar: 7,
    HeaderView: 10,
    Sheet: 11,
    WindowBackground: 12,
    HudWindow: 13,
    FullScreenUI: 15,
    Tooltip: 17,
    ContentBackground: 18,
    UnderWindowBackground: 21,
    UnderPageBackground: 22,
  };
  const winToMacMaterial = {
    transparent: nsVisualEffectMaterial.UnderWindowBackground,
    blurbehind: nsVisualEffectMaterial.HudWindow,
    acrylic: nsVisualEffectMaterial.FullScreenUI,
    unified: nsVisualEffectMaterial.Popover,
    mica: nsVisualEffectMaterial.HeaderView,
  };
  const win11MicaMaterial = {
    auto: 0,
    none: 1,
    mica: 2,
    acrylic: 3,
    tabbed: 4,
  };
  const winBackdropType = {
    transparent: 0,
    blurbehind: 1,
    acrylic: 2,
    unified: 3,
    mica: 4,
  };

  function parseHexColor(color) {
    if (typeof color === "string" && color.startsWith("#")) {
      const hex = color.slice(1);
      const size = hex.length;
      let index = 0;
      const step = size > 4 ? 1 : 0;
      const r = Number.parseInt(hex[index] + hex[(index += step)], 16);
      const g = Number.parseInt(hex[++index] + hex[(index += step)], 16);
      const b = Number.parseInt(hex[++index] + hex[(index += step)], 16);
      let a = 255;

      if (size === 4 || size === 8) {
        a = Number.parseInt(hex[++index] + hex[(index += step)], 16);
      }

      return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
    }

    return 0;
  }

  function applyWindowEffectMac(name, options) {
    if (typeof native.SetWindowVibrancy !== "function") {
      return;
    }

    if (name === "vibrancy") {
      const material = String(options.material);
      const state = options.alwaysOn ? 1 : 0;
      if (material in nsVisualEffectMaterial) {
        native.SetWindowVibrancy(nsVisualEffectMaterial[material], state);
      } else {
        console.warn("Unsupported vibrancy material: %s", material);
      }
    } else if (name in winToMacMaterial) {
      native.SetWindowVibrancy(winToMacMaterial[name], 0);
    } else {
      console.warn("Unknown window visual effect: %s", name);
    }
  }

  function applyWindowEffectWin(name, options) {
    if (typeof native.SetWindowVibrancy !== "function") {
      return;
    }

    if (name in winBackdropType) {
      if (name === "mica") {
        const material = String(options.material || "mica");
        if (material in win11MicaMaterial) {
          native.SetWindowVibrancy(winBackdropType.mica, win11MicaMaterial[material]);
        } else {
          console.warn("Unsupported mica material: %s", material);
        }
      } else {
        native.SetWindowVibrancy(winBackdropType[name], parseHexColor(options.color));
      }
    } else {
      console.warn("Unknown window visual effect: %s", name);
    }
  }

  window.Effect = {
    apply(name, options) {
      const effectOptions = options || {};
      if (window.Pengu?.isMac) {
        applyWindowEffectMac(name, effectOptions);
      } else {
        applyWindowEffectWin(name, effectOptions);
      }
    },
    clear() {
      if (typeof native.SetWindowVibrancy === "function") {
        native.SetWindowVibrancy(null);
      }
    },
    setTheme(theme) {
      if (typeof native.SetWindowTheme === "function") {
        if (theme === "light") {
          native.SetWindowTheme(false);
        } else if (theme === "dark") {
          native.SetWindowTheme(true);
        }
      }
    },
  };

  function createDomEvent(type, detail) {
    if (typeof CustomEvent === "function") {
      return new CustomEvent(type, { detail });
    }
    return { type, detail };
  }

  const queueId = {
    BlindPick: 430,
    ARAM: 450,
    PracticeTool: 0xffff,
  };

  function createLobby(id) {
    let body = { queueId: id };
    if (id === queueId.PracticeTool) {
      body = {
        customGameLobby: {
          configuration: {
            gameMode: "PRACTICETOOL",
            gameMutator: "",
            gameServerRegion: "",
            mapId: 11,
            mutators: { id: 1 },
            spectatorPolicy: "AllAllowed",
            teamSize: 5,
          },
          lobbyName: `Game ${Math.floor(Math.random() * 0xffffffff).toString(36)}`,
          lobbyPassword: null,
        },
        isCustom: true,
      };
    }

    return fetch("/lol-lobby/v2/lobby", {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  function quitPvpChampSelect() {
    const params = new URLSearchParams({
      destination: "lcdsServiceProxy",
      method: "call",
      args: JSON.stringify(["", "teambuilder-draft", "quitV2", ""]),
    });
    return fetch(`/lol-login/v1/session/invoke?${params.toString()}`, {
      method: "POST",
    });
  }

  const commandActions = [
    {
      name: "Visit maoloader home",
      legend: "maoloader.com",
      group: "maoloader",
      perform: () => window.open?.("https://maoloader.com", "_blank"),
    },
    {
      name: "Open DevTools",
      legend: "F12",
      tags: ["dev", "console"],
      group: "maoloader",
      perform: () => window.openDevTools?.(),
    },
    {
      name: "Open plugins folder",
      tags: ["dev"],
      group: "maoloader",
      perform: () => window.openPluginsFolder?.(),
    },
    {
      name: "Reload plugins",
      legend: "Reload client",
      tags: ["plugin", "reload"],
      group: "maoloader",
      perform: () => {
        window.Toast?.info?.({
          title: "Reloading client",
          description: "The League renderer has to reload before plugins run again.",
        });
        window.reloadClient?.();
      },
    },
    {
      name: "Reload client",
      legend: "Ctrl Shift R",
      hidden: true,
      group: "maoloader",
      perform: () => window.reloadClient?.(),
    },
    {
      name: "Restart client",
      legend: "Ctrl Shift Enter",
      hidden: true,
      group: "maoloader",
      perform: () => window.restartClient?.(),
    },
    {
      name: () => (loadingScreenEnabled() ? "Use Riot's loading screen" : "Use maoloader's loading screen"),
      tags: ["loading", "boot", "splash"],
      group: "maoloader",
      perform: () => {
        const enabled = !loadingScreenEnabled();
        window.DataStore?.set?.(LOADING_SCREEN_KEY, enabled);
        window.Toast?.info?.({
          title: enabled ? "maoloader loading screen on" : "Riot loading screen on",
          description: "Takes effect the next time the client loads.",
        });
      },
    },
    {
      name: "Create ARAM lobby",
      group: "lobby",
      perform: () => createLobby(queueId.ARAM),
    },
    {
      name: "Create normal lobby",
      group: "lobby",
      perform: () => createLobby(queueId.BlindPick),
    },
    {
      name: "Create practice tool",
      group: "lobby",
      perform: () => createLobby(queueId.PracticeTool),
    },
    {
      name: "Quit PvP champ select",
      hidden: true,
      group: "uncategorized",
      perform: () => quitPvpChampSelect(),
    },
  ];

  function emitCommandBarEvent(type) {
    if (typeof window.dispatchEvent === "function") {
      window.dispatchEvent(createDomEvent(type, { actions: commandActions.slice() }));
    }
  }

  const SURFACE_TAG_NAME = "maoloader-surface";

  function ensureSurfaceElementDefined() {
    if (typeof customElements === "undefined" || customElements.get?.(SURFACE_TAG_NAME)) {
      return;
    }

    class MaoloaderSurface extends HTMLElement {
      constructor() {
        super();
        if (!this.shadowRoot) {
          try {
            this.attachShadow({ mode: "open", delegatesFocus: true });
          } catch {
            this.attachShadow({ mode: "open" });
          }
        }
      }
    }

    try {
      customElements.define(SURFACE_TAG_NAME, MaoloaderSurface);
    } catch {
      // The client can reload injected resources without a full process restart.
    }
  }

  function createShadowSurface(id, styleText, host = document.body) {
    if (typeof document === "undefined" || !document.createElement) {
      return undefined;
    }

    ensureSurfaceElementDefined();

    let surface = document.getElementById?.(id);
    if (!surface) {
      surface = document.createElement(SURFACE_TAG_NAME);
      surface.id = id;
      surface.className = id;
      (host?.appendChild ? host : document.body)?.appendChild?.(surface);
    } else if (!surface.className) {
      surface.className = id;
    }

    if (styleText) {
      surface.style.cssText = styleText;
    }

    if (!surface.shadowRoot && surface.attachShadow) {
      try {
        surface.attachShadow({ mode: "open", delegatesFocus: true });
      } catch {
        surface.attachShadow({ mode: "open" });
      }
    }

    surface.__maoloaderShadowRoot = surface.shadowRoot || surface;
    return surface;
  }

  // The client can rebuild the body after a surface is cached, leaving a blank copy (same id,
  // empty shadow root) on the page while the cached element is detached and renders nowhere.
  function isDetached(element) {
    return element?.isConnected === false;
  }

  let commandBarRoot;
  let commandBarSearch = "";
  let commandBarVisible = false;
  let commandBarActiveIndex = 0;

  function commandActionText(value) {
    return typeof value === "function" ? String(value()) : String(value ?? "");
  }

  function visibleCommandActions() {
    const query = commandBarSearch.trim().toLowerCase();
    return commandActions.filter((action) => {
      const haystack = [
        commandActionText(action.name),
        commandActionText(action.legend),
        commandActionText(action.group),
        ...(Array.isArray(action.tags) ? action.tags : []),
      ]
        .join(" ")
        .toLowerCase();

      if (!query) {
        return !action.hidden;
      }

      return haystack.includes(query);
    });
  }

  function closeCommandBar() {
    commandBarVisible = false;
    renderCommandBar();
  }

  function runCommandAction(action) {
    try {
      action?.perform?.(action.id);
    } finally {
      closeCommandBar();
    }
  }

  function setCommandBarActiveIndex(index) {
    const actions = visibleCommandActions();
    if (actions.length === 0) {
      commandBarActiveIndex = 0;
    } else {
      commandBarActiveIndex = Math.max(0, Math.min(index, actions.length - 1));
    }
  }

  function ensureCommandBarRoot() {
    if (typeof document === "undefined" || !document.body?.appendChild || !document.createElement) {
      return undefined;
    }

    if (!commandBarRoot || isDetached(commandBarRoot)) {
      commandBarRoot = createShadowSurface("maoloader-commandbar-root", "position:fixed;inset:0;z-index:2147483646;display:none;");
    }

    return commandBarRoot;
  }

  // Exactly one row looks selected: the one Enter will run, whether picked by keyboard or mouse.
  function paintCommandRows(list) {
    for (const row of list?.children || []) {
      const active = Number(row.dataset?.index) === commandBarActiveIndex;
      if (row.dataset) {
        row.dataset.active = String(active);
      }
      row.style.background = active ? "rgba(22,35,31,.12)" : "transparent";
    }
  }

  function renderCommandBar() {
    const root = ensureCommandBarRoot();
    if (!root) {
      return;
    }

    const renderRoot = root.__maoloaderShadowRoot || root;
    renderRoot.replaceChildren?.();
    if (!renderRoot.replaceChildren) {
      renderRoot.innerHTML = "";
    }

    root.style.display = commandBarVisible ? "flex" : "none";
    setCommandBarActiveIndex(commandBarActiveIndex);

    if (!commandBarVisible) {
      return;
    }

    const shell = document.createElement("div");
    shell.style.cssText =
      "position:absolute;inset:0;display:flex;align-items:flex-start;justify-content:center;padding-top:14vh;background:rgba(0,0,0,.42);font:14px system-ui,sans-serif;";
    shell.onclick = (event) => {
      if (event.target === shell) {
        closeCommandBar();
      }
    };

    const panel = document.createElement("div");
    panel.className = "maoloader-commandbar-panel";
    panel.style.cssText =
      "width:min(620px,calc(100vw - 32px));max-height:70vh;overflow:hidden;border-radius:8px;background:rgba(248,250,249,.96);box-shadow:0 24px 80px rgba(0,0,0,.35);color:#10201a;";

    const input = document.createElement("input");
    input.className = "maoloader-commandbar-search";
    input.value = commandBarSearch;
    input.placeholder = "Search commands";
    input.style.cssText =
      "box-sizing:border-box;width:100%;border:0;border-bottom:1px solid rgba(0,0,0,.12);padding:14px 16px;font:16px system-ui,sans-serif;outline:none;background:white;color:#10201a;";
    input.oninput = () => {
      commandBarSearch = input.value;
      commandBarActiveIndex = 0;
      renderCommandBar();
    };
    input.onkeydown = (event) => {
      if (event.key === "ArrowUp") {
        event.preventDefault?.();
      }
    };
    panel.appendChild(input);

    const list = document.createElement("div");
    list.className = "maoloader-commandbar-list";
    list.style.cssText = "max-height:calc(70vh - 50px);overflow:auto;padding:6px;";

    const actions = visibleCommandActions();
    for (const [index, action] of actions.entries()) {
      const row = document.createElement("button");
      row.className = "maoloader-commandbar-action";
      row.type = "button";
      row.dataset = row.dataset || {};
      row.dataset.index = String(index);
      row.style.cssText =
        "box-sizing:border-box;width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;border:0;border-radius:6px;padding:10px 12px;background:transparent;color:inherit;text-align:left;font:14px system-ui,sans-serif;cursor:pointer;";
      // Hovering selects the row; repainting the whole list clears the previously selected one.
      row.onmouseenter = () => {
        commandBarActiveIndex = index;
        paintCommandRows(list);
      };
      row.onclick = () => runCommandAction(action);

      const label = document.createElement("span");
      label.textContent = commandActionText(action.name);
      row.appendChild(label);

      const legend = commandActionText(action.legend || action.group);
      if (legend) {
        const meta = document.createElement("span");
        meta.textContent = legend;
        meta.style.cssText = "opacity:.62;font-size:12px;";
        row.appendChild(meta);
      }

      list.appendChild(row);
    }
    paintCommandRows(list);

    if (actions.length === 0) {
      const empty = document.createElement("div");
      empty.className = "maoloader-commandbar-empty";
      empty.textContent = "No commands";
      empty.style.cssText = "padding:18px 14px;color:rgba(16,32,26,.6);";
      list.appendChild(empty);
    }

    panel.appendChild(list);
    shell.appendChild(panel);
    renderRoot.appendChild(shell);
    input.focus?.();
  }

  function showCommandBar() {
    commandBarVisible = true;
    commandBarSearch = "";
    commandBarActiveIndex = 0;
    renderCommandBar();
    emitCommandBarEvent("maoloader:commandbar-show");
  }

  if (typeof window.addEventListener === "function") {
    window.addEventListener("keydown", (event) => {
      if (event.ctrlKey && event.code === "KeyK" && !commandBarVisible) {
        event.preventDefault?.();
        showCommandBar();
        return;
      }

      if (!commandBarVisible || event.isComposing) {
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault?.();
        setCommandBarActiveIndex(commandBarActiveIndex - 1);
        renderCommandBar();
      } else if (event.key === "ArrowDown") {
        event.preventDefault?.();
        setCommandBarActiveIndex(commandBarActiveIndex + 1);
        renderCommandBar();
      } else if (event.key === "Enter") {
        event.preventDefault?.();
        runCommandAction(visibleCommandActions()[commandBarActiveIndex]);
      } else if (event.key === "Escape") {
        event.preventDefault?.();
        closeCommandBar();
      }
    });
  }

  Object.defineProperty(window, "__maoloaderCommandBarActions", {
    value: commandActions,
    enumerable: false,
    configurable: false,
    writable: false,
  });

  window.CommandBar = {
    addAction(item) {
      if (typeof item !== "object" || item === null || !item.name) {
        console.warn("[CommandBar] Action item should be an object with `name` and `perform` props.");
        return;
      }

      const action = { ...item };
      if (!action.group || typeof action.group !== "string") {
        action.group = "uncategorized";
      }
      commandActions.push(action);
      renderCommandBar();
      emitCommandBarEvent("maoloader:commandbar-update");
    },
    show() {
      showCommandBar();
    },
    update() {
      renderCommandBar();
      emitCommandBarEvent("maoloader:commandbar-update");
    },
  };

  let toastRoot;

  const toastVisuals = {
    info: {
      icon: "i",
      accent: "#3f6f9f",
      background: "#f7fbff",
      border: "rgba(63,111,159,.24)",
      iconBackground: "rgba(63,111,159,.12)",
      iconColor: "#254f7d",
    },
    success: {
      icon: "✓",
      accent: "#2f7d55",
      background: "#f7fcf9",
      border: "rgba(47,125,85,.24)",
      iconBackground: "rgba(47,125,85,.12)",
      iconColor: "#245f3f",
    },
    warning: {
      icon: "!",
      accent: "#9a6a1f",
      background: "#fffaf1",
      border: "rgba(154,106,31,.28)",
      iconBackground: "rgba(154,106,31,.13)",
      iconColor: "#7a5217",
    },
    error: {
      icon: "!",
      accent: "#9c3838",
      background: "#fff8f8",
      border: "rgba(156,56,56,.26)",
      iconBackground: "rgba(156,56,56,.12)",
      iconColor: "#833030",
    },
    loading: {
      icon: "",
      accent: "#4c5968",
      background: "#fbfcfd",
      border: "rgba(76,89,104,.22)",
      iconBackground: "rgba(76,89,104,.10)",
      iconColor: "#354252",
    },
  };
  const MAOLOADER_ICON_URL =
    "https://raw.githubusercontent.com/steele123/maoloader/main/app/static/maologo-icon.png";

  function ensureToastRoot() {
    if (typeof document === "undefined" || !document.body?.appendChild || !document.createElement) {
      return undefined;
    }

    if (!toastRoot || isDetached(toastRoot)) {
      toastRoot = createShadowSurface("maoloader-toast-root", "position:fixed;right:16px;bottom:16px;z-index:2147483647;pointer-events:none;");
    }

    const renderRoot = toastRoot?.__maoloaderShadowRoot || toastRoot;
    if (renderRoot && !toastRoot.__maoloaderToastStack) {
      const style = document.createElement("style");
      style.textContent =
        "@keyframes maoloader-toast-spin{to{transform:rotate(360deg)}}@keyframes maoloader-toast-progress{from{transform:scaleX(1)}to{transform:scaleX(0)}}";
      renderRoot.appendChild(style);
      const stack = document.createElement("div");
      stack.style.cssText = "display:flex;flex-direction:column;gap:10px;pointer-events:none;width:min(380px,calc(100vw - 32px));";
      renderRoot.appendChild(stack);
      toastRoot.__maoloaderToastStack = stack;
    }

    return toastRoot;
  }

  function toastText(message, value) {
    if (typeof message === "function") {
      try {
        return message(value);
      } catch (error) {
        console.warn("[Toast] Failed to evaluate toast message.", error);
        return "";
      }
    }
    return message ?? "";
  }

  function normalizeToastInput(message, options) {
    if (message && typeof message === "object" && !Array.isArray(message)) {
      const text = toastText(message.message ?? message.text ?? message.description ?? message.title ?? "");
      return {
        title: toastText(message.title ?? ""),
        text,
        duration: Number(message.duration ?? options?.duration ?? 5000),
        action: message.action,
        dismissible: message.dismissible,
      };
    }

    return {
      title: "",
      text: toastText(message),
      duration: Number(options?.duration ?? 5000),
      action: options?.action,
      dismissible: options?.dismissible,
    };
  }

  function toastDuration(message, options) {
    if (message && typeof message === "object" && !Array.isArray(message)) {
      return Number(message.duration ?? options?.duration ?? 5000);
    }
    return Number(options?.duration ?? 5000);
  }

  function removeToast(toast) {
    if (!toast) {
      return;
    }

    toast.style.opacity = "0";
    toast.style.transform = "translateY(4px)";
    toast.style.pointerEvents = "none";
    toast.remove?.();
    if (toast.parentNode?.removeChild) {
      toast.parentNode.removeChild(toast);
    }
    const stack = toastRoot?.__maoloaderToastStack;
    if (toastRoot && (!stack || stack.children?.length === 0)) {
      toastRoot.remove?.();
      toastRoot = undefined;
    }
  }

  function scheduleToastRemoval(toast, duration) {
    if (!toast || !Number.isFinite(duration) || duration <= 0) {
      return;
    }

    if (toast.__maoloaderTimer) {
      if (typeof clearTimeout === "function") {
        clearTimeout(toast.__maoloaderTimer);
      }
    }
    toast.__maoloaderTimer = setTimeout(() => removeToast(toast), duration);
  }

  function clearToastTimer(toast) {
    if (toast?.__maoloaderTimer && typeof clearTimeout === "function") {
      clearTimeout(toast.__maoloaderTimer);
      toast.__maoloaderTimer = undefined;
    }
  }

  function toastIcon(kind, visual) {
    if (kind === "loading") {
      const spinner = document.createElement("span");
      spinner.style.cssText =
        "width:14px;height:14px;border:2px solid rgba(76,89,104,.22);border-top-color:#4c5968;border-radius:999px;animation:maoloader-toast-spin .8s linear infinite;";
      return spinner;
    }

    const icon = document.createElement("span");
    icon.textContent = visual.icon;
    icon.style.cssText =
      "display:grid;place-items:center;width:18px;height:18px;border-radius:999px;font:700 12px/1 system-ui,sans-serif;";
    return icon;
  }

  function renderToastContent(toast, kind, normalized) {
    const visual = toastVisuals[kind] || toastVisuals.info;
    toast.className = `maoloader-toast maoloader-toast-${kind}`;
    toast.textContent = "";
    toast.style.cssText =
      `position:relative;display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:10px;align-items:flex-start;` +
      `width:100%;box-sizing:border-box;overflow:hidden;border:1px solid ${visual.border};border-left:4px solid ${visual.accent};` +
      `border-radius:8px;background:${visual.background};color:#141d26;box-shadow:0 18px 42px rgba(20,29,38,.20);` +
      "padding:12px 10px 12px 12px;font:13px/1.4 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;pointer-events:auto;transition:opacity .14s ease,transform .14s ease;";

    const iconWrap = document.createElement("div");
    iconWrap.style.cssText =
      `display:grid;place-items:center;width:26px;height:26px;border-radius:999px;background:${visual.iconBackground};color:${visual.iconColor};margin-top:1px;`;
    iconWrap.appendChild(toastIcon(kind, visual));

    const body = document.createElement("div");
    body.style.cssText = "display:grid;gap:2px;min-width:0;";

    const title = document.createElement("strong");
    title.textContent = String(normalized.title || normalized.text || "");
    title.style.cssText = "display:block;color:#141d26;font-size:13px;font-weight:800;overflow-wrap:anywhere;";
    body.appendChild(title);

    if (normalized.title && normalized.text && normalized.text !== normalized.title) {
      const description = document.createElement("span");
      description.textContent = String(normalized.text);
      description.style.cssText = "display:block;color:#617082;font-size:12px;overflow-wrap:anywhere;";
      body.appendChild(description);
    }

    if (normalized.action && typeof normalized.action === "object" && normalized.action.label) {
      const action = document.createElement("button");
      action.type = "button";
      action.textContent = String(normalized.action.label);
      action.style.cssText =
        `justify-self:start;margin-top:6px;border:1px solid ${visual.border};border-radius:7px;background:#fff;color:${visual.iconColor};` +
        "cursor:pointer;font:800 12px/1 system-ui,sans-serif;padding:7px 9px;";
      action.onclick = (event) => {
        event.preventDefault?.();
        event.stopPropagation?.();
        normalized.action?.onClick?.();
        if (normalized.action?.dismiss !== false) {
          removeToast(toast);
        }
      };
      body.appendChild(action);
    }

    const close = document.createElement("button");
    close.type = "button";
    close.setAttribute?.("aria-label", "Dismiss toast");
    close.textContent = "×";
    close.style.cssText =
      "width:24px;height:24px;border:0;border-radius:6px;background:transparent;color:#6a7888;cursor:pointer;font:700 18px/1 system-ui,sans-serif;";
    close.onclick = (event) => {
      event.preventDefault?.();
      event.stopPropagation?.();
      removeToast(toast);
    };

    toast.appendChild(iconWrap);
    toast.appendChild(body);
    toast.appendChild(close);

    if (Number.isFinite(normalized.duration) && normalized.duration > 0) {
      const progress = document.createElement("div");
      progress.style.cssText =
        `position:absolute;left:0;right:0;bottom:0;height:2px;background:${visual.accent};opacity:.55;transform-origin:left center;animation:maoloader-toast-progress ${normalized.duration}ms linear forwards;`;
      toast.appendChild(progress);
    }

    toast.onmouseenter = () => clearToastTimer(toast);
    toast.onmouseleave = () => scheduleToastRemoval(toast, normalized.duration);
  }

  function showToast(kind, message, options) {
    const normalized = normalizeToastInput(message, options);
    const root = ensureToastRoot();
    if (!root) {
      console[kind === "error" ? "error" : "log"]("[maoloader]", normalized.text);
      return undefined;
    }

    const toast = document.createElement("div");
    renderToastContent(toast, kind, normalized);
    const stack = root.__maoloaderToastStack || root.__maoloaderShadowRoot || root;
    stack.appendChild(toast);
    scheduleToastRemoval(toast, normalized.duration);
    return toast;
  }

  window.Toast = {
    show(message, options) {
      return showToast("info", message, options);
    },
    info(message, options) {
      return showToast("info", message, options);
    },
    warn(message, options) {
      return showToast("warning", message, options);
    },
    warning(message, options) {
      return showToast("warning", message, options);
    },
    success(message, options) {
      return showToast("success", message, options);
    },
    error(message, options) {
      return showToast("error", message, options);
    },
    promise(promise, message) {
      const toast = showToast("loading", message?.loading ?? "", message);
      return Promise.resolve(promise)
        .then((value) => {
          const text = toastText(message?.success, value);
          if (toast) {
            const normalized = normalizeToastInput(text, { duration: toastDuration(message?.success, message) });
            renderToastContent(toast, "success", normalized);
            scheduleToastRemoval(toast, normalized.duration);
          } else if (text) {
            console.log("[maoloader]", text);
          }
          return value;
        })
        .catch((error) => {
          const text = toastText(message?.error, error);
          if (toast) {
            const normalized = normalizeToastInput(text, { duration: toastDuration(message?.error, message) });
            renderToastContent(toast, "error", normalized);
            scheduleToastRemoval(toast, normalized.duration);
          } else if (text) {
            console.error("[maoloader]", text);
          }
          throw error;
      });
    },
  };

  // ---- Loading screen ----
  // Covers Riot's boot screen with a maoloader one that names the client part being loaded and
  // shows plugin progress. It always gets out of the way: when Riot's screen goes, when the top
  // bar appears, on Esc, or after LOADING_SCREEN_MAX_MS no matter what.

  const LOADING_SCREEN_KEY = "maoloader-loading-screen";
  const LOADING_SCREEN_ID = "maoloader-loading-root";
  const LOADING_SCREEN_MAX_MS = 90000;
  // The welcome waits for the loading screen, but never longer than this.
  const WELCOME_MAX_WAIT_MS = 20000;
  const RIOT_LOADING_SELECTOR = ".lol-loading-screen-container";
  const NAVIGATION_SCREEN_SELECTOR = 'div[data-screen-name="rcp-fe-lol-navigation-screen"]';
  const loadingScreen = {
    root: undefined,
    timer: undefined,
    startedAt: 0,
    riotSeen: false,
    step: "",
    hiding: false,
  };

  function loadingScreenEnabled() {
    return window.DataStore?.get?.(LOADING_SCREEN_KEY, true) !== false;
  }

  // "rcp-fe-lol-champ-select" -> "Champ select"
  function loadingStepLabel(name) {
    const short = String(name || "")
      .replace(/^rcp-(?:fe|be)-/, "")
      .replace(/^lol-/, "")
      .replace(/-/g, " ")
      .trim();
    return short ? short.charAt(0).toUpperCase() + short.slice(1) : "";
  }

  function noteLoadingStep(name) {
    const label = loadingStepLabel(name);
    if (!label || !loadingScreen.root) {
      return;
    }
    loadingScreen.step = label;
    const step = loadingScreen.root.__maoloaderLoadingStep;
    if (step) {
      step.textContent = `Loading ${label.toLowerCase()}`;
    }
  }

  function pluginLoadCounts() {
    const ready = new Set();
    const failed = new Set();
    for (const report of pluginReports) {
      if (report.status === "loaded" && (report.stage === "complete" || report.kind === "stylesheet")) {
        ready.add(report.entry);
      } else if (report.status === "failed" || report.status === "skipped") {
        failed.add(report.entry);
      }
    }
    const total = pengu.plugins.length;
    return { total, ready: Math.min(ready.size, total), failed: failed.size };
  }

  function loadingPluginSummary() {
    const { total, ready, failed } = pluginLoadCounts();
    if (!total) {
      return "maoloader";
    }
    const parts = [`maoloader · ${ready} of ${total} plugin${total === 1 ? "" : "s"} ready`];
    if (failed) {
      parts.push(`${failed} failed`);
    }
    return parts.join(" · ");
  }

  // Resolves once the loading screen starts fading, so nothing pops up underneath it. Never waits
  // longer than maxMs: the welcome should not depend on the loading screen noticing the client.
  function whenLoadingScreenDone(maxMs = WELCOME_MAX_WAIT_MS) {
    const started = Date.now();
    return new Promise((resolve) => {
      const check = () => {
        if (!loadingScreen.root || loadingScreen.hiding || Date.now() - started >= maxMs) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  // Present isn't enough: the client can keep an element on the page but hidden.
  function isShown(element) {
    if (!element || element.isConnected === false) {
      return false;
    }
    if (typeof element.getClientRects === "function" && element.getClientRects().length === 0) {
      return false;
    }
    if (typeof getComputedStyle === "function") {
      const style = getComputedStyle(element);
      if (style.visibility === "hidden" || Number(style.opacity) === 0) {
        return false;
      }
    }
    return true;
  }

  function hideLoadingScreen(reason) {
    const root = loadingScreen.root;
    if (!root || loadingScreen.hiding) {
      return;
    }
    loadingScreen.hiding = true;
    // In the client's DevTools console, so slow boots can be diagnosed.
    console.info(
      "%c maoloader ",
      "background: #16231f; color: #9be2b2",
      `Loading screen hidden after ${((Date.now() - loadingScreen.startedAt) / 1000).toFixed(1)}s (${reason}).`,
    );
    clearInterval(loadingScreen.timer);
    root.style.opacity = "0";
    root.style.pointerEvents = "none";
    setTimeout(() => {
      root.remove?.();
      if (root.parentNode?.removeChild) {
        root.parentNode.removeChild(root);
      }
      loadingScreen.root = undefined;
    }, 320);
  }

  function checkLoadingScreen() {
    const root = loadingScreen.root;
    if (!root) {
      clearInterval(loadingScreen.timer);
      return;
    }
    if (root.__maoloaderLoadingPlugins) {
      root.__maoloaderLoadingPlugins.textContent = loadingPluginSummary();
    }

    const riot = isShown(document.querySelector?.(RIOT_LOADING_SELECTOR));
    if (riot) {
      loadingScreen.riotSeen = true;
    }
    const navigation = isShown(document.querySelector?.(NAVIGATION_SCREEN_SELECTOR));
    if (loadingScreen.riotSeen && !riot) {
      hideLoadingScreen("Riot's loading screen finished");
    } else if (navigation && !riot) {
      hideLoadingScreen("the client's top bar appeared");
    } else if (Date.now() - loadingScreen.startedAt > LOADING_SCREEN_MAX_MS) {
      hideLoadingScreen("safety limit reached");
    }
  }

  function renderLoadingScreen() {
    const host = document.documentElement || document.body;
    // Mounted on <html> beside <body>, so the client's own page never touches it.
    const root = createShadowSurface(
      LOADING_SCREEN_ID,
      "position:fixed;inset:0;z-index:2147483645;display:block;opacity:1;transition:opacity .3s ease;",
      host,
    );
    if (!root) {
      return undefined;
    }
    const renderRoot = root.__maoloaderShadowRoot || root;
    const still = Boolean(pengu.superPotato);

    const style = document.createElement("style");
    style.textContent =
      "@keyframes maoloader-loading-sweep{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}" +
      "@keyframes maoloader-loading-glow{0%,100%{box-shadow:0 0 0 5px rgba(200,170,110,.06),0 0 28px rgba(200,170,110,.14)}50%{box-shadow:0 0 0 5px rgba(200,170,110,.14),0 0 52px rgba(200,170,110,.34)}}";
    renderRoot.appendChild(style);

    const shell = document.createElement("div");
    shell.style.cssText =
      "position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;" +
      "background:radial-gradient(ellipse at 50% 38%,#0f2230 0%,#060d14 55%,#010407 100%);" +
      "color:#a09b8c;font:13px/1.4 Inter,system-ui,-apple-system,'Segoe UI',sans-serif;user-select:none;";

    // The same gold medallion as the welcome popup, so the dark mark reads on the dark screen.
    const medallion = document.createElement("div");
    medallion.style.cssText =
      "display:grid;place-items:center;width:84px;height:84px;border:2px solid #785a28;border-radius:50%;" +
      "background:radial-gradient(circle at 50% 28%,#f0e6d2 0%,#c8aa6e 48%,#8a6a32 100%);" +
      "box-shadow:0 0 0 5px rgba(200,170,110,.08),0 0 40px rgba(200,170,110,.22);" +
      (still ? "" : "animation:maoloader-loading-glow 2.4s ease-in-out infinite;");
    const mark = document.createElement("img");
    mark.src = MAOLOADER_ICON_URL;
    mark.alt = "";
    mark.style.cssText = "width:54px;height:54px;object-fit:contain;filter:drop-shadow(0 2px 4px rgba(0,0,0,.35));";
    mark.onerror = () => {
      mark.style.display = "none";
    };
    medallion.appendChild(mark);

    const title = document.createElement("div");
    title.textContent = "League of Legends";
    title.style.cssText = "margin-top:6px;color:#c8aa6e;font-size:12px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;";

    const track = document.createElement("div");
    track.style.cssText = "position:relative;width:220px;height:2px;overflow:hidden;border-radius:2px;background:rgba(200,170,110,.15);";
    const sweep = document.createElement("div");
    sweep.style.cssText =
      "position:absolute;top:0;left:0;width:40%;height:100%;border-radius:2px;" +
      "background:linear-gradient(90deg,transparent,#c8aa6e 40%,#0ac8b9 60%,transparent);" +
      (still ? "transform:translateX(75%);" : "animation:maoloader-loading-sweep 1.4s cubic-bezier(.45,0,.25,1) infinite;");
    track.appendChild(sweep);

    const step = document.createElement("div");
    step.textContent = loadingScreen.step ? `Loading ${loadingScreen.step.toLowerCase()}` : "Starting the client";
    step.style.cssText = "min-height:18px;color:#a09b8c;font-size:12px;";

    const plugins = document.createElement("div");
    plugins.textContent = loadingPluginSummary();
    plugins.style.cssText = "position:absolute;bottom:22px;left:0;right:0;text-align:center;color:#5b5a56;font-size:11px;letter-spacing:.04em;";

    const hint = document.createElement("div");
    hint.textContent = "Esc to skip";
    hint.style.cssText = "position:absolute;bottom:22px;right:24px;color:#3c3c41;font-size:11px;";

    shell.appendChild(medallion);
    shell.appendChild(title);
    shell.appendChild(track);
    shell.appendChild(step);
    shell.appendChild(plugins);
    shell.appendChild(hint);
    renderRoot.appendChild(shell);

    root.__maoloaderLoadingStep = step;
    root.__maoloaderLoadingPlugins = plugins;
    return root;
  }

  function startLoadingScreen() {
    if (typeof document === "undefined" || !document.createElement || !loadingScreenEnabled()) {
      return;
    }
    // Only the client's main page, not frames inside it.
    if (window.top && window.top !== window) {
      return;
    }
    if (!document.documentElement && !document.body) {
      setTimeout(startLoadingScreen, 16);
      return;
    }
    loadingScreen.startedAt = Date.now();
    loadingScreen.root = renderLoadingScreen();
    if (!loadingScreen.root) {
      return;
    }
    loadingScreen.timer = setInterval(checkLoadingScreen, 250);
    // Don't keep a test runner (or anything else without a page) alive just for this check.
    loadingScreen.timer?.unref?.();
    window.addEventListener?.("keydown", (event) => {
      if (event.key === "Escape" && loadingScreen.root) {
        hideLoadingScreen("skipped with Esc");
      }
    });
  }

  startLoadingScreen();

  function parseVersion(version) {
    const match = /v?(\d+(?:\.\d+){2,3})/i.exec(String(version || ""));
    if (!match) {
      return 0;
    }

    const parts = match[1].split(".").map((part) => Number(part) || 0);
    return parts[0] * 10000 * 10000 + parts[1] * 10000 + parts[2] + (parts[3] || 0) / 10000;
  }

  // Checks maoloader's own release manifest (the one the desktop app's updater uses).
  async function fetchLatestUpdate() {
    // Dev builds and tests run this file without a stamped version, so there's nothing to compare.
    if (!HAS_MAOLOADER_VERSION) {
      return false;
    }

    try {
      const response = await fetch(MAOLOADER_RELEASES_URL);
      if (response && "ok" in response && !response.ok) {
        return false;
      }
      const release = await response?.json?.();
      const latestVersion = String(release?.version || "").replace(/^v/i, "");
      if (parseVersion(latestVersion) > parseVersion(MAOLOADER_VERSION)) {
        return {
          old: MAOLOADER_VERSION,
          version: latestVersion,
          changelog: String(release?.notes || ""),
        };
      }
    } catch (error) {
      console.warn("maoloader failed to fetch update.", error);
    }

    return false;
  }

  const WELCOME_HOST_SELECTOR = "lol-uikit-layer-manager-wrapper";

  // "Don't show again": a dark square with a gold edge that fills gold with a dark tick when checked.
  const WELCOME_CHECK_MARK =
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M3.6 8.4l2.9 2.9 5.9-6.6' fill='none' stroke='%23071018' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")";
  const WELCOME_CHECKBOX_CSS =
    ".maoloader-welcome-dismiss{color:#7d8b94;transition:color .15s ease}" +
    ".maoloader-welcome-dismiss:hover{color:#c8c2b4}" +
    ".maoloader-welcome-dismiss-check{appearance:none;-webkit-appearance:none;flex:0 0 auto;width:16px;height:16px;margin:0;" +
    "border:1px solid rgba(200,170,110,.45);border-radius:4px;background-color:#08121b;" +
    "box-shadow:inset 0 1px 2px rgba(0,0,0,.6);cursor:pointer;" +
    "transition:background-color .15s ease,border-color .15s ease,box-shadow .15s ease,transform .1s ease}" +
    ".maoloader-welcome-dismiss:hover .maoloader-welcome-dismiss-check{border-color:#c8aa6e;box-shadow:inset 0 1px 2px rgba(0,0,0,.6),0 0 0 3px rgba(200,170,110,.12)}" +
    ".maoloader-welcome-dismiss-check:active{transform:scale(.92)}" +
    `.maoloader-welcome-dismiss-check:checked{border-color:#f0e6d2;background-color:#c8aa6e;background-image:${WELCOME_CHECK_MARK},linear-gradient(180deg,#f0e6d2,#c8aa6e 55%,#a7853f);` +
    "background-size:12px 12px,100% 100%;background-position:center,center;background-repeat:no-repeat,no-repeat;" +
    "box-shadow:0 0 10px rgba(200,170,110,.35)}" +
    ".maoloader-welcome-dismiss-check:focus-visible{outline:2px solid #0ac8b9;outline-offset:2px}";

  function closeWelcome(root) {
    if (root) {
      root.style.display = "none";
      root.style.pointerEvents = "none";
      root.setAttribute?.("aria-hidden", "true");
    }
    root?.remove?.();
    if (root?.parentNode?.removeChild) {
      root.parentNode.removeChild(root);
    }
  }

  function welcomeHost() {
    return document.querySelector?.(WELCOME_HOST_SELECTOR) || document.body;
  }

  function waitForWelcomeHost() {
    if (typeof document === "undefined" || !document.body?.appendChild) {
      return Promise.resolve(undefined);
    }

    const current = welcomeHost();
    if (current && current !== document.body) {
      return Promise.resolve(current);
    }

    return new Promise((resolve) => {
      let resolved = false;
      let observer;
      let attempts = 0;
      const finish = (host) => {
        if (resolved) {
          return;
        }
        resolved = true;
        observer?.disconnect?.();
        resolve(host || document.body);
      };
      const check = () => {
        const host = welcomeHost();
        if (host && host !== document.body) {
          finish(host);
          return;
        }
        attempts += 1;
        if (attempts >= 80) {
          finish(document.body);
        }
      };

      if (typeof MutationObserver === "function" && document.documentElement) {
        observer = new MutationObserver(check);
        observer.observe(document.documentElement, { childList: true, subtree: true });
      }

      const interval = setInterval(() => {
        check();
        if (resolved) {
          clearInterval(interval);
        }
      }, 50);
      check();
    });
  }

  function renderWelcome(host = welcomeHost()) {
    if (typeof document === "undefined" || !document.body?.appendChild || !document.createElement) {
      return undefined;
    }

    const existing = document.getElementById?.("maoloader-welcome-root") || document.querySelector?.(".maoloader-welcome-root");
    if (existing) {
      return existing;
    }

    const root = createShadowSurface(
      "maoloader-welcome-root",
      "position:fixed;inset:0;z-index:2147483645;display:flex;align-items:center;justify-content:center;font:14px Inter,system-ui,-apple-system,'Segoe UI',sans-serif;color:#a09b8c;pointer-events:auto;",
      host,
    );
    if (!root) {
      return undefined;
    }
    root.className = "maoloader-welcome-root";
    const renderRoot = root.__maoloaderShadowRoot || root;
    renderRoot.replaceChildren?.();
    if (!renderRoot.replaceChildren) {
      renderRoot.innerHTML = "";
    }

    const still = Boolean(pengu.superPotato);

    const shell = document.createElement("div");
    shell.className = "maoloader-welcome-shell";
    shell.style.cssText =
      "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;" +
      "background:radial-gradient(ellipse at 50% 45%,rgba(4,12,20,.55) 0%,rgba(1,4,9,.82) 70%);backdrop-filter:blur(3px);" +
      "font:14px Inter,system-ui,-apple-system,'Segoe UI',sans-serif;color:#a09b8c;pointer-events:auto;" +
      (still ? "" : "animation:maoloader-welcome-fade .25s ease-out both;");

    const panel = document.createElement("div");
    panel.className = "maoloader-welcome-panel";
    panel.style.cssText =
      "position:relative;box-sizing:border-box;width:min(460px,calc(100vw - 32px));overflow:hidden;border:1px solid rgba(200,170,110,.38);border-radius:8px;" +
      "background:linear-gradient(180deg,#0c1822 0%,#070e15 100%);" +
      "box-shadow:0 30px 90px rgba(0,0,0,.65),0 0 0 1px rgba(0,0,0,.55),inset 0 1px 0 rgba(240,230,210,.06);" +
      (still ? "" : "animation:maoloader-welcome-in .4s cubic-bezier(.2,.8,.2,1) both;");

    const body = document.createElement("div");
    body.className = "maoloader-welcome-body";
    body.style.cssText = "position:relative;display:flex;flex-direction:column;align-items:center;gap:12px;padding:30px 28px 22px;text-align:center;";

    // A thin gold-to-teal line across the top edge, like the client's own dialogs.
    const accent = document.createElement("div");
    accent.style.cssText = "position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,#c8aa6e 30%,#0ac8b9 70%,transparent);";

    const glow = document.createElement("div");
    glow.style.cssText =
      "position:absolute;top:-60px;left:50%;width:260px;height:160px;transform:translateX(-50%);pointer-events:none;" +
      "background:radial-gradient(ellipse,rgba(200,170,110,.18),transparent 70%);";

    const badge = document.createElement("div");
    badge.className = "maoloader-welcome-badge";
    badge.style.cssText =
      // A gold medallion, so the dark maoloader mark reads clearly against the dark card.
      "position:relative;display:grid;place-items:center;width:76px;height:76px;border:2px solid #785a28;border-radius:50%;" +
      "background:radial-gradient(circle at 50% 28%,#f0e6d2 0%,#c8aa6e 48%,#8a6a32 100%);" +
      "box-shadow:0 0 0 4px rgba(200,170,110,.1),0 0 28px rgba(200,170,110,.25),0 10px 30px rgba(0,0,0,.5);";

    const badgeIcon = document.createElement("img");
    badgeIcon.src = MAOLOADER_ICON_URL;
    badgeIcon.alt = "";
    badgeIcon.decoding = "async";
    badgeIcon.loading = "eager";
    badgeIcon.style.cssText =
      "display:block;width:48px;height:48px;object-fit:contain;filter:drop-shadow(0 2px 4px rgba(0,0,0,.35));" +
      (still ? "" : "animation:maoloader-welcome-glow 3s ease-in-out infinite;");
    badgeIcon.onerror = () => {
      badgeIcon.style.display = "none";
    };
    badge.appendChild(badgeIcon);

    const copy = document.createElement("div");
    copy.className = "maoloader-welcome-copy";
    copy.style.cssText = "position:relative;display:flex;flex-direction:column;align-items:center;gap:6px;";

    const eyebrow = document.createElement("div");
    eyebrow.textContent = HAS_MAOLOADER_VERSION ? `maoloader v${MAOLOADER_VERSION}` : "maoloader";
    eyebrow.style.cssText = "color:#c8aa6e;font-size:11px;font-weight:700;letter-spacing:.24em;text-transform:uppercase;";

    const title = document.createElement("h3");
    title.textContent = "You're all set";
    title.style.cssText = "margin:0;color:#f0e6d2;font-size:24px;font-weight:800;line-height:1.2;letter-spacing:.01em;";

    // Plugin status, which only maoloader can tell you.
    const counts = pluginLoadCounts();
    const status = document.createElement("div");
    status.className = "maoloader-welcome-status";
    const problem = counts.failed > 0;
    status.style.cssText =
      "display:inline-flex;align-items:center;gap:8px;margin-top:4px;border-radius:999px;padding:5px 12px;font-size:12px;font-weight:600;" +
      (problem
        ? "border:1px solid rgba(232,170,70,.35);background:rgba(232,170,70,.08);color:#e8b45a;"
        : "border:1px solid rgba(10,200,185,.3);background:rgba(10,200,185,.07);color:#5fd6c9;");
    const dot = document.createElement("span");
    dot.style.cssText = `width:7px;height:7px;border-radius:50%;background:${problem ? "#e8aa46" : "#0ac8b9"};box-shadow:0 0 8px currentColor;`;
    const statusText = document.createElement("span");
    if (!counts.total) {
      statusText.textContent = "No plugins yet. Browse the plugin store to add some.";
    } else {
      statusText.textContent =
        `${counts.ready} of ${counts.total} plugin${counts.total === 1 ? "" : "s"} loaded` +
        (problem ? ` · ${counts.failed} need${counts.failed === 1 ? "s" : ""} attention` : "");
    }
    status.appendChild(dot);
    status.appendChild(statusText);

    // Shortcuts worth knowing on day one.
    const keyStyle =
      "display:inline-grid;place-items:center;min-width:22px;height:22px;padding:0 6px;box-sizing:border-box;border:1px solid rgba(200,170,110,.3);border-bottom-width:2px;" +
      "border-radius:4px;background:#0a1520;color:#f0e6d2;font:600 11px/1 'Cascadia Code',Consolas,monospace;";
    const shortcut = (keys, label) => {
      const row = document.createElement("div");
      row.style.cssText = "display:inline-flex;align-items:center;gap:4px;color:#7d8b94;font-size:12px;";
      for (const key of keys) {
        const kbd = document.createElement("span");
        kbd.textContent = key;
        kbd.style.cssText = keyStyle;
        row.appendChild(kbd);
      }
      const text = document.createElement("span");
      text.textContent = label;
      text.style.cssText = "margin-left:4px;";
      row.appendChild(text);
      return row;
    };
    const shortcuts = document.createElement("div");
    shortcuts.style.cssText = "display:flex;flex-wrap:wrap;justify-content:center;gap:10px 18px;margin-top:8px;";
    shortcuts.appendChild(shortcut(["Ctrl", "K"], "Command bar"));
    if (pengu.plugins.some((entry) => /^plugin-health-overlay\//i.test(entry))) {
      shortcuts.appendChild(shortcut(["Ctrl", "Shift", "H"], "Plugin health"));
    }

    const links = document.createElement("div");
    links.className = "maoloader-welcome-links";
    links.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:10px;";

    for (const [label, href] of [
      ["Docs", "https://maoloader.com/docs"],
      ["Plugins", "https://maoloader.com/plugins"],
      ["GitHub", "https://github.com/steele123/maoloader"],
    ]) {
      const link = document.createElement("a");
      link.textContent = label;
      link.href = href;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.style.cssText =
        "display:inline-flex;align-items:center;padding:6px 14px;border:1px solid rgba(200,170,110,.28);border-radius:999px;color:#c8aa6e;" +
        "text-decoration:none;font-size:12px;font-weight:600;transition:border-color .15s ease,color .15s ease,background .15s ease;";
      link.onmouseenter = () => {
        link.style.borderColor = "#c8aa6e";
        link.style.color = "#f0e6d2";
        link.style.background = "rgba(200,170,110,.1)";
      };
      link.onmouseleave = () => {
        link.style.borderColor = "rgba(200,170,110,.28)";
        link.style.color = "#c8aa6e";
        link.style.background = "transparent";
      };
      links.appendChild(link);
    }

    copy.appendChild(eyebrow);
    copy.appendChild(title);
    copy.appendChild(status);
    copy.appendChild(shortcuts);
    copy.appendChild(links);
    body.appendChild(accent);
    body.appendChild(glow);
    body.appendChild(badge);
    body.appendChild(copy);

    const footer = document.createElement("div");
    footer.className = "maoloader-welcome-footer";
    footer.style.cssText =
      "display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 22px;border-top:1px solid rgba(200,170,110,.14);background:rgba(0,0,0,.28);";

    const label = document.createElement("label");
    label.className = "maoloader-welcome-dismiss";
    label.style.cssText = "display:flex;align-items:center;gap:9px;font-size:12px;cursor:pointer;";

    // A real checkbox, restyled by the rules in the surface's <style> (see WELCOME_CHECKBOX_CSS).
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "maoloader-welcome-dismiss-check";
    checkbox.onchange = () => {
      window.DataStore?.set("pengu-welcome", !checkbox.checked);
    };

    const labelText = document.createElement("span");
    labelText.textContent = "Don't show again";

    label.appendChild(checkbox);
    label.appendChild(labelText);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "maoloader-welcome-ok";
    button.textContent = "Let's play";
    button.tabIndex = 0;
    button.style.cssText =
      "position:relative;z-index:1;border:1px solid #c8aa6e;border-radius:4px;background:linear-gradient(180deg,#1e2328,#0a1428);color:#f0e6d2;" +
      "padding:9px 24px;text-transform:uppercase;letter-spacing:.08em;font:700 12px Inter,system-ui,sans-serif;cursor:pointer;pointer-events:auto;" +
      "box-shadow:0 0 0 1px rgba(0,0,0,.5),0 0 18px rgba(200,170,110,.15);transition:box-shadow .15s ease,border-color .15s ease;";
    button.onmouseenter = () => {
      button.style.borderColor = "#f0e6d2";
      button.style.boxShadow = "0 0 0 1px rgba(0,0,0,.5),0 0 24px rgba(200,170,110,.35)";
    };
    button.onmouseleave = () => {
      button.style.borderColor = "#c8aa6e";
      button.style.boxShadow = "0 0 0 1px rgba(0,0,0,.5),0 0 18px rgba(200,170,110,.15)";
    };
    const dismiss = (event) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      event?.stopImmediatePropagation?.();
      try {
        if (checkbox.checked) {
          window.DataStore?.set("pengu-welcome", false);
        }
      } catch (error) {
        console.warn("maoloader failed to persist welcome dismissal.", error);
      }
      closeWelcome(root);
      return false;
    };
    const eventHitsDismissTarget = (event) => {
      const target = event?.target;
      if (!target) {
        return false;
      }
      // Not `target === root`: any click inside the popup reaches the page retargeted to root,
      // which used to dismiss it (and cancel the click) from the checkbox and links too. The
      // composed path below still identifies real clicks on the button.
      if (target === button) {
        return true;
      }
      if (target.closest?.(".maoloader-welcome-ok")) {
        return true;
      }
      const path = event.composedPath?.();
      return Array.isArray(path) && path.includes(button);
    };
    const delegatedDismiss = (event) => {
      if (eventHitsDismissTarget(event)) {
        return dismiss(event);
      }
      return undefined;
    };
    button.onclick = dismiss;
    button.onpointerdown = dismiss;
    button.onmousedown = dismiss;
    button.ontouchstart = dismiss;
    for (const type of ["pointerdown", "mousedown", "touchstart", "click"]) {
      button.addEventListener?.(type, dismiss, true);
      root.addEventListener?.(type, delegatedDismiss, true);
      document.addEventListener?.(type, delegatedDismiss, true);
      window.addEventListener?.(type, delegatedDismiss, true);
    }
    shell.addEventListener?.(
      "click",
      (event) => {
        if (event.target === shell) {
          dismiss(event);
        }
      },
      true,
    );
    window.addEventListener?.(
      "keydown",
      (event) => {
        if (event.key === "Escape") {
          dismiss(event);
        }
      },
      true,
    );

    footer.appendChild(label);
    footer.appendChild(button);
    panel.appendChild(body);
    panel.appendChild(footer);
    shell.appendChild(panel);
    renderRoot.appendChild(shell);
    // After the shell, so the shell stays the surface's first child.
    const keyframes = document.createElement("style");
    keyframes.textContent =
      "@keyframes maoloader-welcome-fade{from{opacity:0}to{opacity:1}}" +
      "@keyframes maoloader-welcome-in{from{opacity:0;transform:translateY(10px) scale(.97)}to{opacity:1;transform:none}}" +
      "@keyframes maoloader-welcome-glow{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}" +
      WELCOME_CHECKBOX_CSS;
    renderRoot.appendChild(keyframes);
    button.focus?.();
    return root;
  }

  async function initWelcomeSurface() {
    // Wait for the loading screen so the welcome doesn't open underneath it, and so plugin
    // counts are final.
    await whenLoadingScreenDone();
    if (window.DataStore?.get("pengu-welcome", true) !== false) {
      renderWelcome(await waitForWelcomeHost());
    } else {
      window.Toast?.success?.("maoloader is active");
    }

    const update = await fetchLatestUpdate();
    if (update) {
      window.Toast?.info?.({
        title: `maoloader ${update.version} is available`,
        description: `You're on ${update.old}. Update from the maoloader app, or download it.`,
        duration: 12000,
        action: { label: "Download", onClick: () => window.open?.(MAOLOADER_DOWNLOAD_URL, "_blank") },
      });
    }
  }

  Object.defineProperty(window, "__maoloaderFetchUpdate", {
    value: fetchLatestUpdate,
    enumerable: false,
    configurable: false,
    writable: false,
  });

  if (typeof document !== "undefined") {
    if (document.readyState === "complete" || document.readyState === "interactive") {
      setTimeout(initWelcomeSurface, 1);
    } else if (typeof document.addEventListener === "function") {
      document.addEventListener("DOMContentLoaded", initWelcomeSurface);
    }
  }

  // ---- Plugin settings ----
  // A plugin describes its settings once with PluginSettings.define(). maoloader keeps the values
  // in DataStore, checks every value against its field, and draws one settings window shared by
  // all plugins, opened from Ctrl+K.

  const SETTINGS_SURFACE_ID = "maoloader-plugin-settings";
  const SETTINGS_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/i;
  const SETTINGS_VALUE_TYPES = new Set(["toggle", "range", "number", "choice", "color", "text"]);
  const SETTINGS_LAYOUT_TYPES = new Set(["heading", "note", "button"]);
  const settingsRegistry = new Map();
  let settingsWindowCommandAdded = false;
  let settingsShownId = "";

  function settingsEscape(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }

  function settingsOptions(field) {
    return (Array.isArray(field.options) ? field.options : [])
      .map((option) => (typeof option === "object" && option !== null ? option : { value: option, label: String(option) }))
      .filter((option) => option.value !== undefined)
      .map((option) => ({ value: option.value, label: String(option.label ?? option.value) }));
  }

  function settingsDefault(field) {
    if (field.default !== undefined) {
      return field.default;
    }
    switch (field.type) {
      case "toggle":
        return false;
      case "range":
      case "number":
        return Number.isFinite(field.min) ? field.min : 0;
      case "choice":
        return settingsOptions(field)[0]?.value;
      case "color":
        return "#c8aa6e";
      default:
        return "";
    }
  }

  // Coerces a stored or entered value into something the field accepts, or its default.
  function normalizeSettingValue(field, value) {
    const fallback = () => (value === settingsDefault(field) ? value : normalizeSettingValue(field, settingsDefault(field)));
    switch (field.type) {
      case "toggle":
        return typeof value === "boolean" ? value : Boolean(settingsDefault(field));
      case "range":
      case "number": {
        const number = typeof value === "string" && value.trim() === "" ? NaN : Number(value);
        if (!Number.isFinite(number)) {
          const base = Number(settingsDefault(field));
          return Number.isFinite(base) ? base : 0;
        }
        const min = Number.isFinite(field.min) ? field.min : -Infinity;
        const max = Number.isFinite(field.max) ? field.max : Infinity;
        let result = Math.min(max, Math.max(min, number));
        if (Number.isFinite(field.step) && field.step > 0) {
          const origin = Number.isFinite(min) ? min : 0;
          result = origin + Math.round((result - origin) / field.step) * field.step;
          result = Math.min(max, Math.max(min, Number(result.toFixed(10))));
        }
        return result;
      }
      case "choice": {
        const options = settingsOptions(field);
        if (options.some((option) => option.value === value)) {
          return value;
        }
        const base = settingsDefault(field);
        return options.some((option) => option.value === base) ? base : options[0]?.value;
      }
      case "color":
        return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim().toLowerCase() : fallback();
      case "text": {
        const limit = Number.isFinite(field.maxLength) && field.maxLength > 0 ? field.maxLength : 500;
        return typeof value === "string" ? value.slice(0, limit) : String(settingsDefault(field) ?? "").slice(0, limit);
      }
      default:
        return value;
    }
  }

  function normalizeSettingsFields(fields) {
    const seen = new Set();
    return (Array.isArray(fields) ? fields : []).filter((field) => {
      if (typeof field !== "object" || field === null) {
        return false;
      }
      if (SETTINGS_LAYOUT_TYPES.has(field.type)) {
        return true;
      }
      if (!SETTINGS_VALUE_TYPES.has(field.type) || typeof field.key !== "string" || !field.key || seen.has(field.key)) {
        console.warn("[PluginSettings] Skipping a field without a known type or a unique key.", field);
        return false;
      }
      seen.add(field.key);
      return true;
    });
  }

  function settingsValueFields(entry) {
    return entry.fields.filter((field) => SETTINGS_VALUE_TYPES.has(field.type));
  }

  function readSettingsValues(entry) {
    const stored = window.DataStore?.get?.(entry.storageKey, undefined);
    const source = typeof stored === "object" && stored !== null ? stored : {};
    const values = {};
    for (const field of settingsValueFields(entry)) {
      values[field.key] = normalizeSettingValue(field, source[field.key]);
    }
    // Keys this version doesn't define are kept, so an older or newer plugin version loses nothing.
    entry.extras = Object.fromEntries(Object.entries(source).filter(([key]) => !(key in values)));
    return values;
  }

  function writeSettingsValues(entry) {
    // Re-read what's stored first: a plugin may keep its own data (lists, presets) in the same
    // object and change it after define(), and a save must never roll that back.
    const stored = window.DataStore?.get?.(entry.storageKey, undefined);
    if (typeof stored === "object" && stored !== null) {
      entry.extras = Object.fromEntries(Object.entries(stored).filter(([key]) => !(key in entry.values)));
    }
    window.DataStore?.set?.(entry.storageKey, { ...entry.extras, ...entry.values });
  }

  function notifySettings(entry, changed) {
    const snapshot = { ...entry.values };
    for (const listener of [...entry.listeners]) {
      try {
        listener(snapshot, changed);
      } catch (error) {
        console.warn(`[PluginSettings] A change listener for ${entry.id} failed.`, error);
      }
    }
  }

  function applySettingsChanges(entry, changes, { fromWindow = false } = {}) {
    const changed = [];
    for (const field of settingsValueFields(entry)) {
      if (!(field.key in changes)) {
        continue;
      }
      const next = normalizeSettingValue(field, changes[field.key]);
      if (!Object.is(next, entry.values[field.key])) {
        entry.values[field.key] = next;
        changed.push(field.key);
      }
    }
    if (!changed.length) {
      return changed;
    }
    writeSettingsValues(entry);
    notifySettings(entry, changed);
    if (settingsShownId === entry.id) {
      // Changes made in the window are already on screen; only visibility rules need a refresh.
      // Changes from code redraw the fields only, so a plugin's own page keeps its state.
      fromWindow ? refreshSettingsVisibility(entry) : renderSettingsFields(entry);
    }
    return changed;
  }

  function settingsHandle(entry) {
    return {
      id: entry.id,
      get(key) {
        return key === undefined ? { ...entry.values } : entry.values[key];
      },
      set(keyOrValues, value) {
        const changes = typeof keyOrValues === "object" && keyOrValues !== null ? keyOrValues : { [keyOrValues]: value };
        return applySettingsChanges(entry, changes);
      },
      reset() {
        const defaults = {};
        for (const field of settingsValueFields(entry)) {
          defaults[field.key] = settingsDefault(field);
        }
        return applySettingsChanges(entry, defaults);
      },
      onChange(listener) {
        if (typeof listener !== "function") {
          return () => {};
        }
        entry.listeners.add(listener);
        return () => entry.listeners.delete(listener);
      },
      open(options) {
        openSettingsWindow(entry.id, options);
      },
    };
  }

  function definePluginSettings(definition) {
    if (typeof definition !== "object" || definition === null || !SETTINGS_ID_PATTERN.test(String(definition.id ?? ""))) {
      throw new TypeError("PluginSettings.define needs an id made of letters, numbers, dots, dashes or underscores.");
    }
    const id = String(definition.id);
    const existing = settingsRegistry.get(id);
    const entry = existing ?? { id, listeners: new Set(), values: {}, extras: {} };
    entry.title = String(definition.title || id);
    entry.description = definition.description ? String(definition.description) : "";
    entry.icon = typeof definition.icon === "string" ? definition.icon : "";
    entry.storageKey = typeof definition.storageKey === "string" && definition.storageKey ? definition.storageKey : `${id}.settings`;
    entry.fields = normalizeSettingsFields(definition.fields);
    // A plugin can draw its own page under its fields: page.render(container, context), with an
    // optional page.destroy() when the page is left.
    entry.page = typeof definition.page?.render === "function" ? definition.page : undefined;
    entry.values = readSettingsValues(entry);
    settingsRegistry.set(id, entry);

    if (!existing) {
      window.CommandBar?.addAction?.({
        name: () => `Settings: ${entry.title}`,
        group: "plugin settings",
        tags: ["settings", "options", "preferences", id],
        perform: () => openSettingsWindow(id),
      });
    }
    if (!settingsWindowCommandAdded) {
      settingsWindowCommandAdded = true;
      window.CommandBar?.addAction?.({
        name: "Plugin settings",
        group: "maoloader",
        tags: ["settings", "options", "preferences", "plugins"],
        perform: () => openSettingsWindow(),
      });
    }
    if (settingsShownId) {
      renderSettingsWindow();
    }
    return settingsHandle(entry);
  }

  // ---- Plugin settings window ----

  const SETTINGS_CSS = `
    :host { all: initial; }
    *, *::before, *::after { box-sizing: border-box; }
    .backdrop { position: fixed; inset: 0; display: grid; place-items: center; background: rgba(1, 10, 19, 0.62); font: 13px/1.45 Inter, "Segoe UI", system-ui, sans-serif; color: #c8c3b4; }
    .sheet { display: grid; grid-template-columns: 196px minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr) auto; width: min(860px, calc(100vw - 48px)); height: min(600px, calc(100vh - 56px)); border: 1px solid rgba(200, 170, 110, 0.4); border-radius: 12px; background: linear-gradient(180deg, #0b1925, #050f18); box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6); overflow: hidden; }
    header { grid-column: 1 / -1; display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-bottom: 1px solid rgba(200, 170, 110, 0.16); }
    header h1 { margin: 0; color: #f0e6d2; font-size: 15px; font-weight: 800; letter-spacing: 0.02em; }
    header span { color: #8a949c; font-size: 12px; }
    .close { margin-left: auto; width: 30px; height: 30px; border: 0; border-radius: 7px; background: transparent; color: #a09b8c; font-size: 20px; cursor: pointer; }
    .close:hover { background: rgba(200, 170, 110, 0.12); color: #f0e6d2; }
    .sheet > nav { overflow-y: auto; padding: 10px 8px; border-right: 1px solid rgba(200, 170, 110, 0.12); background: rgba(1, 10, 19, 0.35); }
    .sheet > nav button { display: flex; width: 100%; align-items: center; gap: 9px; margin-bottom: 2px; padding: 8px 10px; border: 0; border-radius: 7px; background: transparent; color: #a09b8c; font: inherit; font-weight: 650; text-align: left; cursor: pointer; }
    .sheet > nav button img { width: 20px; height: 20px; border-radius: 5px; flex: none; }
    .sheet > nav button:hover { background: rgba(200, 170, 110, 0.08); color: #f0e6d2; }
    .sheet > nav button[aria-current="true"] { background: rgba(200, 170, 110, 0.14); color: #f0e6d2; }
    .body { overflow-y: auto; padding: 18px 20px; }
    .intro { margin: 0 0 14px; color: #8a949c; }
    .field { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 11px 0; border-bottom: 1px solid rgba(200, 170, 110, 0.08); }
    .field[hidden] { display: none; }
    .copy { display: grid; gap: 2px; min-width: 0; }
    .copy strong { color: #f0e6d2; font-weight: 650; }
    .copy small { color: #8a949c; font-size: 12px; }
    .heading { margin: 18px 0 2px; color: #c8aa6e; font-size: 11px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; }
    .heading:first-child { margin-top: 0; }
    .note { margin: 10px 0; padding: 9px 11px; border-left: 3px solid #785a28; border-radius: 5px; background: rgba(200, 170, 110, 0.06); color: #a09b8c; font-size: 12px; }
    .switch { position: relative; flex: none; width: 38px; height: 22px; }
    .switch input { position: absolute; inset: 0; opacity: 0; margin: 0; cursor: pointer; }
    .switch span { position: absolute; inset: 0; border: 1px solid rgba(200, 170, 110, 0.4); border-radius: 999px; background: #0a1824; transition: background 0.15s ease; pointer-events: none; }
    .switch span::after { content: ""; position: absolute; top: 3px; left: 3px; width: 14px; height: 14px; border-radius: 50%; background: #5d6872; transition: transform 0.15s ease, background 0.15s ease; }
    .switch input:checked + span { background: rgba(200, 170, 110, 0.25); border-color: #c8aa6e; }
    .switch input:checked + span::after { transform: translateX(16px); background: #f0e6d2; }
    .switch input:focus-visible + span { outline: 2px solid #c8aa6e; outline-offset: 2px; }
    .range { display: flex; align-items: center; gap: 10px; flex: none; }
    .range input { width: 160px; accent-color: #c8aa6e; }
    .range output { min-width: 44px; color: #f0e6d2; font-variant-numeric: tabular-nums; text-align: right; }
    .segmented { display: inline-flex; flex: none; gap: 2px; padding: 3px; border: 1px solid rgba(200, 170, 110, 0.22); border-radius: 8px; background: #06111c; }
    .segmented button { padding: 6px 11px; border: 0; border-radius: 6px; background: transparent; color: #a09b8c; font: inherit; font-weight: 650; cursor: pointer; }
    .segmented button[aria-checked="true"] { background: rgba(200, 170, 110, 0.18); color: #f0e6d2; }
    select, .text, .number { flex: none; height: 32px; padding: 0 10px; border: 1px solid rgba(200, 170, 110, 0.24); border-radius: 7px; background: #06111c; color: #f0e6d2; font: inherit; }
    .text { width: 220px; }
    .number { width: 96px; }
    select:focus, .text:focus, .number:focus { border-color: #c8aa6e; outline: none; }
    .color { flex: none; width: 44px; height: 30px; padding: 2px; border: 1px solid rgba(200, 170, 110, 0.3); border-radius: 7px; background: #06111c; cursor: pointer; }
    .action { flex: none; padding: 7px 14px; border: 1px solid #c8aa6e; border-radius: 7px; background: linear-gradient(180deg, #1e2328, #0a1428); color: #f0e6d2; font: inherit; font-weight: 700; cursor: pointer; }
    .action:hover { border-color: #f0e6d2; }
    .empty { display: grid; place-items: center; height: 100%; color: #8a949c; text-align: center; }
    footer { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 16px; border-top: 1px solid rgba(200, 170, 110, 0.12); color: #5d6872; font-size: 12px; }
    footer button { border: 0; background: none; color: #a09b8c; font: inherit; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
    footer button:hover { color: #f0e6d2; }
    /* Shared pieces for plugins that draw their own page (PluginSettings.define({ page })). */
    .page { display: block; }
    .button { padding: 7px 12px; border: 1px solid rgba(200, 170, 110, 0.3); border-radius: 7px; background: #06111c; color: #ddd8cc; font: inherit; font-weight: 650; cursor: pointer; }
    .button:hover:not(:disabled) { border-color: #c8aa6e; color: #f0e6d2; }
    .button:disabled { opacity: 0.5; cursor: default; }
    .button.primary { border-color: #c8aa6e; background: linear-gradient(180deg, #1e2328, #0a1428); color: #f0e6d2; font-weight: 700; }
    .subtabs { display: flex; flex-wrap: wrap; gap: 2px; margin: 0 0 14px; border-bottom: 1px solid rgba(200, 170, 110, 0.14); }
    .subtabs button { margin-bottom: -1px; padding: 8px 12px; border: 0; border-bottom: 2px solid transparent; background: none; color: #8a949c; font: inherit; font-weight: 650; cursor: pointer; }
    .subtabs button:hover { color: #f0e6d2; }
    .subtabs button[aria-selected="true"] { border-bottom-color: #c8aa6e; color: #f0e6d2; }
    .muted { color: #8a949c; }
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track, ::-webkit-scrollbar-corner { background: transparent; }
    ::-webkit-scrollbar-thumb { border: 2px solid transparent; border-radius: 999px; background: rgba(200, 170, 110, 0.35) padding-box; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(200, 170, 110, 0.6) padding-box; }
  `;

  function settingsFieldMarkup(field, value, index) {
    const label = settingsEscape(field.label || field.key || "");
    const copy = `<span class="copy"><strong>${label}</strong>${field.description ? `<small>${settingsEscape(field.description)}</small>` : ""}</span>`;
    const key = settingsEscape(field.key ?? "");
    switch (field.type) {
      case "heading":
        return `<p class="heading">${label}</p>`;
      case "note":
        return `<p class="note">${settingsEscape(field.text ?? field.label ?? "")}</p>`;
      case "button":
        return `<div class="field">${copy}<button class="action" type="button" data-action="${index}">${settingsEscape(field.buttonLabel || field.label || "Run")}</button></div>`;
      case "toggle":
        return `<label class="field" data-field="${key}">${copy}<span class="switch"><input type="checkbox" data-key="${key}" ${value ? "checked" : ""} /><span></span></span></label>`;
      case "range": {
        const unit = settingsEscape(field.unit ?? "");
        return `<div class="field" data-field="${key}">${copy}<span class="range"><input type="range" data-key="${key}" min="${field.min ?? 0}" max="${field.max ?? 100}" step="${field.step ?? 1}" value="${value}" aria-label="${label}" /><output>${settingsEscape(value)}${unit}</output></span></div>`;
      }
      case "number":
        return `<div class="field" data-field="${key}">${copy}<input class="number" type="number" data-key="${key}" ${Number.isFinite(field.min) ? `min="${field.min}"` : ""} ${Number.isFinite(field.max) ? `max="${field.max}"` : ""} step="${field.step ?? "any"}" value="${value}" aria-label="${label}" /></div>`;
      case "choice": {
        const options = settingsOptions(field);
        if (options.length <= 4) {
          return `<div class="field" data-field="${key}">${copy}<span class="segmented" role="radiogroup" aria-label="${label}">${options
            .map((option, optionIndex) => `<button type="button" role="radio" data-choice="${key}" data-option="${optionIndex}" aria-checked="${Object.is(option.value, value)}">${settingsEscape(option.label)}</button>`)
            .join("")}</span></div>`;
        }
        return `<div class="field" data-field="${key}">${copy}<select data-key="${key}" aria-label="${label}">${options
          .map((option, optionIndex) => `<option value="${optionIndex}" ${Object.is(option.value, value) ? "selected" : ""}>${settingsEscape(option.label)}</option>`)
          .join("")}</select></div>`;
      }
      case "color":
        return `<div class="field" data-field="${key}">${copy}<input class="color" type="color" data-key="${key}" value="${settingsEscape(value)}" aria-label="${label}" /></div>`;
      case "text":
        return `<div class="field" data-field="${key}">${copy}<input class="text" type="text" data-key="${key}" value="${settingsEscape(value)}" ${field.placeholder ? `placeholder="${settingsEscape(field.placeholder)}"` : ""} maxlength="${field.maxLength ?? 500}" aria-label="${label}" spellcheck="false" /></div>`;
      default:
        return "";
    }
  }

  function settingsRoot() {
    return document.getElementById?.(SETTINGS_SURFACE_ID)?.shadowRoot;
  }

  function refreshSettingsVisibility(entry) {
    const root = settingsRoot();
    if (!root) {
      return;
    }
    for (const field of entry.fields) {
      if (typeof field.showIf !== "function" || !field.key) {
        continue;
      }
      let visible = true;
      try {
        visible = Boolean(field.showIf({ ...entry.values }));
      } catch {
        visible = true;
      }
      const element = root.querySelector(`[data-field="${CSS.escape(field.key)}"]`);
      if (element) {
        element.hidden = !visible;
      }
    }
  }

  let settingsActivePage;

  function leaveSettingsPage() {
    const page = settingsActivePage;
    settingsActivePage = undefined;
    try {
      page?.destroy?.();
    } catch (error) {
      console.warn("[PluginSettings] A settings page failed to clean up.", error);
    }
  }

  function closeSettingsWindow() {
    leaveSettingsPage();
    settingsShownId = "";
    document.getElementById?.(SETTINGS_SURFACE_ID)?.remove?.();
  }

  function settingsFieldsMarkup(entry) {
    return entry.fields.map((field, index) => settingsFieldMarkup(field, field.key ? entry.values[field.key] : undefined, index)).join("");
  }

  function renderSettingsFields(entry) {
    const container = settingsRoot()?.querySelector?.("[data-fields]");
    if (container) {
      container.innerHTML = settingsFieldsMarkup(entry);
      refreshSettingsVisibility(entry);
    }
  }

  function renderSettingsWindow(options = {}) {
    const root = settingsRoot();
    if (!root) {
      return;
    }
    leaveSettingsPage();
    const entries = [...settingsRegistry.values()].sort((left, right) => left.title.localeCompare(right.title));
    const entry = settingsRegistry.get(settingsShownId) ?? entries[0];
    settingsShownId = entry?.id ?? "__none__";
    const hasValues = Boolean(entry && settingsValueFields(entry).length);
    const body = entry
      ? `${entry.description ? `<p class="intro">${settingsEscape(entry.description)}</p>` : ""}<div data-fields>${settingsFieldsMarkup(entry)}</div>${
          entry.page ? `<div class="page" data-page></div>` : ""
        }`
      : `<div class="empty">No plugin has settings yet.</div>`;
    root.innerHTML = `
      <style>${SETTINGS_CSS}</style>
      <div class="backdrop" data-backdrop>
        <section class="sheet" role="dialog" aria-modal="true" aria-label="Plugin settings">
          <header><h1>Plugin settings</h1><span>${entries.length} plugin${entries.length === 1 ? "" : "s"}</span><button class="close" type="button" data-close aria-label="Close">×</button></header>
          <nav aria-label="Plugins">${entries
            .map((item) => `<button type="button" data-plugin="${settingsEscape(item.id)}" aria-current="${item === entry}">${item.icon ? `<img src="${settingsEscape(item.icon)}" alt="" />` : ""}${settingsEscape(item.title)}</button>`)
            .join("")}</nav>
          <div class="body">${body}</div>
          <footer><span>Saved automatically</span>${hasValues ? `<button type="button" data-reset>Reset ${settingsEscape(entry.title)} to defaults</button>` : ""}</footer>
        </section>
      </div>`;
    if (!entry) {
      return;
    }
    refreshSettingsVisibility(entry);
    const pageContainer = root.querySelector("[data-page]");
    if (entry.page && pageContainer) {
      settingsActivePage = entry.page;
      try {
        entry.page.render(pageContainer, { settings: settingsHandle(entry), tab: options.tab, close: closeSettingsWindow });
      } catch (error) {
        console.warn(`[PluginSettings] The settings page of ${entry.id} failed to draw.`, error);
        pageContainer.innerHTML = `<p class="note">This plugin's settings page failed to load. Check its console logs.</p>`;
      }
    }
  }

  function settingsFieldFor(key) {
    return settingsRegistry.get(settingsShownId)?.fields.find((field) => field.key === key);
  }

  function bindSettingsWindow(root) {
    root.addEventListener("click", (event) => {
      const target = event.target;
      if (target.closest?.("[data-close]") || target.matches?.("[data-backdrop]")) {
        closeSettingsWindow();
        return;
      }
      const pluginButton = target.closest?.("[data-plugin]");
      if (pluginButton) {
        settingsShownId = pluginButton.getAttribute("data-plugin");
        renderSettingsWindow();
        return;
      }
      const entry = settingsRegistry.get(settingsShownId);
      if (!entry) {
        return;
      }
      if (target.closest?.("[data-reset]")) {
        settingsHandle(entry).reset();
        renderSettingsFields(entry);
        return;
      }
      // Everything below belongs to declared fields; a plugin's own page handles its own clicks.
      if (!target.closest?.("[data-fields]")) {
        return;
      }
      const choice = target.closest?.("[data-choice]");
      if (choice) {
        const field = settingsFieldFor(choice.getAttribute("data-choice"));
        const option = field && settingsOptions(field)[Number(choice.getAttribute("data-option"))];
        if (option) {
          applySettingsChanges(entry, { [field.key]: option.value }, { fromWindow: true });
          choice.parentElement?.querySelectorAll("[data-choice]").forEach((button) => button.setAttribute("aria-checked", String(button === choice)));
        }
        return;
      }
      const action = target.closest?.("[data-action]");
      if (action) {
        const field = entry.fields[Number(action.getAttribute("data-action"))];
        try {
          field?.action?.(settingsHandle(entry));
        } catch (error) {
          console.warn(`[PluginSettings] The "${field?.label}" button of ${entry.id} failed.`, error);
        }
      }
    });

    const onInput = (event) => {
      const input = event.target;
      if (!input.closest?.("[data-fields]")) {
        return;
      }
      const key = input.getAttribute?.("data-key");
      const entry = settingsRegistry.get(settingsShownId);
      const field = key && settingsFieldFor(key);
      if (!entry || !field) {
        return;
      }
      let value;
      if (field.type === "toggle") {
        value = input.checked;
      } else if (field.type === "choice") {
        value = settingsOptions(field)[Number(input.value)]?.value;
      } else if (field.type === "range" || field.type === "number") {
        // Let a number box be empty while typing; only commit when the field is left.
        if (field.type === "number" && event.type === "input") {
          return;
        }
        value = input.value;
      } else {
        value = input.value;
      }
      applySettingsChanges(entry, { [key]: value }, { fromWindow: true });
      if (field.type === "range") {
        const output = input.parentElement?.querySelector("output");
        if (output) {
          output.textContent = `${entry.values[key]}${field.unit ?? ""}`;
        }
      }
      if (field.type === "number" && event.type === "change") {
        input.value = entry.values[key];
      }
    };
    root.addEventListener("input", onInput);
    root.addEventListener("change", onInput);
    root.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        closeSettingsWindow();
      }
    });
  }

  // options.tab is handed to a plugin's page, so it can open on one of its own sections.
  function openSettingsWindow(id, options = {}) {
    if (typeof document === "undefined") {
      return;
    }
    const existing = document.getElementById?.(SETTINGS_SURFACE_ID);
    const surface = existing ?? createShadowSurface(SETTINGS_SURFACE_ID, "position:fixed;inset:0;z-index:2147483646;display:block;");
    const root = surface?.shadowRoot;
    if (!root) {
      return;
    }
    if (!existing) {
      bindSettingsWindow(root);
    }
    settingsShownId = id && settingsRegistry.has(id) ? id : settingsShownId && settingsRegistry.has(settingsShownId) ? settingsShownId : "";
    renderSettingsWindow(options && typeof options === "object" ? options : {});
    root.querySelector?.("[data-close]")?.focus?.();
  }

  window.PluginSettings = {
    define: definePluginSettings,
    get(id) {
      const entry = settingsRegistry.get(id);
      return entry ? settingsHandle(entry) : undefined;
    },
    list() {
      return [...settingsRegistry.values()].map((entry) => ({ id: entry.id, title: entry.title }));
    },
    open: openSettingsWindow,
    close: closeSettingsWindow,
  };

  function createRcp() {
    const callbackLength = Symbol("length");
    const prefix = "riotPlugin.announce:";
    const pluginRegistry = new Map();
    const callbacks = new Map();

    function isAnnounceEvent(event) {
      return typeof event?.type === "string" && event.type.startsWith(prefix);
    }

    async function invokeCallbacks(type, name, stateTransition, ...args) {
      const container = callbacks.get(name);
      const pending = container?.[type];
      if (!pending) {
        stateTransition();
        return;
      }

      while (pending.length > 0) {
        container[callbackLength] -= pending.length;
        await Promise.allSettled(pending.splice(0).map((callback) => callback(...args)));
      }

      if (container[callbackLength] === 0) {
        callbacks.delete(name);
      }
      stateTransition();
    }

    function addCallback(type, name, callback) {
      let container = callbacks.get(name);
      if (!container) {
        container = { [callbackLength]: 0 };
        callbacks.set(name, container);
      }

      const pending = container[type] || (container[type] = []);
      container[callbackLength]++;
      pending.push(callback);
    }

    function onPluginAnnounce(event) {
      const name = event.type.substring(prefix.length);
      noteLoadingStep(name);
      const registrationHandler = event.registrationHandler;
      if (typeof registrationHandler !== "function") {
        return;
      }

      function registrationHandlerWrap(registrar) {
        return registrationHandler.call(this, async function (provider) {
          const container = { impl: null, state: "preInit" };
          pluginRegistry.set(name, container);
          await invokeCallbacks("before", name, () => {
            container.state = "init";
          }, provider);
          const api = (container.impl = await registrar(provider));
          container.state = "postInit";
          await invokeCallbacks("after", name, () => {
            container.state = "fulfilled";
          }, api);
          return api;
        });
      }

      Object.defineProperty(event, "registrationHandler", {
        value: registrationHandlerWrap,
      });
    }

    if (typeof document !== "undefined" && typeof document.dispatchEvent === "function") {
      const dispatchEvent = document.dispatchEvent;
      Object.defineProperty(document, "dispatchEvent", {
        value(event) {
          if (isAnnounceEvent(event)) {
            onPluginAnnounce(event);
          }
          return dispatchEvent.call(this, event);
        },
      });
    }

    return {
      preInit(name, callback) {
        const pluginName = String(name);
        if (typeof callback !== "function") {
          throw new TypeError(`${callback} is not a function`);
        }

        const plugin = pluginRegistry.get(pluginName);
        if (!plugin || plugin.state === "preInit") {
          addCallback("before", pluginName, callback);
          return true;
        }

        return false;
      },
      postInit(name, callback, blocking = false) {
        const pluginName = String(name);
        if (typeof callback !== "function") {
          throw new TypeError(`${callback} is not a function`);
        }

        const plugin = pluginRegistry.get(pluginName);
        if (plugin && plugin.state === "fulfilled") {
          return false;
        }

        addCallback("after", pluginName, blocking ? callback : (api) => void callback(api));
        return true;
      },
      whenReady(param) {
        if (typeof param === "string") {
          return new Promise((resolve) => {
            if (!this.postInit(param, resolve)) {
              resolve(pluginRegistry.get(param).impl);
            }
          });
        }

        if (Array.isArray(param)) {
          return Promise.all(param.map((name) => this.whenReady(String(name))));
        }

        throw new TypeError(`unexpected argument ${param}`);
      },
      get(name) {
        let pluginName = String(name).toLowerCase();
        if (!pluginName.startsWith("rcp-")) {
          pluginName = `rcp-${pluginName}`;
        }
        return pluginRegistry.get(pluginName)?.impl;
      },
    };
  }

  function createRcpSocket(rcp) {
    let ws;
    const eventQueue = [];
    const listenersMap = new Map();

    function buildApi(api) {
      if (api === "all") {
        return "OnJsonApiEvent";
      }
      return `OnJsonApiEvent_${api.toLowerCase().replace(/^\/+|\/+$/g, "").replace(/\//g, "_")}`;
    }

    function handleMessage(event) {
      const [type, endpoint, data] = JSON.parse(event.data);
      if (type === 8 && listenersMap.has(endpoint)) {
        for (const callback of listenersMap.get(endpoint)) {
          setTimeout(() => callback(data), 0);
        }
      }
    }

    function disconnect(api, listener) {
      const endpoint = buildApi(api);
      if (!listenersMap.has(endpoint)) {
        return false;
      }

      const remaining = listenersMap.get(endpoint).filter((callback) => callback !== listener);
      if (remaining.length === 0) {
        if (ws?.readyState === 1) {
          ws.send(JSON.stringify([6, endpoint]));
        }
        listenersMap.delete(endpoint);
      } else {
        listenersMap.set(endpoint, remaining);
      }

      return true;
    }

    rcp.preInit("rcp-fe-common-libs", async function (provider) {
      const endpoint = provider?.context?.socket?._endpoint;
      if (!endpoint || typeof WebSocket !== "function") {
        return;
      }

      ws = new WebSocket(endpoint, "wamp");
      ws.addEventListener("open", () => {
        for (const eventName of eventQueue.splice(0, eventQueue.length)) {
          ws.send(JSON.stringify([5, eventName]));
        }
      });
      ws.addEventListener("message", handleMessage);
      window.addEventListener("beforeunload", () => ws.close());
    });

    return {
      observe(api, listener) {
        if (typeof api !== "string" || api === "" || typeof listener !== "function") {
          return false;
        }

        const endpoint = buildApi(api);
        const boundListener = listener.bind(globalThis);
        if (listenersMap.has(endpoint)) {
          listenersMap.get(endpoint).push(boundListener);
        } else {
          listenersMap.set(endpoint, [boundListener]);
        }

        if (ws?.readyState === 1) {
          ws.send(JSON.stringify([5, endpoint]));
        } else {
          eventQueue.push(endpoint);
        }

        return {
          disconnect: () => disconnect(api, boundListener),
        };
      },
      disconnect,
    };
  }

  const rcp = createRcp();
  const rcpSocket = createRcpSocket(rcp);

  Object.defineProperty(window, "rcp", {
    value: rcp,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  Object.defineProperty(window, "rcpSocket", {
    value: rcpSocket,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  Object.defineProperty(window, "socket", {
    value: rcpSocket,
    enumerable: false,
    configurable: false,
    writable: false,
  });

  function pluginInitContext(entry) {
    const initContext = { rcp, socket: rcpSocket };
    const root = pluginRootFromPath(entry);
    if (root) {
      initContext.meta = { name: root };
    }
    return initContext;
  }

  Object.defineProperty(window, "__maoloaderPluginInitContext", {
    value: pluginInitContext,
    enumerable: false,
    configurable: false,
    writable: false,
  });

  async function fetchPluginSource(entry) {
    const response = await fetch(pluginUrl(entry));
    if (response && "ok" in response && !response.ok) {
      throw new Error(`Plugin source request failed with ${response.status || "unknown status"}`);
    }
    if (!response || typeof response.text !== "function") {
      throw new Error("Plugin source response did not include text()");
    }
    return response.text();
  }

  function runClassicPlugin(source, entry) {
    const url = pluginUrl(entry);
    withPluginExecution(entry, () => {
      Function(
        "window",
        "document",
        "globalThis",
        "Pengu",
        "rcp",
        "socket",
        `${source}\n//# sourceURL=${url}`,
      )(window, document, window, pengu, rcp, rcpSocket);
    });
    return {};
  }

  function runCommonJsPlugin(source, entry) {
    const module = { exports: {} };
    const exports = module.exports;
    const require = function (specifier) {
      throw new Error(`Plugin "${entry}" tried to require "${specifier}", but require() is not available.`);
    };
    const url = pluginUrl(entry);

    withPluginExecution(entry, () => {
      Function(
        "module",
        "exports",
        "require",
        "window",
        "document",
        "globalThis",
        "Pengu",
        "rcp",
        "socket",
        `${source}\n//# sourceURL=${url}`,
      )(module, exports, require, window, document, window, pengu, rcp, rcpSocket);
    });

    if (typeof module.exports === "function") {
      return { default: module.exports };
    }

    return module.exports && typeof module.exports === "object" ? module.exports : {};
  }

  const esmModuleCache = new Map();
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

  function importBindingStatement(clause, specifier, entry) {
    const resolved = resolvePluginImport(specifier, entry);
    const trimmed = clause.trim();

    if (!trimmed) {
      return `await __import(${JSON.stringify(resolved)});`;
    }

    if (trimmed.startsWith("{")) {
      return `const ${trimmed.replace(/\bas\b/g, ":")} = await __import(${JSON.stringify(resolved)});`;
    }

    if (trimmed.startsWith("*")) {
      const match = /^\*\s+as\s+([\w$]+)$/.exec(trimmed);
      if (!match) {
        throw new Error(`Unsupported namespace import in "${entry}".`);
      }
      return `const ${match[1]} = await __import(${JSON.stringify(resolved)});`;
    }

    const mixed = /^([\w$]+)\s*,\s*([\s\S]+)$/.exec(trimmed);
    if (mixed) {
      const defaultName = mixed[1];
      const rest = mixed[2].trim();
      if (rest.startsWith("{")) {
        return `const { default: ${defaultName}, ${rest.slice(1, -1).replace(/\bas\b/g, ":")} } = await __import(${JSON.stringify(resolved)});`;
      }
      if (rest.startsWith("*")) {
        const match = /^\*\s+as\s+([\w$]+)$/.exec(rest);
        if (match) {
          return `const ${defaultName} = (await __import(${JSON.stringify(resolved)})).default; const ${match[1]} = await __import(${JSON.stringify(resolved)});`;
        }
      }
    }

    return `const ${trimmed} = (await __import(${JSON.stringify(resolved)})).default;`;
  }

  function transformEsmSource(source, entry) {
    const exported = [];
    let transformed = String(source);

    transformed = transformed.replace(
      /import\s+([^;]*?)\s+from\s*["']([^"']+)["']\s*;?/g,
      (_match, clause, specifier) => importBindingStatement(clause, specifier, entry),
    );
    transformed = transformed.replace(/import\s*["']([^"']+)["']\s*;?/g, (_match, specifier) => {
      const resolved = resolvePluginImport(specifier, entry);
      if (isStylePluginEntry(resolved)) {
        return `__loadStyle(${JSON.stringify(resolved)});`;
      }
      return `await __import(${JSON.stringify(resolved)});`;
    });
    transformed = transformed.replace(/\bimport\.meta\b/g, "__importMeta");
    transformed = transformed.replace(/export\s+default\s+/g, "__exports.default = ");
    transformed = transformed.replace(/export\s+(class|function)\s+([\w$]+)/g, (_match, kind, name) => {
      exported.push(name);
      return `${kind} ${name}`;
    });
    transformed = transformed.replace(/export\s+(const|let|var)\s+([\w$]+)/g, (_match, kind, name) => {
      exported.push(name);
      return `${kind} ${name}`;
    });
    transformed = transformed.replace(/export\s*\{([^}]+)\}\s*;?/g, (_match, names) => {
      return names
        .split(",")
        .map((part) => {
          const [local, exportedName] = part.trim().split(/\s+as\s+/);
          const name = (exportedName || local || "").trim();
          const value = (local || "").trim();
          return name && value ? `__exports[${JSON.stringify(name)}] = ${value};` : "";
        })
        .filter(Boolean)
        .join("\n");
    });

    if (exported.length > 0) {
      transformed += `\n${[...new Set(exported)]
        .map((name) => `__exports[${JSON.stringify(name)}] = ${name};`)
        .join("\n")}`;
    }

    return transformed;
  }

  async function loadEsmPluginModule(entry) {
    const normalized = normalizePluginEntry(entry);
    if (isStylePluginEntry(normalized)) {
      loadStylePlugin(normalized);
      return {};
    }

    if (esmModuleCache.has(normalized)) {
      return esmModuleCache.get(normalized);
    }

    const modulePromise = (async () => {
      const source = await fetchPluginSource(normalized);
      const exports = {};
      const transformed = transformEsmSource(source, normalized);
      const scopedSource = `{\n${transformed}\n}`;
      const runner = new AsyncFunction(
        "__exports",
        "__import",
        "__loadStyle",
        "__importMeta",
        "window",
        "document",
        "globalThis",
        "Pengu",
        "rcp",
        "socket",
        `${scopedSource}\n//# sourceURL=${pluginUrl(normalized)}`,
      );

      await withPluginExecution(normalized, () =>
        runner(
          exports,
          (specifier) => loadEsmPluginModule(specifier),
          (styleEntry) => loadStylePlugin(styleEntry),
          { url: pluginUrl(normalized) },
          window,
          document,
          window,
          pengu,
          rcp,
          rcpSocket,
        ),
      );
      return exports;
    })();

    esmModuleCache.set(normalized, modulePromise);
    return modulePromise;
  }

  async function loadScriptPlugin(entry) {
    const extension = pluginExtension(entry);

    if (extension === "mjs") {
      try {
        return await import(pluginUrl(entry));
      } catch {
        return loadEsmPluginModule(entry);
      }
    }

    let source;
    try {
      source = await fetchPluginSource(entry);
      if (extension === "cjs" || looksLikeCommonJs(source)) {
        return runCommonJsPlugin(source, entry);
      }
      if (!looksLikeModule(source)) {
        return runClassicPlugin(source, entry);
      }
    } catch (error) {
      if (extension === "cjs") {
        throw error;
      }
    }

    try {
      return await import(pluginUrl(entry));
    } catch (error) {
      if (source && looksLikeModule(source)) {
        return loadEsmPluginModule(entry);
      }
      throw error;
    }
  }

  function loadStylePlugin(entry) {
    if (typeof document === "undefined" || typeof document.createElement !== "function") {
      return;
    }

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = pluginUrl(entry);
    link.setAttribute?.("data-maoloader-plugin", entry);
    (document.head || document.documentElement || document.body)?.appendChild?.(link);
    pluginReport(entry, "load", "loaded", { kind: "stylesheet" });
  }

  function bindPluginLifecycle(plugin, entry) {
    if (typeof plugin.init === "function") {
      return Promise.resolve(withPluginExecution(entry, () => plugin.init(pluginInitContext(entry)))).then(() => plugin);
    }

    return Promise.resolve(plugin);
  }

  async function loadPlugin(entry) {
    let stage = "load";
    const normalized = normalizePluginEntry(entry);

    if (pluginFailureCount(normalized) >= PLUGIN_SAFE_MODE_THRESHOLD) {
      pluginReport(normalized, "safe-mode", "skipped", {
        failures: pluginFailureCount(normalized),
        threshold: PLUGIN_SAFE_MODE_THRESHOLD,
      });
      console.warn(
        "%c maoloader ",
        "background: #16231f; color: #9be2b2",
        `Skipped plugin "${entry}" because it failed ${PLUGIN_SAFE_MODE_THRESHOLD} times. Run __maoloaderResetPluginSafeMode("${normalized}") to retry.`,
      );
      return;
    }

    pluginReport(normalized, stage, "started");

    try {
      if (isStylePluginEntry(normalized)) {
        loadStylePlugin(normalized);
        resetPluginFailure(normalized);
        console.info("%c maoloader ", "background: #16231f; color: #9be2b2", `Loaded stylesheet "${normalized}".`);
        return;
      }

      let plugin = await loadScriptPlugin(normalized);

      stage = "initialize";
      pluginReport(normalized, stage, "started");
      plugin = await bindPluginLifecycle(plugin, normalized);

      if (typeof plugin.load === "function") {
        window.addEventListener("load", wrapPluginCallback(normalized, plugin.load));
        pluginReport(normalized, "load-listener", "registered", { export: "load" });
      } else if (typeof plugin.default === "function") {
        window.addEventListener("load", wrapPluginCallback(normalized, plugin.default));
        pluginReport(normalized, "load-listener", "registered", { export: "default" });
      }

      resetPluginFailure(normalized);
      pluginReport(normalized, "complete", "loaded");
      console.info("%c maoloader ", "background: #16231f; color: #9be2b2", `Loaded plugin "${normalized}".`);
    } catch (error) {
      recordPluginFailure(normalized, error);
      pluginReport(normalized, stage, "failed", { error: shortError(error) });
      console.error(
        "%c maoloader ",
        "background: #16231f; color: #9be2b2",
        `Failed to ${stage} plugin "${normalized}".`,
        error,
      );
    }
  }

  pengu.version = HAS_MAOLOADER_VERSION ? MAOLOADER_VERSION : "0.0.0";
  delete pengu.disabledPlugins;
  Object.freeze(pengu);

  const pluginLoadPromise = Promise.all(pengu.plugins.map(loadPlugin));
  rcp.preInit("rcp-fe-common-libs", async function () {
    await pluginLoadPromise;
  });
})();
