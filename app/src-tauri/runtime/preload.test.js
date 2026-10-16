import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, test } from "bun:test";

function createPreloadWindow({
  datastore = "{}",
  disabledPlugins,
  fetchImpl,
  isMac = false,
  plugins = [],
  penguVersion = "",
  readyState = "loading",
  readonlyPlugins = false,
  superPotato = false,
  welcomeHost = false,
  leagueVersion,
  WebSocket,
  isFrame = false,
  maoloaderVersion,
} = {}) {
  const calls = [];
  const dispatchedEvents = [];
  const documentListeners = [];
  const bodyChildren = [];
  const windowEvents = [];
  const windowListeners = [];
  let layerHost;
  function appendElement(parent, child) {
    parent.children ??= [];
    parent.children.push(child);
    child.parentNode = parent;
    return child;
  }
  function removeElement(parent, child) {
    parent.children = (parent.children || []).filter((entry) => entry !== child);
    if (parent === document.body) {
      const index = bodyChildren.indexOf(child);
      if (index >= 0) {
        bodyChildren.splice(index, 1);
      }
    }
  }
  function createShadowRoot(host) {
    return {
      children: [],
      host,
      appendChild(child) {
        return appendElement(this, child);
      },
      replaceChildren(...children) {
        this.children = [];
        for (const child of children) {
          appendElement(this, child);
        }
      },
    };
  }
  function findElementById(root, id) {
    if (!root) {
      return undefined;
    }
    if (root.id === id) {
      return root;
    }
    for (const child of root.children || []) {
      const found = findElementById(child, id);
      if (found) {
        return found;
      }
    }
    if (root.shadowRoot) {
      return findElementById(root.shadowRoot, id);
    }
    return undefined;
  }
  const window = {
    Pengu: {
      version: penguVersion,
      plugins,
      isMac,
      superPotato,
    },
    __native: {
      LoadDataStore: () => datastore,
      SaveDataStore: (value) => calls.push(["SaveDataStore", value]),
      OpenDevTools: () => calls.push(["OpenDevTools"]),
      OpenPluginsFolder: (path) => {
        calls.push(["OpenPluginsFolder", path]);
        return path === undefined || path === "existing";
      },
      PluginFS: (...args) => {
        calls.push(["PluginFS", ...args]);
        const operation = args[0];
        if (operation === "read") {
          return JSON.stringify({ ok: true, value: "file contents" });
        }
        if (operation === "write" || operation === "mkdir") {
          return JSON.stringify({ ok: true, value: true });
        }
        if (operation === "stat") {
          return JSON.stringify({ ok: true, value: { fileName: "index.js", length: 12, isDir: false } });
        }
        if (operation === "ls") {
          return JSON.stringify({ ok: true, value: ["index.js", "styles.css"] });
        }
        if (operation === "rm") {
          return JSON.stringify({ ok: true, value: 2 });
        }
        return JSON.stringify({ ok: false, value: null });
      },
      ReloadClient: () => calls.push(["ReloadClient"]),
      SetWindowTheme: (dark) => calls.push(["SetWindowTheme", dark]),
      SetWindowVibrancy: (...args) => calls.push(["SetWindowVibrancy", ...args]),
    },
    addEventListener: (type, listener, options) => {
      windowListeners.push({ type, listener, options });
    },
    dispatchEvent(event) {
      windowEvents.push(event);
      return true;
    },
    open: (...args) => calls.push(["open", ...args]),
  };
  if (disabledPlugins !== undefined) {
    window.Pengu.disabledPlugins = disabledPlugins;
  }
  if (isFrame) {
    window.top = {};
  }
  if (leagueVersion !== undefined) {
    window.__llver = leagueVersion;
  }
  if (readonlyPlugins) {
    Object.defineProperty(window.Pengu, "plugins", {
      value: plugins,
      enumerable: true,
      configurable: false,
      writable: false,
    });
  }
  const document = {
    readyState,
    head: {
      children: [],
      appendChild(element) {
        return appendElement(this, element);
      },
    },
    body: {
      children: bodyChildren,
      appendChild(element) {
        bodyChildren.push(element);
        element.parentNode = this;
        return element;
      },
      removeChild(child) {
        removeElement(this, child);
        child.removed = true;
        child.parentNode = undefined;
        return child;
      },
    },
    addEventListener(type, listener, options) {
      documentListeners.push({ type, listener, options });
    },
    createElement(name) {
      const element = {
        children: [],
        className: "",
        name,
        style: {
          cssText: "",
        },
        textContent: "",
        focus() {
          this.focused = true;
        },
        attachShadow() {
          this.shadowRoot = createShadowRoot(this);
          return this.shadowRoot;
        },
        appendChild(child) {
          return appendElement(this, child);
        },
        replaceChildren(...children) {
          this.children = [];
          for (const child of children) {
            appendElement(this, child);
          }
        },
        remove() {
          this.removed = true;
          this.parentNode?.removeChild?.(this);
        },
        setAttribute(name, value) {
          this.attributes ??= {};
          this.attributes[name] = value;
        },
        addEventListener(type, listener, options) {
          this.listeners ??= [];
          this.listeners.push({ type, listener, options });
        },
        removeChild(child) {
          removeElement(this, child);
          child.removed = true;
          child.parentNode = undefined;
          return child;
        },
      };
      if (name === "with-shadow") {
        element.attachShadow();
      }
      return element;
    },
    getElementById(id) {
      return findElementById(this.body, id) || findElementById(this.documentElement, id);
    },
    querySelector(selector) {
      if (selector === "lol-uikit-layer-manager-wrapper") {
        return layerHost;
      }
      if (selector === ".maoloader-welcome-root") {
        return findElementById(this.body, "maoloader-welcome-root");
      }
      return undefined;
    },
    dispatchEvent(event) {
      dispatchedEvents.push(event);
      return true;
    },
  };
  document.documentElement = {
    children: [],
    appendChild(element) {
      return appendElement(this, element);
    },
  };
  if (welcomeHost) {
    layerHost = document.createElement("lol-uikit-layer-manager-wrapper");
    layerHost.className = "lol-uikit-layer-manager-wrapper";
    document.body.appendChild(layerHost);
  }

  const testConsole = {};
  for (const level of ["debug", "log", "info", "warn", "error"]) {
    testConsole[level] = (...args) => calls.push(["console", level, ...args]);
  }

  let source = readFileSync(new URL("./preload.js", import.meta.url), "utf8");
  // The maoloader app stamps its version into the file when it writes it (runtime.rs).
  if (maoloaderVersion) source = source.replaceAll("__MAOLOADER_VERSION__", maoloaderVersion);
  vm.runInNewContext(source, {
    clearInterval,
    console: testConsole,
    document,
    fetch: (...args) => {
      calls.push(["fetch", ...args]);
      return fetchImpl ? fetchImpl(...args) : Promise.resolve();
    },
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    setInterval,
    setTimeout,
    TextEncoder,
    URL,
    URLSearchParams,
    WebSocket,
    window,
  });

  return {
    bodyChildren,
    calls,
    dispatchedEvents,
    document,
    documentListeners,
    window,
    windowEvents,
    windowListeners,
  };
}

