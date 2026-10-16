/**
 * @description Accept ready checks automatically after a short, cancellable delay.
 * @author maoloader developers
 * @link https://github.com/steele123/maoloader
 */
(function () {
  const pluginName = "auto-accept";
  const hostId = "maoloader-auto-accept";
  const stylesheetId = "maoloader-auto-accept-styles";
  const settingsKey = "auto-accept.settings";
  const readyCheckApi = "/lol-matchmaking/v1/ready-check";
  const defaults = { enabled: true, delaySeconds: 2 };
  const maxDelaySeconds = 10;
  let pluginRoot = pluginName;
  let socket;
  let settings = loadSettings();
  let pendingTimer = 0;
  let skippedThisCheck = false;
  let commandBound = false;

  function loadSettings() {
    const stored = window.DataStore?.get?.(settingsKey, {});
    const merged = { ...defaults, ...(stored && typeof stored === "object" ? stored : {}) };
    merged.enabled = Boolean(merged.enabled);
    merged.delaySeconds = Math.min(maxDelaySeconds, Math.max(0, Number(merged.delaySeconds) || 0));
    return merged;
  }

  function saveSettings(patch) {
    settings = { ...settings, ...patch };
    window.DataStore?.set?.(settingsKey, settings);
    window.CommandBar?.update?.();
  }

  function toast(kind, message, options) {
    const api = window.Toast;
    const show = api?.[kind] || api?.info || api?.show;
    return typeof show === "function" ? show(message, options) : undefined;
  }

  function clearPending() {
    if (pendingTimer) {
      window.clearTimeout(pendingTimer);
      pendingTimer = 0;
    }
  }

  async function accept() {
    pendingTimer = 0;
    try {
      const response = await fetch(`${readyCheckApi}/accept`, { method: "POST" });
      if (!response.ok) throw new Error(`Accept failed with ${response.status}`);
      toast("success", "Match accepted.", { duration: 2500 });
    } catch (error) {
      console.error("[auto-accept]", error);
      toast("error", "Could not accept the match. Accept it manually.");
    }
  }

  function onReadyCheck(check) {
    const waiting = check?.state === "InProgress" && check?.playerResponse === "None";

    if (!waiting) {
      clearPending();
      if (check?.state !== "InProgress") skippedThisCheck = false;
      return;
    }

    if (!settings.enabled || skippedThisCheck || pendingTimer) return;

    const delay = Math.round(settings.delaySeconds * 1000);
    if (delay === 0) {
      pendingTimer = -1;
      accept();
      return;
    }

    pendingTimer = window.setTimeout(accept, delay);
    toast("info", {
      title: "Match found",
      description: `Accepting in ${settings.delaySeconds}s.`,
      duration: delay,
      action: {
        label: "Don't accept",
        onClick: () => {
          clearPending();
          skippedThisCheck = true;
        },
      },
    });
  }

  // Keep the surface hidden until its stylesheet applies, so it never flashes unstyled.
  function revealWhenStyled(element) {
    const link = element.shadowRoot.getElementById(stylesheetId);
    // data-ready turns on transitions two frames later, so styles arriving don't animate in.
    const show = () => {
      element.style.visibility = "";
      requestAnimationFrame(() => requestAnimationFrame(() => element.setAttribute("data-ready", "")));
    };
    if (!link || link.sheet) return show();
    element.style.visibility = "hidden";
    link.addEventListener("load", show, { once: true });
    link.addEventListener("error", show, { once: true });
  }

  function host() {
    return document.getElementById(hostId);
  }

  function closeSettings() {
    host()?.remove();
  }

  function openSettings() {
    let element = host();
    if (!element) {
      element = document.createElement("maoloader-auto-accept");
      element.id = hostId;
      element.style.cssText = "position:fixed;inset:0;z-index:2147483646;display:flex;pointer-events:none;";
      element.attachShadow({ mode: "open" });
      document.body.appendChild(element);
    }

    const root = element.shadowRoot;
    root.innerHTML = `
      <link id="${stylesheetId}" rel="stylesheet" href="https://plugins/${pluginRoot}/styles.css" />
      <div class="sheet-backdrop">
        <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
          <header class="sheet-header">
            <img src="https://plugins/${pluginRoot}/assets/icon.svg" alt="" width="32" height="32" />
            <div class="sheet-title"><h1 id="sheet-title">Auto-accept</h1><span>Ready check automation</span></div>
            <button class="sheet-close" type="button" data-close aria-label="Close">×</button>
          </header>
          <div class="sheet-body">
            <label class="field">
              <span class="field-copy"><strong>Accept ready checks</strong><small>Accepts for you when a match is found.</small></span>
              <span class="switch"><input type="checkbox" data-enabled ${settings.enabled ? "checked" : ""} /><span></span></span>
            </label>
            <div class="field">
              <span class="field-copy"><strong>Delay</strong><small>Time to cancel before it accepts.</small></span>
              <span class="range-row">
                <input type="range" min="0" max="${maxDelaySeconds}" step="0.5" value="${settings.delaySeconds}" data-delay aria-label="Delay in seconds" />
                <span class="field-value" data-delay-value>${settings.delaySeconds}s</span>
              </span>
            </div>
          </div>
          <footer class="sheet-footer"><span>Saved automatically</span><span>Open with <kbd>Ctrl</kbd> + <kbd>K</kbd></span></footer>
        </section>
      </div>`;

    revealWhenStyled(element);
    root.querySelector("[data-close]").addEventListener("click", closeSettings);
    const backdrop = root.querySelector(".sheet-backdrop");
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) closeSettings();
    });
    backdrop.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeSettings();
    });
    root.querySelector("[data-enabled]").addEventListener("change", (event) => {
      saveSettings({ enabled: event.target.checked });
      if (!settings.enabled) clearPending();
    });
    const delayInput = root.querySelector("[data-delay]");
    const delayValue = root.querySelector("[data-delay-value]");
    delayInput.addEventListener("input", () => {
      delayValue.textContent = `${delayInput.value}s`;
    });
    delayInput.addEventListener("change", () => saveSettings({ delaySeconds: Number(delayInput.value) }));
    root.querySelector("[data-enabled]").focus();
  }

  function bindCommandBar() {
    if (commandBound || typeof window.CommandBar?.addAction !== "function") return;
    commandBound = true;
    window.CommandBar.addAction({
      name: () => (settings.enabled ? "Turn off auto-accept" : "Turn on auto-accept"),
      group: "auto-accept",
      tags: ["ready check", "queue", "accept", "match"],
      perform: () => {
        saveSettings({ enabled: !settings.enabled });
        if (!settings.enabled) clearPending();
        toast("info", settings.enabled ? "Auto-accept is on." : "Auto-accept is off.", { duration: 2500 });
      },
    });
    window.CommandBar.addAction({
      name: "Auto-accept settings",
      group: "auto-accept",
      tags: ["ready check", "delay"],
      perform: openSettings,
    });
  }

  async function checkCurrentReadyCheck() {
    try {
      const response = await fetch(readyCheckApi);
      if (response.ok) onReadyCheck(await response.json());
    } catch {
      // No ready check in progress.
    }
  }

  exports.init = function init(context) {
    if (context?.meta?.name) pluginRoot = context.meta.name;
    socket = context?.socket || window.socket;
    socket?.observe?.(readyCheckApi, (event) => onReadyCheck(event?.eventType === "Delete" ? undefined : event?.data));
  };

  exports.load = function load() {
    bindCommandBar();
    checkCurrentReadyCheck();
  };
})();
