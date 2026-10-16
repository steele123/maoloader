/**
 * @description Appear online, away, mobile or offline, and set or rotate a custom status message.
 * @author maoloader
 * @link https://github.com/steele123/maoloader
 */
(function () {
  const pluginName = "chat-status";
  const hostId = "maoloader-chat-status";
  const stylesheetId = "maoloader-chat-status-styles";
  const settingsKey = "chat-status.settings";
  const meApi = "/lol-chat/v1/me";
  const phaseApi = "/lol-gameflow/v1/gameflow-phase";
  const maxMessageLength = 120;
  const availabilities = [
    { id: "chat", label: "Online", command: "Appear online" },
    { id: "away", label: "Away", command: "Appear away" },
    { id: "mobile", label: "Mobile", command: "Appear on mobile" },
    { id: "offline", label: "Offline", command: "Appear offline" },
  ];
  // Phases where the client resets you to online, so a kept availability gets re-applied.
  const resetPhases = new Set(["None", "Lobby", "EndOfGame"]);
  const defaults = { availability: "", keep: true, message: "", presets: [], rotate: false, rotateMinutes: 10, rotateIndex: 0 };
  let pluginRoot = pluginName;
  let settings = loadSettings();
  let rotateTimer = 0;
  let commandBound = false;

  function loadSettings() {
    const stored = window.DataStore?.get?.(settingsKey, {});
    const merged = { ...defaults, ...(stored && typeof stored === "object" ? stored : {}) };
    merged.availability = availabilities.some((entry) => entry.id === merged.availability) ? merged.availability : "";
    merged.keep = Boolean(merged.keep);
    merged.message = String(merged.message || "").slice(0, maxMessageLength);
    merged.presets = Array.isArray(merged.presets)
      ? merged.presets.map((preset) => String(preset).slice(0, maxMessageLength)).filter(Boolean)
      : [];
    merged.rotate = Boolean(merged.rotate);
    merged.rotateMinutes = Math.min(60, Math.max(1, Number(merged.rotateMinutes) || 10));
    merged.rotateIndex = Math.max(0, Number(merged.rotateIndex) || 0);
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

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function lcu(path, options) {
    const response = await fetch(path, options);
    if (!response.ok) throw new Error(`${options?.method || "GET"} ${path} failed with ${response.status}`);
    const text = await response.text();
    return text ? JSON.parse(text) : undefined;
  }

  function putMe(patch) {
    return lcu(meApi, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  function availabilityLabel(id) {
    return availabilities.find((entry) => entry.id === id)?.label || id;
  }

  async function setAvailability(id, { quiet = false } = {}) {
    saveSettings({ availability: id });
    try {
      await putMe({ availability: id });
      if (!quiet) toast("success", `You appear ${availabilityLabel(id).toLowerCase()}.`, { duration: 2500 });
    } catch (error) {
      console.error("[chat-status]", error);
      if (!quiet) toast("error", "Could not change your availability. Chat may still be connecting.");
    }
    renderOpenSheet();
  }

  async function setMessage(message, { quiet = false } = {}) {
    const text = String(message || "").slice(0, maxMessageLength);
    saveSettings({ message: text });
    try {
      await putMe({ statusMessage: text });
      if (!quiet) toast("success", text ? "Status message set." : "Status message cleared.", { duration: 2500 });
    } catch (error) {
      console.error("[chat-status]", error);
      if (!quiet) toast("error", "Could not set your status message.");
    }
  }

  // Chat connects a little after the client loads, so retry quietly for a while.
  async function applyKeptStatus(attempt = 0) {
    if (!settings.keep || (!settings.availability && !settings.message)) return;
    try {
      const me = await lcu(meApi);
      const patch = {};
      if (settings.availability && me?.availability !== settings.availability && me?.availability !== "dnd") {
        patch.availability = settings.availability;
      }
      if (settings.message && me?.statusMessage !== settings.message) patch.statusMessage = settings.message;
      if (Object.keys(patch).length) await putMe(patch);
    } catch {
      if (attempt < 10) window.setTimeout(() => applyKeptStatus(attempt + 1), 3000);
    }
  }

  function rotateNext() {
    if (!settings.presets.length) return;
    const index = settings.rotateIndex % settings.presets.length;
    saveSettings({ rotateIndex: index + 1 });
    setMessage(settings.presets[index], { quiet: true });
  }

  function restartRotation() {
    window.clearInterval(rotateTimer);
    rotateTimer = 0;
    if (settings.rotate && settings.presets.length) {
      rotateTimer = window.setInterval(rotateNext, settings.rotateMinutes * 60 * 1000);
    }
  }

  function host() {
    return document.getElementById(hostId);
  }

  function closeSettings() {
    host()?.remove();
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

  function renderOpenSheet() {
    const root = host()?.shadowRoot;
    if (!root) return;
    root.querySelectorAll("[data-availability]").forEach((button) => {
      button.setAttribute("aria-checked", String(button.getAttribute("data-availability") === settings.availability));
    });
    root.querySelector("[data-presets]").innerHTML = presetRows();
    root.querySelector("[data-rotate]").disabled = settings.presets.length < 2;
    root.querySelector("[data-rotate]").checked = settings.rotate;
  }

  function presetRows() {
    if (!settings.presets.length) return '<p class="field-note">No saved messages yet.</p>';
    return settings.presets
      .map(
        (preset, index) => `
          <div class="preset-row">
            <span class="preset-text" title="${escapeHtml(preset)}">${escapeHtml(preset)}</span>
            <button class="button" type="button" data-use="${index}">Use</button>
            <button class="icon-button" type="button" data-remove="${index}" aria-label="Delete saved message">×</button>
          </div>`,
      )
      .join("");
  }

  function openSettings() {
    let element = host();
    if (!element) {
      element = document.createElement("maoloader-chat-status");
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
            <div class="sheet-title"><h1 id="sheet-title">Status</h1><span>How friends see you</span></div>
            <button class="sheet-close" type="button" data-close aria-label="Close">×</button>
          </header>
          <div class="sheet-body">
            <div class="field is-stacked">
              <span class="field-copy"><strong>Appear as</strong><small>Offline hides you from friends' lists; you can still play.</small></span>
              <div class="segmented" role="radiogroup" aria-label="Availability">
                ${availabilities
                  .map(
                    (entry) =>
                      `<button type="button" role="radio" data-availability="${entry.id}" aria-checked="${settings.availability === entry.id}">${entry.label}</button>`,
                  )
                  .join("")}
              </div>
            </div>
            <label class="field">
              <span class="field-copy"><strong>Keep it</strong><small>Re-applies your status after games and client restarts.</small></span>
              <span class="switch"><input type="checkbox" data-keep ${settings.keep ? "checked" : ""} /><span></span></span>
            </label>
            <div class="field is-stacked">
              <span class="field-copy"><strong>Status message</strong><small>Shown under your name in friends' lists.</small></span>
              <div class="message-row">
                <input class="text-input" type="text" data-message maxlength="${maxMessageLength}" value="${escapeHtml(settings.message)}" placeholder="What are you up to?" />
                <button class="button is-primary" type="button" data-set-message>Set</button>
                <button class="button" type="button" data-save-preset>Save</button>
              </div>
            </div>
            <div class="field is-stacked">
              <span class="field-copy"><strong>Saved messages</strong></span>
              <div class="preset-list" data-presets>${presetRows()}</div>
            </div>
            <label class="field">
              <span class="field-copy"><strong>Rotate saved messages</strong><small>Cycles through them on a timer. Needs two or more.</small></span>
              <span class="switch"><input type="checkbox" data-rotate ${settings.rotate ? "checked" : ""} ${settings.presets.length < 2 ? "disabled" : ""} /><span></span></span>
            </label>
            <div class="field">
              <span class="field-copy"><strong>Every</strong></span>
              <span class="range-row">
                <input type="range" min="1" max="60" step="1" value="${settings.rotateMinutes}" data-minutes aria-label="Rotation interval in minutes" />
                <span class="field-value" data-minutes-value>${settings.rotateMinutes} min</span>
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
    root.querySelectorAll("[data-availability]").forEach((button) => {
      button.addEventListener("click", () => setAvailability(button.getAttribute("data-availability")));
    });
    root.querySelector("[data-keep]").addEventListener("change", (event) => saveSettings({ keep: event.target.checked }));

    const message = root.querySelector("[data-message]");
    root.querySelector("[data-set-message]").addEventListener("click", () => setMessage(message.value.trim()));
    message.addEventListener("keydown", (event) => {
      if (event.key === "Enter") setMessage(message.value.trim());
    });
    root.querySelector("[data-save-preset]").addEventListener("click", () => {
      const text = message.value.trim();
      if (!text || settings.presets.includes(text)) return;
      saveSettings({ presets: [...settings.presets, text] });
      renderOpenSheet();
    });

    // Preset rows are re-rendered, so their clicks are delegated from the list.
    root.querySelector("[data-presets]").addEventListener("click", (event) => {
      const use = event.target.closest("[data-use]");
      const remove = event.target.closest("[data-remove]");
      if (use) {
        const text = settings.presets[Number(use.getAttribute("data-use"))];
        message.value = text;
        setMessage(text);
      } else if (remove) {
        const presets = settings.presets.filter((_, index) => index !== Number(remove.getAttribute("data-remove")));
        saveSettings({ presets, rotate: settings.rotate && presets.length > 1 });
        restartRotation();
        renderOpenSheet();
      }
    });

    root.querySelector("[data-rotate]").addEventListener("change", (event) => {
      saveSettings({ rotate: event.target.checked });
      restartRotation();
      if (settings.rotate) rotateNext();
    });
    const minutes = root.querySelector("[data-minutes]");
    minutes.addEventListener("input", () => {
      root.querySelector("[data-minutes-value]").textContent = `${minutes.value} min`;
    });
    minutes.addEventListener("change", () => {
      saveSettings({ rotateMinutes: Number(minutes.value) });
      restartRotation();
    });
    root.querySelector(`[data-availability="${settings.availability || "chat"}"]`)?.focus();
  }

  function bindCommandBar() {
    if (commandBound || typeof window.CommandBar?.addAction !== "function") return;
    commandBound = true;
    for (const entry of availabilities) {
      window.CommandBar.addAction({
        name: entry.command,
        group: "status",
        tags: ["status", "availability", "chat", entry.label.toLowerCase()],
        perform: () => setAvailability(entry.id),
      });
    }
    window.CommandBar.addAction({
      name: "Status settings",
      group: "status",
      tags: ["status", "message", "availability", "offline"],
      perform: openSettings,
    });
  }

  exports.init = function init(context) {
    if (context?.meta?.name) pluginRoot = context.meta.name;
    const socket = context?.socket || window.socket;
    socket?.observe?.(phaseApi, (event) => {
      if (resetPhases.has(event?.data)) window.setTimeout(() => applyKeptStatus(), 2000);
    });
  };

  exports.load = function load() {
    bindCommandBar();
    applyKeptStatus();
    restartRotation();
  };
})();
