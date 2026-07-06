/**
 * @description Diagnostic plugin for testing maoloader compatibility APIs.
 * @author steel
 * @link https://github.com/steele123/maoloader
 */
(function () {
  const pluginName = "maoloader-testkit";
  const rootId = "maoloader-testkit";
  const stylesheetId = "maoloader-testkit-styles";
  const storeKey = "maoloader-testkit.clicks";
  let pluginRoot = pluginName;
  let routeTimer = 0;
  let lastLocation = "";
  let keybindBound = false;

  function getApi(name) {
    return typeof window[name] === "object" || typeof window[name] === "function" ? window[name] : undefined;
  }

  function apiStatus(name, predicate) {
    try {
      const api = getApi(name);
      return predicate ? Boolean(predicate(api)) : Boolean(api);
    } catch {
      return false;
    }
  }

  function ensureStylesheet() {
    const styleRoot = panelRoot() || document.head;
    if (styleRoot.getElementById?.(stylesheetId) || styleRoot.querySelector?.(`#${stylesheetId}`)) {
      return;
    }

    const link = document.createElement("link");
    link.id = stylesheetId;
    link.rel = "stylesheet";
    link.href = `https://plugins/${pluginRoot}/styles.css`;
    styleRoot.appendChild(link);
  }

  function panelHost() {
    return document.getElementById(rootId);
  }

  function panelRoot() {
    const host = panelHost();
    return host?.shadowRoot || host;
  }

  function createPanelHost() {
    let host = panelHost();
    if (!host) {
      host = document.createElement("maoloader-testkit-surface");
      host.id = rootId;
      host.style.cssText =
        "position:fixed;right:18px;bottom:18px;z-index:2147483647;display:block;width:min(440px,calc(100vw - 36px));pointer-events:auto;";
      try {
        host.attachShadow({ mode: "open", delegatesFocus: true });
      } catch {
        host.attachShadow?.({ mode: "open" });
      }
      document.body.appendChild(host);
    }

    return host;
  }

  function toast(kind, message, options) {
    const toastApi = getApi("Toast");
    const fn = toastApi?.[kind] || toastApi?.info || toastApi?.show;
    if (typeof fn === "function") {
      fn(message, options);
    }
  }

  function currentClicks() {
    return Number(window.DataStore?.get?.(storeKey, 0) || 0);
  }

  function setText(selector, value) {
    const node = panelRoot()?.querySelector(`${selector}`);
    if (node) {
      node.textContent = String(value);
    }
  }

  function setStatus(selector, enabled) {
    const node = panelRoot()?.querySelector(`${selector}`);
    if (!node) {
      return;
    }

    node.textContent = enabled ? "ready" : "missing";
    node.classList.toggle("is-ready", enabled);
    node.classList.toggle("is-missing", !enabled);
  }

  function refreshStatus() {
    setText("[data-testkit-clicks]", currentClicks());
    setText("[data-testkit-location]", `${location.pathname}${location.search}${location.hash}` || "/");
    setText("[data-testkit-version]", window.Pengu?.version || window.__llver || "unknown");
    setStatus("[data-testkit-toast]", apiStatus("Toast", (api) => typeof api?.success === "function"));
    setStatus("[data-testkit-datastore]", apiStatus("DataStore", (api) => typeof api?.get === "function"));
    setStatus("[data-testkit-pluginfs]", apiStatus("PluginFS", (api) => typeof api?.write === "function"));
    setStatus("[data-testkit-rcp]", apiStatus("rcp", (api) => typeof api?.preInit === "function"));
    setStatus("[data-testkit-socket]", apiStatus("socket", (api) => typeof api?.observe === "function"));
  }

  function incrementClicks() {
    const next = currentClicks() + 1;
    window.DataStore?.set?.(storeKey, next);
    setText("[data-testkit-clicks]", next);
    toast("success", `DataStore click count saved: ${next}`, { duration: 2600 });
  }

  async function runPluginFsTest() {
    const fs = getApi("PluginFS");
    if (!fs) {
      toast("error", "PluginFS is not available.");
      return;
    }

    const payload = {
      plugin: pluginRoot,
      path: location.href,
      createdAt: new Date().toISOString(),
      clicks: currentClicks(),
      penguVersion: window.Pengu?.version || null,
    };

    try {
      await fs.mkdir("testkit-output");
      const wrote = await fs.write("testkit-output/last-run.json", JSON.stringify(payload, null, 2));
      const readBack = await fs.read("testkit-output/last-run.json");
      const stat = await fs.stat("testkit-output/last-run.json");
      const files = await fs.ls("testkit-output");
      const ok = wrote && readBack && typeof readBack === "string";

      setText("[data-testkit-fs-result]", ok ? `wrote ${stat?.size || readBack.length} bytes (${files?.length || 0} file)` : "write failed");
      toast(ok ? "success" : "warning", ok ? "PluginFS write/read passed." : "PluginFS returned an empty read.");
    } catch (error) {
      console.error("[maoloader-testkit] PluginFS test failed.", error);
      setText("[data-testkit-fs-result]", "failed");
      toast("error", `PluginFS failed: ${error?.message || error}`);
    }
  }

  async function pingLcu() {
    try {
      const response = await fetch("/lol-summoner/v1/current-summoner", { credentials: "include" });
      setText("[data-testkit-lcu]", `${response.status} ${response.statusText || ""}`.trim());
      toast(response.ok ? "success" : "warning", `LCU probe returned ${response.status}.`);
    } catch (error) {
      setText("[data-testkit-lcu]", "failed");
      toast("error", `LCU probe failed: ${error?.message || error}`);
    }
  }

  function toggleBadge() {
    let badge = document.getElementById("maoloader-testkit-badge");
    if (badge) {
      badge.remove();
      toast("info", "Test badge removed.");
      return;
    }

    badge = document.createElement("div");
    badge.id = "maoloader-testkit-badge";
    badge.textContent = "maoloader testkit";
    badge.style.cssText =
      "position:fixed;left:18px;bottom:18px;z-index:2147483646;border:1px solid rgba(20,29,38,.14);border-radius:999px;background:rgba(255,255,255,.96);color:#141d26;box-shadow:0 12px 30px rgba(20,29,38,.18);font:12px/1 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-weight:800;padding:10px 12px;pointer-events:auto;";
    document.body.appendChild(badge);
    toast("success", "Test badge mounted.");
  }

  function togglePanel(showToast = true) {
    const existing = panelHost();
    if (existing) {
      existing.remove();
      if (showToast) {
        toast("info", "maoloader TestKit hidden. Press Ctrl+Shift+M to reopen.", { duration: 3200 });
      }
      return;
    }

    render({ showToast });
  }

  function bindKeybind() {
    if (keybindBound) {
      return;
    }

    keybindBound = true;

    window.addEventListener(
      "keydown",
      (event) => {
        if (event.ctrlKey && event.shiftKey && event.key?.toLowerCase() === "m") {
          event.preventDefault?.();
          event.stopPropagation?.();
          event.stopImmediatePropagation?.();
          togglePanel(true);
        }
      },
      true,
    );
  }

  function render(options = {}) {
    if (panelHost()) {
      refreshStatus();
      return;
    }

    const host = createPanelHost();
    const renderRoot = host.shadowRoot || host;
    renderRoot.replaceChildren?.();
    if (!renderRoot.replaceChildren) {
      renderRoot.innerHTML = "";
    }
    ensureStylesheet();

    const root = document.createElement("section");
    root.className = "testkit-panel";
    root.innerHTML = `
      <header class="testkit-header">
        <div>
          <strong>maoloader TestKit</strong>
          <span>Diagnostic plugin loaded from ${pluginRoot}. Ctrl+Shift+M toggles this panel.</span>
        </div>
        <button type="button" data-testkit-close aria-label="Close TestKit">Close</button>
      </header>

      <div class="testkit-grid">
        <div><span>Pengu</span><strong data-testkit-version>unknown</strong></div>
        <div><span>Route</span><strong data-testkit-location>/</strong></div>
        <div><span>Clicks</span><strong data-testkit-clicks>0</strong></div>
        <div><span>LCU probe</span><strong data-testkit-lcu>not run</strong></div>
        <div><span>PluginFS</span><strong data-testkit-fs-result>not run</strong></div>
      </div>

      <div class="testkit-api-list">
        <span>Toast <b data-testkit-toast>checking</b></span>
        <span>DataStore <b data-testkit-datastore>checking</b></span>
        <span>PluginFS <b data-testkit-pluginfs>checking</b></span>
        <span>rcp <b data-testkit-rcp>checking</b></span>
        <span>socket <b data-testkit-socket>checking</b></span>
      </div>

      <div class="testkit-actions">
        <button type="button" data-testkit-toast-action>Toast</button>
        <button type="button" data-testkit-store-action>Save Count</button>
        <button type="button" data-testkit-fs-action>PluginFS</button>
        <button type="button" data-testkit-lcu-action>LCU</button>
        <button type="button" data-testkit-badge-action>Badge</button>
        <button type="button" data-testkit-folder-action>Folder</button>
      </div>
    `;

    root.querySelector("[data-testkit-close]")?.addEventListener("click", () => togglePanel(true));
    root.querySelector("[data-testkit-toast-action]")?.addEventListener("click", () => {
      toast("success", "Toast API is working from maoloader TestKit.", { duration: 3200 });
    });
    root.querySelector("[data-testkit-store-action]")?.addEventListener("click", incrementClicks);
    root.querySelector("[data-testkit-fs-action]")?.addEventListener("click", runPluginFsTest);
    root.querySelector("[data-testkit-lcu-action]")?.addEventListener("click", pingLcu);
    root.querySelector("[data-testkit-badge-action]")?.addEventListener("click", toggleBadge);
    root.querySelector("[data-testkit-folder-action]")?.addEventListener("click", () => window.openPluginsFolder?.(pluginRoot));

    renderRoot.append(root);
    refreshStatus();
    if (options.showToast !== false) {
      toast("success", "maoloader TestKit loaded. Press Ctrl+Shift+M to toggle it.", { duration: 3200 });
    }
  }

  function watchRoute() {
    if (routeTimer) {
      return;
    }

    lastLocation = location.href;
    routeTimer = window.setInterval(() => {
      if (lastLocation !== location.href) {
        lastLocation = location.href;
        refreshStatus();
      }
    }, 1000);

    window.addEventListener("hashchange", refreshStatus);
    window.addEventListener("popstate", refreshStatus);
  }

  exports.init = function init(context) {
    if (context?.meta?.name) {
      pluginRoot = context.meta.name;
    }
  };

  exports.load = function load() {
    render();
    watchRoute();
    bindKeybind();
  };
})();
