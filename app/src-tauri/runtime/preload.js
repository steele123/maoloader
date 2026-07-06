(function () {
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

    if (!commandBarRoot) {
      commandBarRoot = createShadowSurface("maoloader-commandbar-root", "position:fixed;inset:0;z-index:2147483646;display:none;");
    }

    return commandBarRoot;
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
      row.dataset.active = String(index === commandBarActiveIndex);
      row.style.cssText =
        "box-sizing:border-box;width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;border:0;border-radius:6px;padding:10px 12px;background:transparent;color:inherit;text-align:left;font:14px system-ui,sans-serif;cursor:pointer;";
      if (index === commandBarActiveIndex) {
        row.style.background = "rgba(22,35,31,.12)";
      }
      row.onmouseenter = () => {
        commandBarActiveIndex = index;
        row.style.background = "rgba(22,35,31,.08)";
      };
      row.onmouseleave = () => {
        row.style.background = index === commandBarActiveIndex ? "rgba(22,35,31,.12)" : "transparent";
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

    if (!toastRoot) {
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

  function parseVersion(version) {
    const match = /v?(\d+(?:\.\d+){2,3})/i.exec(String(version || ""));
    if (!match) {
      return 0;
    }

    const parts = match[1].split(".").map((part) => Number(part) || 0);
    return parts[0] * 10000 * 10000 + parts[1] * 10000 + parts[2] + (parts[3] || 0) / 10000;
  }

  async function fetchLatestUpdate() {
    const currentVersion = pengu.version || window.__llver || "v0.0.0";

    try {
      const response = await fetch("https://api.github.com/repos/PenguLoader/PenguLoader/releases/latest");
      const release = await response?.json?.();
      const latestVersion = release?.tag_name;
      if (parseVersion(latestVersion) > parseVersion(currentVersion)) {
        return {
          old: currentVersion,
          version: latestVersion,
          changelog: String(release?.body || ""),
        };
      }
    } catch (error) {
      console.warn("maoloader failed to fetch update.", error);
    }

    return false;
  }

  const WELCOME_HOST_SELECTOR = "lol-uikit-layer-manager-wrapper";

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
      "position:fixed;inset:0;z-index:2147483645;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);font:14px system-ui,sans-serif;color:#1f2925;pointer-events:auto;",
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

    const shell = document.createElement("div");
    shell.className = "maoloader-welcome-shell";
    shell.style.cssText =
      "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);font:14px system-ui,sans-serif;color:#1f2925;pointer-events:auto;";

    const panel = document.createElement("div");
    panel.className = "maoloader-welcome-panel";
    panel.style.cssText =
      "box-sizing:border-box;width:min(520px,calc(100vw - 32px));border-radius:8px;background:#fff;box-shadow:0 24px 80px rgba(0,0,0,.35);overflow:hidden;";

    const body = document.createElement("div");
    body.className = "maoloader-welcome-body";
    body.style.cssText = "display:flex;gap:14px;padding:22px 24px 18px;";

    const badge = document.createElement("div");
    badge.className = "maoloader-welcome-badge";
    badge.style.cssText =
      "flex:0 0 auto;width:44px;height:44px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:#141d26;box-shadow:0 10px 24px rgba(20,29,38,.18);overflow:hidden;";

    const badgeIcon = document.createElement("img");
    badgeIcon.src = MAOLOADER_ICON_URL;
    badgeIcon.alt = "";
    badgeIcon.decoding = "async";
    badgeIcon.loading = "eager";
    badgeIcon.style.cssText = "display:block;width:34px;height:34px;object-fit:contain;";
    badge.appendChild(badgeIcon);

    const copy = document.createElement("div");
    copy.className = "maoloader-welcome-copy";

    const title = document.createElement("h3");
    title.textContent = "maoloader";
    title.style.cssText = "margin:0 0 8px;font:600 16px system-ui,sans-serif;color:#0f1916;";

    const text = document.createElement("p");
    text.textContent =
      "maoloader is active. Drop plugins into the plugins folder, reload the client, and use CommandBar or Toast from your plugins.";
    text.style.cssText = "margin:0;line-height:1.45;color:#33443d;";

    const links = document.createElement("div");
    links.className = "maoloader-welcome-links";
    links.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;";

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
        "display:inline-flex;align-items:center;padding:4px 8px;border-radius:6px;background:#eef3f0;color:#20342d;text-decoration:none;font-size:12px;";
      links.appendChild(link);
    }

    copy.appendChild(title);
    copy.appendChild(text);
    copy.appendChild(links);
    body.appendChild(badge);
    body.appendChild(copy);

    const footer = document.createElement("div");
    footer.className = "maoloader-welcome-footer";
    footer.style.cssText =
      "display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 24px;background:#f4f6f5;";

    const label = document.createElement("label");
    label.style.cssText = "display:flex;align-items:center;gap:8px;color:#41554d;font-size:13px;";

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
    button.textContent = "Okay";
    button.tabIndex = 0;
    button.style.cssText =
      "position:relative;z-index:1;border:0;border-radius:6px;background:#d8dedb;color:#182620;padding:6px 12px;text-transform:uppercase;font:600 12px system-ui,sans-serif;cursor:pointer;pointer-events:auto;";
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
      if (target === button || target === root) {
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
    button.focus?.();
    return root;
  }

  async function initWelcomeSurface() {
    if (window.DataStore?.get("pengu-welcome", true) !== false) {
      renderWelcome(await waitForWelcomeHost());
    } else {
      window.Toast?.success?.("maoloader is active");
    }

    const update = await fetchLatestUpdate();
    if (update) {
      window.Toast?.success?.(`Update available - ${update.version}`);
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

  pengu.version = "0.1.0";
  delete pengu.disabledPlugins;
  Object.freeze(pengu);

  const pluginLoadPromise = Promise.all(pengu.plugins.map(loadPlugin));
  rcp.preInit("rcp-fe-common-libs", async function () {
    await pluginLoadPromise;
  });
})();
