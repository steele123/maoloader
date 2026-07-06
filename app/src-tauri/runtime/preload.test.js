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

  const source = readFileSync(new URL("./preload.js", import.meta.url), "utf8");
  vm.runInNewContext(source, {
    clearInterval,
    console,
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
      fetchImpl: () =>
        Promise.resolve({
          ok: true,
          text: () => Promise.resolve("window.__maoloaderClassicRan = Pengu.version;"),
        }),
    });

    await flushPluginLoad();

    expect(window.__maoloaderClassicRan).toBe("0.1.0");
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

  test("includes upstream Pengu and lobby CommandBar default actions", async () => {
    const { calls, window } = createPreloadWindow();
    const actions = window.__maoloaderCommandBarActions;
    const byName = (name) => actions.find((action) => action.name === name);

    byName("Visit Pengu home").perform();
    await byName("Create ARAM lobby").perform();
    await byName("Create normal lobby").perform();
    await byName("Create practice tool").perform();
    await byName("Quit PvP champ select").perform();

    expect(calls[0]).toEqual([
      "open",
      "https://pengu.lol",
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

    expect(window.Pengu.version).toBe("0.1.0");
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
    const { bodyChildren, calls, documentListeners } = createPreloadWindow({
      fetchImpl: () =>
        Promise.resolve({
          json: () =>
            Promise.resolve({
              tag_name: "v9.9.9",
              body: "New release",
            }),
        }),
      welcomeHost: true,
    });

    const domReady = documentListeners.find(({ type }) => type === "DOMContentLoaded");
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
    expect(elementText(toastStack(toastRoot).children.at(-1))).toContain("Update available - v9.9.9");

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
    const { bodyChildren, documentListeners } = createPreloadWindow({ welcomeHost: true });

    const domReady = documentListeners.find(({ type }) => type === "DOMContentLoaded");
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