function pluginHash(value) {
  const data = new TextEncoder().encode(String(value).toLowerCase().replace(/\\/g, "/"));
  let hash = 0x811c9dc5;

  for (const byte of data) {
    hash ^= byte;
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

async function flushPluginLoad() {
  await new Promise((resolve) => setTimeout(resolve, 5));
}

function shadowChildren(element) {
  return element?.shadowRoot?.children || element?.children || [];
}

function commandBarPanel(root) {
  return shadowChildren(root)[0]?.children?.[0];
}

function toastStack(root) {
  return root?.__maoloaderToastStack || shadowChildren(root).find((child) => child.style?.cssText?.includes("flex-direction:column"));
}

function welcomePanel(root) {
  return shadowChildren(root)[0]?.children?.[0];
}

function skipLoadingScreen(windowListeners) {
  // The welcome waits for the loading screen; Esc dismisses it, as a user can.
  windowListeners.filter(({ type }) => type === "keydown").at(-1).listener({ key: "Escape" });
  return new Promise((resolve) => setTimeout(resolve, 350));
}

function elementText(element) {
  return `${element?.textContent || ""}${(element?.children || []).map(elementText).join("")}`;
}

describe("preload native API globals", () => {
  test("sanitizes optional plugin folder paths before calling native", () => {
    const { calls, window } = createPreloadWindow();

    expect(window.openPluginsFolder("existing")).toBe(true);
    expect(window.openPluginsFolder("/existing")).toBe(true);
    expect(window.openPluginsFolder("../outside")).toBe(true);
    expect(window.openPluginsFolder("nested/../outside")).toBe(true);

    expect(calls).toEqual([
      ["OpenPluginsFolder", "existing"],
      ["OpenPluginsFolder", "existing"],
      ["OpenPluginsFolder", undefined],
      ["OpenPluginsFolder", undefined],
    ]);
  });

  test("exposes upstream-compatible client control helpers", async () => {
    const { calls, window } = createPreloadWindow();

    window.openDevTools();
    window.reloadClient();
    const restartResult = window.restartClient();

    expect(calls).toEqual([
      ["OpenDevTools"],
      ["ReloadClient"],
      ["fetch", "/riotclient/kill-and-restart-ux", { method: "POST" }],
    ]);
    expect(restartResult).toBeUndefined();
    expect("__native" in window).toBe(false);
  });

  test("exposes Pengu-compatible PluginFS promises rooted to the caller plugin", async () => {
    const { calls, window } = createPreloadWindow();
    window.getScriptPath = () => "https://plugins/PenguFamily/src/core/SaveManager.js";

    expect(await window.PluginFS.read("./index.js")).toBe("file contents");
    expect(await window.PluginFS.write("data/save.json", "{}", true)).toBe(true);
    expect(await window.PluginFS.mkdir("data/nested")).toBe(true);
    expect(await window.PluginFS.stat("index.js")).toEqual({
      fileName: "index.js",
      length: 12,
      isDir: false,
    });
    expect(await window.PluginFS.ls(".")).toEqual(["index.js", "styles.css"]);
    expect(await window.PluginFS.rm("data", true)).toBe(2);

    expect(calls.filter(([name]) => name === "PluginFS")).toEqual([
      ["PluginFS", "read", "PenguFamily", "./index.js", "", false],
      ["PluginFS", "write", "PenguFamily", "data/save.json", "{}", true],
      ["PluginFS", "mkdir", "PenguFamily", "data/nested", "", false],
      ["PluginFS", "stat", "PenguFamily", "index.js", "", false],
      ["PluginFS", "ls", "PenguFamily", ".", "", false],
      ["PluginFS", "rm", "PenguFamily", "data", "", true],
    ]);
  });

  test("maps Windows Effect calls to native backdrop and theme messages", () => {
    const { calls, window } = createPreloadWindow();

    window.Effect.apply("acrylic", { color: "#336699cc" });
    window.Effect.apply("mica", { material: "tabbed" });
    window.Effect.clear();
    window.Effect.setTheme("light");
    window.Effect.setTheme("dark");

    expect(calls).toEqual([
      ["SetWindowVibrancy", 2, 3432605235],
      ["SetWindowVibrancy", 4, 4],
      ["SetWindowVibrancy", null],
      ["SetWindowTheme", false],
      ["SetWindowTheme", true],
    ]);
  });

  test("maps macOS Effect calls to native vibrancy materials", () => {
    const { calls, window } = createPreloadWindow({ isMac: true });

    window.Effect.apply("vibrancy", { material: "Sidebar", alwaysOn: true });
    window.Effect.apply("mica");

    expect(calls).toEqual([
      ["SetWindowVibrancy", 7, 1],
      ["SetWindowVibrancy", 10, 0],
    ]);
  });

  test("intercepts RCP announcements and runs pre/post init callbacks", async () => {
    const { document, dispatchedEvents, window } = createPreloadWindow();
    const events = [];
    let wrappedRegistrar;
    const provider = { name: "provider" };

    window.rcp.preInit("rcp-test", (value) => events.push(["pre", value.name]));
    window.rcp.postInit("rcp-test", (api) => events.push(["post", api.ready]));

    const announceEvent = {
      type: "riotPlugin.announce:rcp-test",
      registrationHandler(registrar) {
        wrappedRegistrar = registrar;
        return "registered";
      },
    };

    expect(document.dispatchEvent(announceEvent)).toBe(true);
    expect(dispatchedEvents).toEqual([announceEvent]);
    expect(announceEvent.registrationHandler(async () => ({ ready: true }))).toBe("registered");

    const api = await wrappedRegistrar(provider);
    expect(api).toEqual({ ready: true });
    expect(events).toEqual([
      ["pre", "provider"],
      ["post", true],
    ]);
    expect(await window.rcp.whenReady("rcp-test")).toBe(api);
    expect(window.rcp.get("test")).toBe(api);
  });

  test("queues and disconnects RCP socket subscriptions", async () => {
    const sockets = [];
    class FakeWebSocket {
      static OPEN = 1;

      constructor(endpoint, protocol) {
        this.endpoint = endpoint;
        this.protocol = protocol;
        this.readyState = 0;
        this.listeners = new Map();
        this.sent = [];
        sockets.push(this);
      }

      addEventListener(type, listener) {
        this.listeners.set(type, listener);
      }

      send(message) {
        this.sent.push(message);
      }

      close() {
        this.closed = true;
      }

      emit(type, data) {
        this.listeners.get(type)?.(data);
      }
    }

    const { document, window } = createPreloadWindow({ WebSocket: FakeWebSocket });
    let wrappedRegistrar;
    const messages = [];

    const subscription = window.rcpSocket.observe("/lol-test/v1/items", (message) => {
      messages.push(message);
    });

    const announceEvent = {
      type: "riotPlugin.announce:rcp-fe-common-libs",
      registrationHandler(registrar) {
        wrappedRegistrar = registrar;
      },
    };
    document.dispatchEvent(announceEvent);
    announceEvent.registrationHandler(async () => ({ common: true }));

    await wrappedRegistrar({
      context: {
        socket: {
          _endpoint: "wss://127.0.0.1:2999/",
        },
      },
    });

    expect(sockets).toHaveLength(1);
    expect(sockets[0].endpoint).toBe("wss://127.0.0.1:2999/");
    expect(sockets[0].protocol).toBe("wamp");

    sockets[0].readyState = FakeWebSocket.OPEN;
    sockets[0].emit("open");
    expect(sockets[0].sent).toEqual(['[5,"OnJsonApiEvent_lol-test_v1_items"]']);

    sockets[0].emit("message", {
      data: JSON.stringify([8, "OnJsonApiEvent_lol-test_v1_items", { eventType: "Update" }]),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(messages).toEqual([{ eventType: "Update" }]);

    expect(subscription.disconnect()).toBe(true);
    expect(sockets[0].sent).toEqual([
      '[5,"OnJsonApiEvent_lol-test_v1_items"]',
      '[6,"OnJsonApiEvent_lol-test_v1_items"]',
    ]);
  });

  test("replays late load and DOMContentLoaded listeners", async () => {
    const { document, documentListeners, window, windowListeners } = createPreloadWindow();
    const events = [];

    expect(windowListeners[0].type).toBe("load");
    windowListeners[0].listener();
    window.addEventListener("load", () => events.push("window-load"));

    document.readyState = "interactive";
    document.addEventListener("DOMContentLoaded", () => events.push("document-domcontentloaded"));

    document.readyState = "complete";
    window.addEventListener("DOMContentLoaded", () => events.push("window-domcontentloaded"));

    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(events).toEqual([
      "window-load",
      "document-domcontentloaded",
      "window-domcontentloaded",
    ]);
    expect(documentListeners.map(({ type }) => type)).toEqual(["DOMContentLoaded"]);
  });

  test("replays load listeners when preload starts after document completion", async () => {
    const { window } = createPreloadWindow({
      datastore: '{"pengu-welcome":false}',
      readyState: "complete",
    });
    const events = [];

    window.addEventListener("load", () => events.push("window-load"));

    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(events).toEqual(["window-load"]);
  });

  test("enables super-potato mode on load when configured", () => {
    const { bodyChildren, calls, document, windowListeners } = createPreloadWindow({
      superPotato: true,
    });
    const loadListeners = windowListeners.filter(({ type }) => type === "load");

    for (const listener of loadListeners) {
      listener.listener();
    }
    const shadowElement = document.createElement("with-shadow");

    expect(bodyChildren).toHaveLength(1);
    expect(bodyChildren[0].name).toBe("style");
    expect(bodyChildren[0].textContent).toContain("transition: none !important");
    expect(shadowElement.shadowRoot.children).toHaveLength(1);
    expect(shadowElement.shadowRoot.children[0].textContent).toContain("transition-property: none");
    expect(calls.at(-1)).toEqual([
      "fetch",
      "/lol-settings/v1/local/lol-user-experience",
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          schemaVersion: 3,
          data: { potatoModeEnabled: true },
        }),
      },
    ]);
  });

  test("loads css plugin entries as stylesheets and ignores non-loadable entries", async () => {
    const { document, window } = createPreloadWindow({
      plugins: ["PenguFamily/styles.css", "PenguFamily/README.md"],
    });

    await flushPluginLoad();

    expect(window.Pengu.plugins).toEqual(["PenguFamily/styles.css"]);
    expect(document.head.children).toHaveLength(1);
    expect(document.head.children[0].name).toBe("link");
    expect(document.head.children[0].rel).toBe("stylesheet");
    expect(document.head.children[0].href).toBe("https://plugins/PenguFamily/styles.css");
    expect(document.head.children[0].attributes["data-maoloader-plugin"]).toBe("PenguFamily/styles.css");
  });

  test("loads CommonJS style plugin exports without requiring browser exports globals", async () => {
    const { window, windowListeners } = createPreloadWindow({
      plugins: ["Acrylical/InjectAcrylic.js"],
      fetchImpl: () =>
        Promise.resolve({
          ok: true,
          text: () =>
            Promise.resolve(`
exports.init = ({ meta }) => {
  window.__maoloaderTestMeta = meta.name;
};
exports.load = () => {
  window.__maoloaderTestLoaded = true;
};
`),
        }),
    });

    await flushPluginLoad();

    expect(window.__maoloaderTestMeta).toBe("Acrylical");
    const pluginLoadListener = windowListeners.filter(({ type }) => type === "load").at(-1);
    pluginLoadListener.listener();
    expect(window.__maoloaderTestLoaded).toBe(true);
  });

  test("runs classic script plugins when they are not ESM or CommonJS", async () => {
    const { window } = createPreloadWindow({
      plugins: ["classic/index.js"],
      maoloaderVersion: "0.1.3",
      fetchImpl: () =>
        Promise.resolve({
          ok: true,
          text: () => Promise.resolve("window.__maoloaderClassicRan = Pengu.version;"),
        }),
    });

    await flushPluginLoad();

    expect(window.__maoloaderClassicRan).toBe("0.1.3");
  });

  test("records plugin load reports and plugin-scoped console logs", async () => {
    const { window } = createPreloadWindow({
      plugins: ["reported/index.js"],
      fetchImpl: () =>
        Promise.resolve({
          ok: true,
          text: () =>
            Promise.resolve(`
console.log("booting", "reported");
export function load() {
  console.warn("loaded later");
}
`),
        }),
    });

    await flushPluginLoad();

    expect(window.__maoloaderPluginReports.map((report) => [report.entry, report.stage, report.status])).toContainEqual([
      "reported/index.js",
      "complete",
      "loaded",
    ]);
    expect(window.__maoloaderPluginLogs).toContainEqual(
      expect.objectContaining({
        entry: "reported/index.js",
        level: "log",
        message: "booting reported",
      }),
    );

    const pluginLoadListener = window.__maoloaderPluginReports.find(
      (report) => report.stage === "load-listener",
    );
    expect(pluginLoadListener.export).toBe("load");
  });

  test("safe-mode skips plugins after repeated failures and can be reset", async () => {
    const datastore = JSON.stringify({
      "maoloader-plugin-failures": {
        "broken/index.js": 3,
      },
    });
    const { calls, window } = createPreloadWindow({
      datastore,
      plugins: ["broken/index.js"],
      fetchImpl: () => {
        throw new Error("should not fetch skipped plugin");
      },
    });

    await flushPluginLoad();

    expect(calls.some(([name]) => name === "fetch")).toBe(false);
    expect(window.__maoloaderPluginReports).toContainEqual(
      expect.objectContaining({
        entry: "broken/index.js",
        stage: "safe-mode",
        status: "skipped",
      }),
    );
    expect(window.__maoloaderResetPluginSafeMode("broken/index.js")).toBe(true);
    expect(calls).toContainEqual(["SaveDataStore", JSON.stringify({ "maoloader-plugin-failures": {} })]);
  });

  test("loads ESM plugins through text fallback when dynamic import cannot fetch modules", async () => {
    const sources = new Map([
      [
        "PenguFamily/index.js",
        `
import './styles.css';
import { value, label } from './src/value.js';
import { Pengu } from './src/pengu.js';
import { moduleUrl } from './src/meta.js';

export function init(context) {
  window.__maoloaderEsmMeta = context.meta.name;
}

export function load() {
  window.__maoloaderEsmLoaded = value + label() + Pengu.bonus;
  window.__maoloaderEsmMetaUrl = moduleUrl;
}
`,
      ],
      [
        "PenguFamily/src/value.js",
        `
export const value = 40;
export function label() {
  return 2;
}
`,
      ],
      [
        "PenguFamily/src/pengu.js",
        `
export class Pengu {
  static bonus = 1;
}
`,
      ],
      [
        "PenguFamily/src/meta.js",
        `
export const moduleUrl = import.meta.url;
`,
      ],
    ]);
    const { document, window, windowListeners } = createPreloadWindow({
      plugins: ["PenguFamily/index.js"],
      fetchImpl: (url) => {
        const key = String(url).replace(/^https:\/\/plugins\//, "");
        return Promise.resolve({
          ok: sources.has(key),
          status: sources.has(key) ? 200 : 404,
          text: () => Promise.resolve(sources.get(key) || ""),
        });
      },
    });

    await flushPluginLoad();

    expect(window.__maoloaderEsmMeta).toBe("PenguFamily");
    expect(document.head.children).toHaveLength(1);
    expect(document.head.children[0].href).toBe("https://plugins/PenguFamily/styles.css");

    const pluginLoadListener = windowListeners.filter(({ type }) => type === "load").at(-1);
    pluginLoadListener.listener();
    expect(window.__maoloaderEsmLoaded).toBe(43);
    expect(window.__maoloaderEsmMetaUrl).toBe("https://plugins/PenguFamily/src/meta.js");
  });

  test("exposes CommandBar action registration and events", () => {
    const { window, windowEvents } = createPreloadWindow();
    const initialCount = window.__maoloaderCommandBarActions.length;
    const action = {
      name: "Plugin action",
      perform: () => "done",
    };

    window.CommandBar.addAction(action);
    window.CommandBar.show();
    window.CommandBar.update();

    expect(window.__maoloaderCommandBarActions).toHaveLength(initialCount + 1);
    expect(window.__maoloaderCommandBarActions.at(-1)).toEqual({
      name: "Plugin action",
      perform: action.perform,
      group: "uncategorized",
    });
    expect(windowEvents.map((event) => event.type)).toEqual([
      "maoloader:commandbar-update",
      "maoloader:commandbar-show",
      "maoloader:commandbar-update",
    ]);
    expect(windowEvents.at(-1).detail.actions).toHaveLength(initialCount + 1);
  });

  test("renders CommandBar overlay and runs filtered action from keyboard", () => {
    const { bodyChildren, window, windowListeners } = createPreloadWindow();
    const events = [];
    const action = {
      name: "Plugin action",
      tags: ["sample"],
      perform: () => events.push("performed"),
    };
    window.CommandBar.addAction(action);

    const keydown = windowListeners.find(({ type }) => type === "keydown");
    keydown.listener({
      code: "KeyK",
      ctrlKey: true,
      preventDefault: () => events.push("prevented"),
    });

    const root = bodyChildren.find((element) => element.className === "maoloader-commandbar-root");
    expect(root.style.display).toBe("flex");

    const panel = commandBarPanel(root);
    const input = panel.children[0];
    input.value = "sample";
    input.oninput();

    const filteredPanel = commandBarPanel(root);
    const filteredInput = filteredPanel.children[0];
    filteredInput.onkeydown({
      key: "ArrowUp",
      preventDefault: () => events.push("arrow-prevented"),
    });
    keydown.listener({
      key: "Enter",
      preventDefault: () => events.push("enter-prevented"),
    });

    expect(events).toEqual(["prevented", "arrow-prevented", "enter-prevented", "performed"]);
    expect(root.style.display).toBe("none");
  });

  test("CommandBar hover highlights exactly one row", () => {
    const { bodyChildren, window } = createPreloadWindow();
    for (const name of ["First", "Second", "Third"]) window.CommandBar.addAction({ name, perform() {} });
    window.CommandBar.show();

    const root = bodyChildren.find((element) => element.className === "maoloader-commandbar-root");
    const rows = commandBarPanel(root).children[1].children;
    const highlighted = () => rows.filter((row) => row.style.background !== "transparent").map((row) => elementText(row.children[0]));

    expect(highlighted()).toHaveLength(1);
    rows[1].onmouseenter();
    rows[2].onmouseenter();
    rows[0].onmouseenter();
    rows[3].onmouseenter();
    expect(highlighted()).toEqual([elementText(rows[3].children[0])]);
  });

  test("CommandBar and Toast recover when the client replaces their surfaces with blank copies", () => {
    const { bodyChildren, document, window } = createPreloadWindow();
    window.CommandBar.addAction({ name: "Plugin action", perform() {} });
    window.Toast.info("First");

    // Simulate the client rebuilding the body: originals detach, blank copies take their place.
    const copies = {};
    for (const id of ["maoloader-commandbar-root", "maoloader-toast-root"]) {
      const original = bodyChildren.find((element) => element.id === id);
      bodyChildren.splice(bodyChildren.indexOf(original), 1);
      original.isConnected = false;
      const copy = document.createElement("with-shadow");
      copy.id = id;
      copy.className = id;
      copy.style.cssText = original.style.cssText;
      document.body.appendChild(copy);
      copies[id] = copy;
    }

    window.CommandBar.show();
    const commandBar = copies["maoloader-commandbar-root"];
    expect(commandBar.style.display).toBe("flex");
    expect(elementText(commandBarPanel(commandBar))).toContain("Plugin action");

    window.Toast.success("Second");
    expect(elementText(toastStack(copies["maoloader-toast-root"]))).toContain("Second");
  });

  test("CommandBar arrow navigation selects later actions and search reveals hidden actions", () => {
    const { bodyChildren, window, windowListeners } = createPreloadWindow();
    const events = [];
    window.CommandBar.addAction({
      name: "First visible",
      group: "test",
      perform: () => events.push("first"),
    });
    window.CommandBar.addAction({
      name: "Second visible",
      group: "test",
      perform: () => events.push("second"),
    });
    window.CommandBar.addAction({
      name: "Hidden restart helper",
      hidden: true,
      group: "test",
      perform: () => events.push("hidden"),
    });

    const keydown = windowListeners.find(({ type }) => type === "keydown");
    keydown.listener({
      code: "KeyK",
      ctrlKey: true,
      preventDefault: () => events.push("open-prevented"),
    });
    const root = bodyChildren.find((element) => element.className === "maoloader-commandbar-root");
    const input = commandBarPanel(root).children[0];
    input.value = "visible";
    input.oninput();
    keydown.listener({
      key: "ArrowDown",
      preventDefault: () => events.push("down-prevented"),
    });
    keydown.listener({
      key: "Enter",
      preventDefault: () => events.push("enter-prevented"),
    });

    expect(events).toContain("second");

    window.CommandBar.show();
    const hiddenInput = commandBarPanel(root).children[0];
    hiddenInput.value = "hidden restart";
    hiddenInput.oninput();
    keydown.listener({
      key: "Enter",
      preventDefault: () => events.push("hidden-enter-prevented"),
    });

    expect(events).toContain("hidden");
  });

  test("includes maoloader and lobby CommandBar default actions", async () => {
    const { calls, window } = createPreloadWindow();
    const actions = window.__maoloaderCommandBarActions;
    const byName = (name) => actions.find((action) => action.name === name);

    byName("Visit maoloader home").perform();
    await byName("Create ARAM lobby").perform();
    await byName("Create normal lobby").perform();
    await byName("Create practice tool").perform();
    await byName("Quit PvP champ select").perform();

    expect(calls[0]).toEqual([
      "open",
      "https://maoloader.com",
      "_blank",
    ]);
    expect(calls[1]).toEqual([
      "fetch",
      "/lol-lobby/v2/lobby",
      {
        method: "POST",
        body: JSON.stringify({ queueId: 450 }),
        headers: { "Content-Type": "application/json" },
      },
    ]);
    expect(calls[2]).toEqual([
      "fetch",
      "/lol-lobby/v2/lobby",
      {
        method: "POST",
        body: JSON.stringify({ queueId: 430 }),
        headers: { "Content-Type": "application/json" },
      },
    ]);

    const practicePayload = JSON.parse(calls[3][2].body);
    expect(calls[3][1]).toBe("/lol-lobby/v2/lobby");
    expect(practicePayload.isCustom).toBe(true);
    expect(practicePayload.customGameLobby.configuration.gameMode).toBe("PRACTICETOOL");
    expect(practicePayload.customGameLobby.configuration.mapId).toBe(11);

    expect(calls[4][1].startsWith("/lol-login/v1/session/invoke?")).toBe(true);
    expect(calls[4][2]).toEqual({ method: "POST" });
    expect(decodeURIComponent(calls[4][1])).toContain("teambuilder-draft");
    expect(decodeURIComponent(calls[4][1])).toContain("quitV2");
  });

  test("builds upstream-compatible plugin init contexts", () => {
    const { window } = createPreloadWindow();

    const topLevel = window.__maoloaderPluginInitContext("top.js");
    const folder = window.__maoloaderPluginInitContext("folder/index.js");
    const scoped = window.__maoloaderPluginInitContext("@scope/plugin/index.js");

    expect(topLevel.meta).toBeUndefined();
    expect(topLevel.rcp).toBe(window.rcp);
    expect(topLevel.socket).toBe(window.rcpSocket);
    expect(window.socket).toBe(window.rcpSocket);
    expect(folder.meta).toEqual({ name: "folder" });
    expect(scoped.meta).toEqual({ name: "@scope/plugin" });
  });

  test("filters readonly Pengu plugin entries in place", () => {
    const plugins = ["@default/welcome/index.js", "disabled.js"];
    const { window } = createPreloadWindow({
      disabledPlugins: pluginHash("disabled.js"),
      plugins,
      readonlyPlugins: true,
    });

    expect(window.Pengu.plugins).toBe(plugins);
    expect(window.Pengu.plugins).toEqual([]);
    expect(Object.isFrozen(window.Pengu)).toBe(true);
  });

  test("sets Pengu version without clobbering League version global", () => {
    const { window } = createPreloadWindow({
      leagueVersion: "v13.24.1",
      penguVersion: "",
    });

    // Unstamped (dev builds and tests): no real version to report.
    expect(window.Pengu.version).toBe("0.0.0");
    expect(window.__llver).toBe("v13.24.1");
    expect(Object.isFrozen(window.Pengu)).toBe(true);
  });

  test("exposes Toast helpers with visible DOM fallback", async () => {
    const { bodyChildren, window } = createPreloadWindow();

    const success = window.Toast.success("Saved");
    const error = window.Toast.error("Failed");
    const info = window.Toast.info("Heads up");
    const warning = window.Toast.warning("Careful");
    const result = await window.Toast.promise(Promise.resolve("ok"), {
      loading: "Loading",
      success: "Loaded",
      error: "Nope",
    });

    expect(result).toBe("ok");
    expect(bodyChildren).toHaveLength(1);
    expect(bodyChildren[0].className).toBe("maoloader-toast-root");
    expect(toastStack(bodyChildren[0]).children).toHaveLength(5);
    expect(elementText(success)).toContain("Saved");
    expect(error.className).toBe("maoloader-toast maoloader-toast-error");
    expect(info.className).toBe("maoloader-toast maoloader-toast-info");
    expect(warning.className).toBe("maoloader-toast maoloader-toast-warning");
    expect(elementText(toastStack(bodyChildren[0]).children.at(-1))).toContain("Loaded");
    expect(toastStack(bodyChildren[0]).children.at(-1).className).toBe(
      "maoloader-toast maoloader-toast-success",
    );
  });

  test("normalizes Toast object messages and function promise labels", async () => {
    const { bodyChildren, window } = createPreloadWindow();

    const objectToast = window.Toast.success({ message: "Object saved", duration: 0 });
    const result = await window.Toast.promise(Promise.resolve({ count: 2 }), {
      loading: { text: "Counting", duration: 0 },
      success: (value) => `Loaded ${value.count}`,
      error: (error) => `Failed ${error.message}`,
      duration: 0,
    });

    expect(result).toEqual({ count: 2 });
    expect(elementText(objectToast)).toContain("Object saved");
    expect(elementText(toastStack(bodyChildren[0]).children.at(-1))).toContain("Loaded 2");
  });

  test("renders welcome surface, persists dismissal, and reports updates", async () => {
    const { bodyChildren, calls, documentListeners, windowListeners } = createPreloadWindow({
      fetchImpl: () =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              version: "0.1.4",
              notes: "maoloader v0.1.4",
            }),
        }),
      maoloaderVersion: "0.1.3",
      welcomeHost: true,
    });

    const domReady = documentListeners.find(({ type }) => type === "DOMContentLoaded");
    await skipLoadingScreen(windowListeners);
    await domReady.listener();

    const layerHost = bodyChildren.find(
      (element) => element.className === "lol-uikit-layer-manager-wrapper",
    );
    const welcome = layerHost.children.find(
      (element) => element.className === "maoloader-welcome-root",
    );
    const toastRoot = bodyChildren.find((element) => element.className === "maoloader-toast-root");

    expect(layerHost).toBeDefined();
    expect(welcome).toBeDefined();
    expect(calls).toContainEqual(["fetch", "https://maoloader.com/api/releases/latest.json"]);
    expect(elementText(toastStack(toastRoot).children.at(-1))).toContain("maoloader 0.1.4 is available");
    expect(elementText(toastStack(toastRoot).children.at(-1))).toContain("You're on 0.1.3");

    const panel = welcomePanel(welcome);
    const footer = panel.children[1];
    const checkbox = footer.children[0].children[0];
    const button = footer.children[1];

    checkbox.checked = true;
    checkbox.onchange();
    button.onclick();

    expect(calls).toContainEqual(["SaveDataStore", JSON.stringify({ "pengu-welcome": false })]);
    expect(welcome.removed).toBe(true);
  });

  test("dismisses welcome surface from delegated okay events", async () => {
    const { bodyChildren, documentListeners, windowListeners } = createPreloadWindow({ welcomeHost: true });

    const domReady = documentListeners.find(({ type }) => type === "DOMContentLoaded");
    await skipLoadingScreen(windowListeners);
    await domReady.listener();

    const layerHost = bodyChildren.find(
      (element) => element.className === "lol-uikit-layer-manager-wrapper",
    );
    const welcome = layerHost.children.find(
      (element) => element.className === "maoloader-welcome-root",
    );
    const panel = welcomePanel(welcome);
    const footer = panel.children[1];
    const button = footer.children[1];
    const delegatedPointerDown = documentListeners.find(({ type }) => type === "pointerdown");

    delegatedPointerDown.listener({
      target: button,
      preventDefault() {
        this.prevented = true;
      },
      stopPropagation() {
        this.stopped = true;
      },
      stopImmediatePropagation() {
        this.immediateStopped = true;
      },
    });

    expect(welcome.style.pointerEvents).toBe("none");
    expect(welcome.removed).toBe(true);
  });
});

