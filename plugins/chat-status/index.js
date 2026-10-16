/**
 * @description Appear online, away, mobile or offline, and set or rotate a custom status message.
 * @author maoloader
 * @link https://github.com/steele123/maoloader
 */
(function () {
  const pluginName = "chat-status";
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
  const defaults = { keep: true, rotate: false, rotateMinutes: 10 };
  let pluginRoot = pluginName;
  let settings;
  let status = loadStatus();
  let rotateTimer = 0;
  let commandBound = false;
  // The status page while it's open in the settings window.
  let openPage;

  function storedSettings() {
    const stored = window.DataStore?.get?.(settingsKey, {});
    return stored && typeof stored === "object" ? stored : {};
  }

  function loadStatus() {
    const stored = storedSettings();
    return {
      availability: availabilities.some((entry) => entry.id === stored.availability) ? stored.availability : "",
      message: String(stored.message || "").slice(0, maxMessageLength),
      presets: Array.isArray(stored.presets) ? stored.presets.map((preset) => String(preset).slice(0, maxMessageLength)).filter(Boolean) : [],
      rotateIndex: Math.max(0, Number(stored.rotateIndex) || 0),
    };
  }

  // Availability, message, saved messages and the rotation position aren't settings fields, so
  // they're saved by hand next to the fields in the same object.
  function writeStatus() {
    window.DataStore?.set?.(settingsKey, { ...storedSettings(), ...status });
  }

  function saveStatus(patch) {
    status = { ...status, ...patch };
    writeStatus();
    window.CommandBar?.update?.();
  }

  // Settings live in maoloader's shared settings window (Ctrl+K → Plugin settings). On a runtime
  // older than 0.1.7 there is no such window; the plugin then keeps working with what's saved.
  function defineSettings() {
    if (typeof window.PluginSettings?.define === "function") {
      return window.PluginSettings.define({
        id: pluginName,
        title: "Chat Status",
        description: "Choose how friends see you and set, save or rotate a status message.",
        icon: `https://plugins/${pluginRoot}/assets/icon.svg`,
        storageKey: settingsKey,
        fields: [
          {
            key: "keep",
            type: "toggle",
            label: "Keep it",
            description: "Re-applies your status after games and client restarts.",
            default: defaults.keep,
          },
          {
            key: "rotate",
            type: "toggle",
            label: "Rotate saved messages",
            description: "Cycles through your saved messages on a timer. Needs two or more.",
            default: defaults.rotate,
          },
          {
            key: "rotateMinutes",
            type: "range",
            label: "Every",
            description: "How long each message stays up.",
            min: 1,
            max: 60,
            step: 1,
            unit: " min",
            default: defaults.rotateMinutes,
            showIf: (values) => values.rotate,
          },
        ],
        page: { render: renderPage, destroy: () => (openPage = undefined) },
      });
    }
    const stored = storedSettings();
    const values = {
      keep: stored.keep === undefined ? defaults.keep : Boolean(stored.keep),
      rotate: Boolean(stored.rotate),
      rotateMinutes: Math.min(60, Math.max(1, Number(stored.rotateMinutes) || defaults.rotateMinutes)),
    };
    return {
      get: (key) => (key ? values[key] : { ...values }),
      set(key, value) {
        values[key] = value;
        window.DataStore?.set?.(settingsKey, { ...storedSettings(), [key]: value });
      },
      onChange: () => () => {},
      open: () => toast("info", "Update maoloader to 0.1.7 or newer to change plugin settings."),
    };
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
    saveStatus({ availability: id });
    try {
      await putMe({ availability: id });
      if (!quiet) toast("success", `You appear ${availabilityLabel(id).toLowerCase()}.`, { duration: 2500 });
    } catch (error) {
      console.error("[chat-status]", error);
      if (!quiet) toast("error", "Could not change your availability. Chat may still be connecting.");
    }
    openPage?.refresh();
  }

  async function setMessage(message, { quiet = false } = {}) {
    const text = String(message || "").slice(0, maxMessageLength);
    saveStatus({ message: text });
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
    const { availability, message } = status;
    if (!settings.get("keep") || (!availability && !message)) return;
    try {
      const me = await lcu(meApi);
      const patch = {};
      if (availability && me?.availability !== availability && me?.availability !== "dnd") {
        patch.availability = availability;
      }
      if (message && me?.statusMessage !== message) patch.statusMessage = message;
      if (Object.keys(patch).length) await putMe(patch);
    } catch {
      if (attempt < 10) window.setTimeout(() => applyKeptStatus(attempt + 1), 3000);
    }
  }

  function rotateNext() {
    if (!status.presets.length) return;
    const index = status.rotateIndex % status.presets.length;
    saveStatus({ rotateIndex: index + 1 });
    setMessage(status.presets[index], { quiet: true });
  }

  function restartRotation() {
    window.clearInterval(rotateTimer);
    rotateTimer = 0;
    if (settings.get("rotate") && status.presets.length) {
      rotateTimer = window.setInterval(rotateNext, settings.get("rotateMinutes") * 60 * 1000);
    }
  }

  function presetRows() {
    if (!status.presets.length) return '<p class="muted">No saved messages yet.</p>';
    return status.presets
      .map(
        (preset, index) => `
          <div class="preset-row">
            <span class="preset-text" title="${escapeHtml(preset)}">${escapeHtml(preset)}</span>
            <button class="button" type="button" data-use="${index}">Use</button>
            <button class="button remove" type="button" data-remove="${index}" aria-label="Delete saved message">×</button>
          </div>`,
      )
      .join("");
  }

  const pageStyles = `
    .stacked { display: grid; gap: 8px; }
    .message-row { display: flex; gap: 6px; }
    .message-row .text { flex: 1 1 auto; width: auto; min-width: 0; }
    .preset-list { display: grid; gap: 6px; padding: 11px 0; }
    .preset-row { display: flex; align-items: center; gap: 6px; padding: 5px 6px 5px 11px; border: 1px solid rgba(200, 170, 110, 0.14); border-radius: 7px; background: rgba(1, 10, 19, 0.35); }
    .preset-text { flex: 1 1 auto; min-width: 0; overflow: hidden; color: #f0e6d2; text-overflow: ellipsis; white-space: nowrap; }
    .preset-row .remove { width: 32px; padding: 7px 0; font-size: 15px; line-height: 1; }
    .preset-row .remove:hover { color: #e0675c; }
  `;

  // Availability, message and saved messages, drawn under the fields in the shared settings window.
  function renderPage(container) {
    container.innerHTML = `
      <style>${pageStyles}</style>
      <p class="heading">Status</p>
      <div class="field">
        <span class="copy"><strong>Appear as</strong><small>Offline hides you from friends' lists; you can still play.</small></span>
        <span class="segmented" role="radiogroup" aria-label="Availability">
          ${availabilities
            .map((entry) => `<button type="button" role="radio" data-availability="${entry.id}" aria-checked="${status.availability === entry.id}">${entry.label}</button>`)
            .join("")}
        </span>
      </div>
      <div class="field stacked">
        <span class="copy"><strong>Status message</strong><small>Shown under your name in friends' lists. Save keeps it in your saved messages.</small></span>
        <div class="message-row">
          <input class="text" type="text" data-message maxlength="${maxMessageLength}" value="${escapeHtml(status.message)}" placeholder="What are you up to?" aria-label="Status message" />
          <button class="button primary" type="button" data-set-message>Set</button>
          <button class="button" type="button" data-save-preset>Save</button>
        </div>
      </div>
      <p class="heading">Saved messages</p>
      <div class="preset-list" data-presets>${presetRows()}</div>`;

    const list = container.querySelector("[data-presets]");
    openPage = {
      refresh() {
        container.querySelectorAll("[data-availability]").forEach((button) => {
          button.setAttribute("aria-checked", String(button.getAttribute("data-availability") === status.availability));
        });
        list.innerHTML = presetRows();
      },
    };

    container.querySelectorAll("[data-availability]").forEach((button) => {
      button.addEventListener("click", () => setAvailability(button.getAttribute("data-availability")));
    });

    const message = container.querySelector("[data-message]");
    container.querySelector("[data-set-message]").addEventListener("click", () => setMessage(message.value.trim()));
    message.addEventListener("keydown", (event) => {
      if (event.key === "Enter") setMessage(message.value.trim());
    });
    container.querySelector("[data-save-preset]").addEventListener("click", () => {
      const text = message.value.trim();
      if (!text || status.presets.includes(text)) return;
      saveStatus({ presets: [...status.presets, text] });
      openPage?.refresh();
    });

    // Rows are re-rendered, so their clicks are delegated from the list.
    list.addEventListener("click", (event) => {
      const use = event.target.closest("[data-use]");
      const remove = event.target.closest("[data-remove]");
      if (use) {
        const text = status.presets[Number(use.getAttribute("data-use"))];
        message.value = text;
        setMessage(text);
      } else if (remove) {
        saveStatus({ presets: status.presets.filter((_, index) => index !== Number(remove.getAttribute("data-remove"))) });
        if (settings.get("rotate") && status.presets.length < 2) settings.set("rotate", false);
        restartRotation();
        openPage?.refresh();
      }
    });
    container.querySelector(`[data-availability="${status.availability || "chat"}"]`)?.focus();
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
      tags: ["status", "message", "availability", "offline", "settings"],
      perform: () => settings.open(),
    });
  }

  exports.init = function init(context) {
    if (context?.meta?.name) pluginRoot = context.meta.name;
    settings = defineSettings();
    settings.onChange((values, changed) => {
      if (changed.includes("rotate") && values.rotate && status.presets.length < 2) {
        toast("info", "Save at least two messages to rotate them.", { duration: 3000 });
        settings.set("rotate", false);
        return;
      }
      if (changed.includes("rotate") || changed.includes("rotateMinutes")) restartRotation();
      if (changed.includes("rotate") && values.rotate) rotateNext();
    });
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
