/**
 * @description Inspect plugin load health and attributed logs inside the League client.
 * @author maoloader
 * @link https://github.com/steele123/maoloader
 */
(function () {
  const pluginName = "plugin-health-overlay";
  const hostId = "maoloader-plugin-health";
  const stylesheetId = "maoloader-plugin-health-styles";
  const failureStoreKey = "maoloader-plugin-failures";
  const toggleKey = "h";
  let pluginRoot = pluginName;
  let selectedEntry = "";
  let refreshTimer = 0;
  let keybindBound = false;
  let commandBound = false;

  function reports() {
    return Array.isArray(window.__maoloaderPluginReports) ? window.__maoloaderPluginReports : [];
  }

  function logs() {
    return Array.isArray(window.__maoloaderPluginLogs) ? window.__maoloaderPluginLogs : [];
  }

  function configuredEntries() {
    return Array.isArray(window.Pengu?.plugins) ? window.Pengu.plugins : [];
  }

  function failureCounts() {
    const value = window.DataStore?.get?.(failureStoreKey, {});
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function normalizeEntry(value) {
    return String(value || "").replace(/\\/g, "/").replace(/^\/+/, "");
  }

  function rootFromEntry(entry) {
    return normalizeEntry(entry).split("/")[0] || normalizeEntry(entry);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatTime(value) {
    const date = new Date(Number(value));
    return Number.isNaN(date.valueOf()) ? "unknown" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  function pluginState(entry, entryReports, failures) {
    const latest = entryReports[entryReports.length - 1];
    const failureCount = Number(failures[entry] || 0);
    const skipped = [...entryReports].reverse().find((report) => report.stage === "safe-mode" && report.status === "skipped");
    const completed = [...entryReports].reverse().find((report) => report.stage === "complete" && report.status === "loaded");
    const failed = [...entryReports].reverse().find((report) => report.status === "failed");
    const lastProblem = !completed || Math.max(Number(skipped?.ts) || 0, Number(failed?.ts) || 0) > completed.ts;

    if (skipped && lastProblem && failureCount > 0) {
      return { key: "blocked", label: "Safe mode", failures: Number(skipped.failures || failureCount) };
    }
    if (failed && lastProblem && failureCount > 0) {
      return { key: "failed", label: "Failed", failures: failureCount };
    }
    if ((skipped || failed) && lastProblem && failureCount === 0) {
      return { key: "unknown", label: "Retry ready", failures: 0 };
    }
    if (completed) {
      return { key: "healthy", label: "Loaded", failures: failureCount };
    }
    if (latest?.status === "started" || latest?.status === "registered") {
      return { key: "loading", label: "Loading", failures: failureCount };
    }
    return { key: "unknown", label: "No report", failures: failureCount };
  }

  function snapshot() {
    const allReports = reports().map((report) => ({ ...report, entry: normalizeEntry(report.entry) }));
    const allLogs = logs().map((log) => ({ ...log, entry: normalizeEntry(log.entry) }));
    const failures = failureCounts();
    const entries = new Set(configuredEntries().map(normalizeEntry));

    for (const report of allReports) {
      if (report.entry) entries.add(report.entry);
    }
    for (const log of allLogs) {
      if (log.entry) entries.add(log.entry);
    }
    for (const entry of Object.keys(failures)) {
      entries.add(normalizeEntry(entry));
    }

    const plugins = [...entries]
      .filter(Boolean)
      .map((entry) => {
        const entryReports = allReports.filter((report) => report.entry === entry);
        const entryLogs = allLogs.filter((log) => log.entry === entry);
        const state = pluginState(entry, entryReports, failures);
        return {
          entry,
          root: rootFromEntry(entry),
          reports: entryReports,
          logs: entryLogs,
          state,
          lastActivity: Math.max(0, ...entryReports.map((report) => Number(report.ts) || 0), ...entryLogs.map((log) => Number(log.ts) || 0)),
        };
      })
      .sort((a, b) => {
        const order = { failed: 0, blocked: 1, loading: 2, unknown: 3, healthy: 4 };
        return order[a.state.key] - order[b.state.key] || a.root.localeCompare(b.root);
      });

    return { createdAt: new Date().toISOString(), plugins, reports: allReports, logs: allLogs, failures };
  }

  function host() {
    return document.getElementById(hostId);
  }

  function renderRoot() {
    const element = host();
    return element?.shadowRoot || element;
  }

  function ensureHost() {
    let element = host();
    if (element) return element;

    element = document.createElement("maoloader-plugin-health");
    element.id = hostId;
    element.style.cssText = "position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:24px;pointer-events:none;";
    try {
      element.attachShadow({ mode: "open", delegatesFocus: true });
    } catch {
      element.attachShadow?.({ mode: "open" });
    }
    document.body.appendChild(element);
    return element;
  }

  function ensureStylesheet() {
    const root = renderRoot();
    if (!root || root.querySelector(`#${stylesheetId}`)) return;

    const link = document.createElement("link");
    link.id = stylesheetId;
    link.rel = "stylesheet";
    link.href = `https://plugins/${pluginRoot}/styles.css`;
    root.appendChild(link);
  }

  function toast(kind, message) {
    const api = window.Toast;
    const show = api?.[kind] || api?.info || api?.show;
    if (typeof show === "function") show(message, { duration: 3000 });
  }

  function chooseEntry(data) {
    if (data.plugins.some((plugin) => plugin.entry === selectedEntry)) return selectedEntry;
    selectedEntry = data.plugins[0]?.entry || "";
    return selectedEntry;
  }

  function stateIcon(state) {
    if (state === "healthy") return "✓";
    if (state === "failed") return "!";
    if (state === "blocked") return "×";
    if (state === "loading") return "…";
    return "?";
  }

  function renderPluginList(data) {
    if (!data.plugins.length) {
      return '<div class="health-empty health-empty-list">No plugin reports yet.</div>';
    }

    return data.plugins
      .map(
        (plugin) => `
          <button class="health-plugin ${plugin.entry === selectedEntry ? "is-selected" : ""}" type="button" data-entry="${escapeHtml(plugin.entry)}">
            <span class="health-state is-${plugin.state.key}" aria-hidden="true">${stateIcon(plugin.state.key)}</span>
            <span class="health-plugin-copy">
              <strong>${escapeHtml(plugin.root)}</strong>
              <small>${escapeHtml(plugin.entry)}</small>
            </span>
            <span class="health-badge is-${plugin.state.key}">${escapeHtml(plugin.state.label)}</span>
          </button>`,
      )
      .join("");
  }

  function renderTimeline(plugin) {
    if (!plugin?.reports.length) return '<div class="health-empty">No lifecycle events recorded.</div>';

    return plugin.reports
      .slice(-12)
      .reverse()
      .map(
        (report) => `
          <li>
            <span class="health-event-dot is-${report.status === "failed" ? "failed" : report.status === "loaded" ? "healthy" : "neutral"}"></span>
            <div><strong>${escapeHtml(report.stage)}</strong><span>${escapeHtml(report.status)}</span></div>
            <time>${escapeHtml(formatTime(report.ts))}</time>
            ${report.error ? `<pre>${escapeHtml(report.error)}</pre>` : ""}
          </li>`,
      )
      .join("");
  }

  function renderLogs(plugin) {
    if (!plugin?.logs.length) return '<div class="health-empty">No attributed console output.</div>';

    return plugin.logs
      .slice(-20)
      .reverse()
      .map(
        (log) => `
          <li class="health-log is-${escapeHtml(log.level || "log")}">
            <div><span>${escapeHtml(log.level || "log")}</span><time>${escapeHtml(formatTime(log.ts))}</time></div>
            <pre>${escapeHtml(log.message)}</pre>
          </li>`,
      )
      .join("");
  }

  function renderDetail(plugin) {
    if (!plugin) {
      return '<div class="health-empty health-empty-detail">Select a plugin to inspect it.</div>';
    }

    const canRetry = plugin.state.key === "failed" || plugin.state.key === "blocked" || plugin.state.failures > 0;
    return `
      <div class="health-detail-header">
        <div><span>Selected plugin</span><h2>${escapeHtml(plugin.root)}</h2><code>${escapeHtml(plugin.entry)}</code></div>
        <button class="health-secondary" type="button" data-health-retry ${canRetry ? "" : "disabled"}>Retry plugin</button>
      </div>
      <div class="health-metrics">
        <div><span>Status</span><strong class="is-${plugin.state.key}">${escapeHtml(plugin.state.label)}</strong></div>
        <div><span>Failures</span><strong>${plugin.state.failures}</strong></div>
        <div><span>Events</span><strong>${plugin.reports.length}</strong></div>
        <div><span>Logs</span><strong>${plugin.logs.length}</strong></div>
      </div>
      <div class="health-section">
        <h3>Lifecycle</h3>
        <ol class="health-timeline">${renderTimeline(plugin)}</ol>
      </div>
      <div class="health-section health-logs-section">
        <h3>Console output</h3>
        <ol class="health-logs">${renderLogs(plugin)}</ol>
      </div>`;
  }

  function bindPanelActions(data) {
    const root = renderRoot();
    if (!root) return;

    root.querySelector("[data-health-close]")?.addEventListener("click", () => togglePanel(false));
    root.querySelector("[data-health-refresh]")?.addEventListener("click", () => {
      render();
      toast("success", "Plugin health refreshed.");
    });
    root.querySelector("[data-health-copy]")?.addEventListener("click", copyDiagnostics);
    root.querySelector("[data-health-retry]")?.addEventListener("click", retrySelectedPlugin);
    root.querySelectorAll("[data-entry]").forEach((button) => {
      button.addEventListener("click", () => {
        selectedEntry = button.getAttribute("data-entry") || "";
        render();
      });
    });

    const shell = root.querySelector(".health-backdrop");
    shell?.addEventListener("click", (event) => {
      if (event.target === shell) togglePanel(false);
    });

    const selected = data.plugins.find((plugin) => plugin.entry === selectedEntry);
    root.querySelector("[data-health-retry]")?.toggleAttribute("disabled", !selected || (selected.state.key === "healthy" && !selected.state.failures));
  }

  function render() {
    if (!host()) ensureHost();
    ensureStylesheet();

    const root = renderRoot();
    if (!root) return;
    const previousSidebarScroll = root.querySelector(".health-sidebar")?.scrollTop || 0;
    const previousDetailScroll = root.querySelector(".health-detail")?.scrollTop || 0;
    const data = snapshot();
    chooseEntry(data);
    const selected = data.plugins.find((plugin) => plugin.entry === selectedEntry);
    const summary = data.plugins.reduce(
      (counts, plugin) => {
        counts[plugin.state.key] = (counts[plugin.state.key] || 0) + 1;
        return counts;
      },
      {},
    );
    const stylesheet = root.querySelector(`#${stylesheetId}`);
    root.replaceChildren?.(...(stylesheet ? [stylesheet] : []));
    if (!root.replaceChildren) root.innerHTML = "";
    if (!root.querySelector(`#${stylesheetId}`)) ensureStylesheet();

    const backdrop = document.createElement("div");
    backdrop.className = "health-backdrop";
    backdrop.innerHTML = `
      <section class="health-panel" role="dialog" aria-modal="true" aria-labelledby="health-title">
        <header class="health-header">
          <div class="health-title">
            <img src="https://plugins/${pluginRoot}/assets/icon.svg" alt="" />
            <div><h1 id="health-title">Plugin Health</h1><span>Live loader diagnostics</span></div>
          </div>
          <div class="health-toolbar">
            <button class="health-secondary" type="button" data-health-refresh>Refresh</button>
            <button class="health-secondary" type="button" data-health-copy>Copy report</button>
            <button class="health-close" type="button" data-health-close aria-label="Close plugin health">×</button>
          </div>
        </header>
        <div class="health-summary" aria-label="Plugin health summary">
          <span><b>${data.plugins.length}</b> total</span>
          <span class="is-healthy"><b>${summary.healthy || 0}</b> loaded</span>
          <span class="is-failed"><b>${summary.failed || 0}</b> failed</span>
          <span class="is-blocked"><b>${summary.blocked || 0}</b> safe mode</span>
        </div>
        <div class="health-layout">
          <aside class="health-sidebar" aria-label="Plugins">${renderPluginList(data)}</aside>
          <main class="health-detail">${renderDetail(selected)}</main>
        </div>
        <footer class="health-footer"><span>Updates automatically while open</span><kbd>Ctrl</kbd><span>+</span><kbd>Shift</kbd><span>+</span><kbd>H</kbd></footer>
      </section>`;
    root.appendChild(backdrop);
    bindPanelActions(data);
    const sidebar = root.querySelector(".health-sidebar");
    const detail = root.querySelector(".health-detail");
    if (sidebar) sidebar.scrollTop = previousSidebarScroll;
    if (detail) detail.scrollTop = previousDetailScroll;
  }

  async function copyDiagnostics() {
    const data = snapshot();
    const payload = JSON.stringify(
      {
        generatedAt: data.createdAt,
        location: location.href,
        loaderVersion: window.Pengu?.version || window.__llver || "unknown",
        selectedEntry,
        plugins: data.plugins,
      },
      null,
      2,
    );

    try {
      await navigator.clipboard.writeText(payload);
      toast("success", "Plugin diagnostics copied to the clipboard.");
    } catch {
      const input = document.createElement("textarea");
      input.value = payload;
      input.style.cssText = "position:fixed;opacity:0;pointer-events:none";
      document.body.appendChild(input);
      input.select();
      const copied = document.execCommand?.("copy");
      input.remove();
      toast(copied ? "success" : "error", copied ? "Plugin diagnostics copied to the clipboard." : "Could not copy plugin diagnostics.");
    }
  }

  function retrySelectedPlugin() {
    if (!selectedEntry || typeof window.__maoloaderResetPluginSafeMode !== "function") {
      toast("error", "Safe-mode controls are unavailable.");
      return;
    }

    window.__maoloaderResetPluginSafeMode(selectedEntry);
    toast("success", `Reset failures for ${rootFromEntry(selectedEntry)}. Reload the client to retry it.`);
    render();
  }

  function startAutoRefresh() {
    if (refreshTimer) return;
    refreshTimer = window.setInterval(() => {
      if (host()) render();
    }, 2000);
  }

  function stopAutoRefresh() {
    if (!refreshTimer) return;
    window.clearInterval(refreshTimer);
    refreshTimer = 0;
  }

  function togglePanel(showToast = true) {
    if (host()) {
      host().remove();
      stopAutoRefresh();
      if (showToast) toast("info", "Plugin Health hidden. Press Ctrl+Shift+H to reopen it.");
      return;
    }

    render();
    startAutoRefresh();
    if (showToast) toast("success", "Plugin Health opened.");
  }

  function bindKeybind() {
    if (keybindBound) return;
    keybindBound = true;
    window.addEventListener(
      "keydown",
      (event) => {
        if (event.ctrlKey && event.shiftKey && event.key?.toLowerCase() === toggleKey) {
          event.preventDefault?.();
          event.stopPropagation?.();
          event.stopImmediatePropagation?.();
          togglePanel(true);
        }
      },
      true,
    );
  }

  function bindCommandBar() {
    if (commandBound || typeof window.CommandBar?.addAction !== "function") return;
    commandBound = true;
    window.CommandBar.addAction({
      name: "Show Plugin Health",
      group: "maoloader",
      tags: ["plugins", "logs", "diagnostics", "safe mode"],
      perform: () => {
        if (!host()) togglePanel(false);
      },
    });
  }

  exports.init = function init(context) {
    if (context?.meta?.name) pluginRoot = context.meta.name;
  };

  exports.load = function load() {
    bindKeybind();
    bindCommandBar();
    const data = snapshot();
    const attention = data.plugins.filter((plugin) => plugin.state.key === "failed" || plugin.state.key === "blocked");
    if (attention.length) {
      toast("warning", `${attention.length} plugin${attention.length === 1 ? " needs" : "s need"} attention. Press Ctrl+Shift+H for details.`);
    }
  };
})();