describe("preload loading screen", () => {
  function loadingRoot(document) {
    return document.documentElement.children.find((element) => element.id === "maoloader-loading-root");
  }

  function loadingText(root) {
    return shadowChildren(root).map(elementText).join(" ");
  }

  // Lets a test decide whether Riot's own loading screen is on the page.
  function stubRiotLoading(document) {
    const original = document.querySelector.bind(document);
    const state = { riot: undefined, navigation: undefined };
    document.querySelector = (selector) => {
      if (selector === ".lol-loading-screen-container") return state.riot;
      if (selector === 'div[data-screen-name="rcp-fe-lol-navigation-screen"]') return state.navigation;
      return original(selector);
    };
    return state;
  }

  test("covers the boot screen with plugin progress and the client part being loaded", async () => {
    const { document } = createPreloadWindow({ plugins: ["theme.css", "broken/index.js"] });
    const root = loadingRoot(document);

    expect(root).toBeDefined();
    expect(root.style.cssText).toContain("position:fixed");
    expect(loadingText(root)).toContain("Starting the client");

    document.dispatchEvent({ type: "riotPlugin.announce:rcp-fe-lol-champ-select", registrationHandler() {} });
    expect(loadingText(root)).toContain("Loading champ select");

    await flushPluginLoad();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(loadingText(root)).toContain("maoloader · 1 of 2 plugins ready · 1 failed");
  });

  test("goes away once Riot's loading screen has come and gone", async () => {
    const { document } = createPreloadWindow();
    const riot = stubRiotLoading(document);
    const root = loadingRoot(document);

    riot.riot = { className: "lol-loading-screen-container" };
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(root.removed).toBeUndefined();

    riot.riot = undefined;
    await new Promise((resolve) => setTimeout(resolve, 650));
    expect(root.style.opacity).toBe("0");
    expect(root.removed).toBe(true);
  });

  test("goes away when Riot's loading screen is hidden but left on the page", async () => {
    const { calls, document } = createPreloadWindow();
    const riot = stubRiotLoading(document);
    const root = loadingRoot(document);

    let visible = true;
    riot.riot = { className: "lol-loading-screen-container", getClientRects: () => (visible ? [{}] : []) };
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(root.removed).toBeUndefined();

    visible = false;
    await new Promise((resolve) => setTimeout(resolve, 650));
    expect(root.removed).toBe(true);
    const log = calls.find(([kind, level, , , message]) => kind === "console" && level === "info" && String(message).startsWith("Loading screen hidden"));
    expect(log[4]).toContain("Riot's loading screen finished");
  });

  test("goes away when the client's top bar appears without Riot's screen", async () => {
    const { document } = createPreloadWindow();
    const riot = stubRiotLoading(document);
    const root = loadingRoot(document);

    riot.navigation = { className: "navigation" };
    await new Promise((resolve) => setTimeout(resolve, 650));
    expect(root.removed).toBe(true);
  });

  test("Escape skips it", async () => {
    const { document, windowListeners } = createPreloadWindow();
    const root = loadingRoot(document);
    const skip = windowListeners.filter(({ type }) => type === "keydown").at(-1);

    skip.listener({ key: "Escape" });
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(root.removed).toBe(true);
  });

  test("can be switched back to Riot's loading screen", () => {
    const { calls, document, window } = createPreloadWindow({ datastore: JSON.stringify({ "maoloader-loading-screen": false }) });
    expect(loadingRoot(document)).toBeUndefined();

    const toggle = window.__maoloaderCommandBarActions.find((action) => typeof action.name === "function" && action.name().includes("loading screen"));
    expect(toggle.name()).toBe("Use maoloader's loading screen");
    toggle.perform();
    expect(calls.find(([name]) => name === "SaveDataStore")[1]).toContain('"maoloader-loading-screen":true');
  });

  test("holds the welcome until the loading screen is gone, then shows plugin status", async () => {
    const { bodyChildren, documentListeners, windowListeners } = createPreloadWindow({ welcomeHost: true, plugins: ["theme.css"] });
    const domReady = documentListeners.find(({ type }) => type === "DOMContentLoaded");
    const layerHost = bodyChildren.find((element) => element.className === "lol-uikit-layer-manager-wrapper");
    const welcome = () => layerHost.children.find((element) => element.className === "maoloader-welcome-root");

    const opening = domReady.listener();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(welcome()).toBeUndefined();

    windowListeners.filter(({ type }) => type === "keydown").at(-1).listener({ key: "Escape" });
    await opening;
    const text = elementText(shadowChildren(welcome())[0]);
    expect(text).toContain("You're all set");
    expect(text).toContain("1 of 1 plugin loaded");
    expect(text).toContain("Let's play");
  });

  test("clicks elsewhere in the welcome don't dismiss it", async () => {
    const { bodyChildren, documentListeners, windowListeners } = createPreloadWindow({ welcomeHost: true });
    const domReady = documentListeners.find(({ type }) => type === "DOMContentLoaded");
    windowListeners.filter(({ type }) => type === "keydown").at(-1).listener({ key: "Escape" });
    await domReady.listener();
    const layerHost = bodyChildren.find((element) => element.className === "lol-uikit-layer-manager-wrapper");
    const welcome = layerHost.children.find((element) => element.className === "maoloader-welcome-root");
    const checkbox = welcomePanel(welcome).children[1].children[0].children[0];
    const delegatedClick = documentListeners.find(({ type }) => type === "click");

    // A click on the checkbox arrives at the page retargeted to the popup's host.
    const event = { target: welcome, composedPath: () => [checkbox, welcome], preventDefault() { this.prevented = true; } };
    delegatedClick.listener(event);
    expect(welcome.removed).toBeUndefined();
    expect(event.prevented).toBeUndefined();
  });

  test("reports the stamped maoloader version", () => {
    const { window } = createPreloadWindow({ maoloaderVersion: "0.1.3" });
    expect(window.Pengu.version).toBe("0.1.3");
  });

  test("only checks maoloader's own releases, and only with a real version", async () => {
    const released = (version) => () => Promise.resolve({ ok: true, json: () => Promise.resolve({ version }) });

    // Unstamped dev build: no request at all.
    const dev = createPreloadWindow({ fetchImpl: released("9.9.9") });
    expect(await dev.window.__maoloaderFetchUpdate()).toBe(false);
    expect(dev.calls.some(([name, url]) => name === "fetch" && String(url).includes("releases"))).toBe(false);

    // Up to date: nothing to report, whatever other projects have released.
    const current = createPreloadWindow({ fetchImpl: released("0.1.3"), maoloaderVersion: "0.1.3" });
    expect(await current.window.__maoloaderFetchUpdate()).toBe(false);
    expect(current.calls.some(([, url]) => String(url).includes("PenguLoader"))).toBe(false);

    const behind = createPreloadWindow({ fetchImpl: released("v0.2.0"), maoloaderVersion: "0.1.3" });
    expect(await behind.window.__maoloaderFetchUpdate()).toEqual({ old: "0.1.3", version: "0.2.0", changelog: "" });
  });

  test("only shows on the client's main page, not inside frames", () => {
    const { document } = createPreloadWindow({ isFrame: true });
    expect(loadingRoot(document)).toBeUndefined();
  });
});

describe("plugin settings", () => {
  const fields = [
    { type: "heading", label: "General" },
    { key: "enabled", type: "toggle", label: "Enabled", default: true },
    { key: "delay", type: "range", label: "Delay", min: 0, max: 10, step: 0.5, unit: "s", default: 2 },
    { key: "mode", type: "choice", label: "Mode", options: [{ value: "fast", label: "Fast" }, "slow"], default: "fast" },
    { key: "accent", type: "color", label: "Accent", default: "#C8AA6E" },
    { key: "name", type: "text", label: "Name", maxLength: 5 },
    { key: "count", type: "number", label: "Count", min: 1 },
    { type: "button", label: "Do it", action: () => {} },
    { type: "mystery", key: "nope" },
  ];

  test("defines settings with defaults and checks every stored value", () => {
    const datastore = JSON.stringify({
      "demo.settings": { enabled: "yes", delay: 12.3, mode: "warp", accent: "#123ABC", name: "abcdefgh", count: -4, legacy: 7 },
    });
    const { window } = createPreloadWindow({ datastore });

    const settings = window.PluginSettings.define({ id: "demo", title: "Demo", fields });
    expect(settings.get()).toEqual({ enabled: true, delay: 10, mode: "fast", accent: "#123abc", name: "abcde", count: 1 });
    expect(window.PluginSettings.list()).toEqual([{ id: "demo", title: "Demo" }]);
  });

  test("set saves, keeps unknown stored keys and tells listeners what changed", () => {
    const datastore = JSON.stringify({ "demo.settings": { legacy: 7 } });
    const { window, calls } = createPreloadWindow({ datastore });
    const settings = window.PluginSettings.define({ id: "demo", fields });
    const seen = [];
    const stop = settings.onChange((values, changed) => seen.push([values.delay, changed]));

    expect(settings.set("delay", 3.26)).toEqual(["delay"]);
    expect(settings.get("delay")).toBe(3.5);
    expect(settings.set("delay", 3.5)).toEqual([]);
    expect(settings.set({ mode: "slow", enabled: false })).toEqual(["enabled", "mode"]);
    stop();
    settings.set("delay", 1);

    expect(seen).toEqual([
      [3.5, ["delay"]],
      [3.5, ["enabled", "mode"]],
    ]);
    const saved = JSON.parse(calls.filter(([name]) => name === "SaveDataStore").at(-1)[1]);
    expect(saved["demo.settings"]).toEqual({ legacy: 7, enabled: false, delay: 1, mode: "slow", accent: "#c8aa6e", name: "", count: 1 });
  });

  test("reset returns every field to its default", () => {
    const { window } = createPreloadWindow();
    const settings = window.PluginSettings.define({ id: "demo", fields });
    settings.set({ delay: 7, mode: "slow" });
    expect(settings.reset().sort()).toEqual(["delay", "mode"]);
    expect(settings.get("delay")).toBe(2);
  });

  test("a failing listener doesn't stop the others", () => {
    const { window } = createPreloadWindow();
    const settings = window.PluginSettings.define({ id: "demo", fields });
    const seen = [];
    settings.onChange(() => {
      throw new Error("boom");
    });
    settings.onChange((values) => seen.push(values.enabled));
    settings.set("enabled", false);
    expect(seen).toEqual([false]);
  });

  test("adds a command per plugin and one for the settings window", () => {
    const { window } = createPreloadWindow();
    window.PluginSettings.define({ id: "demo", title: "Demo", fields });
    window.PluginSettings.define({ id: "other", title: "Other", fields: [] });
    window.PluginSettings.define({ id: "demo", title: "Demo again", fields });
    const names = window.__maoloaderCommandBarActions.map((action) => (typeof action.name === "function" ? action.name() : action.name));
    expect(names.filter((name) => name === "Plugin settings")).toHaveLength(1);
    expect(names).toContain("Settings: Demo again");
    expect(names).toContain("Settings: Other");
    expect(names.filter((name) => String(name).startsWith("Settings: "))).toHaveLength(2);
  });

  test("rejects ids that aren't safe storage keys", () => {
    const { window } = createPreloadWindow();
    expect(() => window.PluginSettings.define({ id: "../evil", fields })).toThrow();
    expect(() => window.PluginSettings.define({ fields })).toThrow();
  });
});

describe("plugin settings and plugin-owned data", () => {
  test("a save keeps data the plugin stored in the same object after define()", () => {
    const { window, calls } = createPreloadWindow({ datastore: JSON.stringify({ "lists.settings": { enabled: true, watched: ["a"] } }) });
    const settings = window.PluginSettings.define({ id: "lists", fields: [{ key: "enabled", type: "toggle", default: true }] });
    // The plugin updates its own list directly, then a field changes.
    window.DataStore.set("lists.settings", { ...window.DataStore.get("lists.settings"), watched: ["a", "b"] });
    settings.set("enabled", false);
    const saved = JSON.parse(calls.filter(([name]) => name === "SaveDataStore").at(-1)[1]);
    expect(saved["lists.settings"]).toEqual({ enabled: false, watched: ["a", "b"] });
  });
});
