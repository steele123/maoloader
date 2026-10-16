/**
 * @description Hide League client clutter with toggleable presets and your own selectors.
 * @author maoloader
 * @link https://github.com/steele123/maoloader
 */
(function () {
  const pluginName = "client-declutter";
  const rulesStyleId = "maoloader-client-declutter-rules";
  const settingsKey = "client-declutter.settings";
  const presets = [
    {
      id: "home-tab-art",
      label: "Home tab artwork",
      description: "Promo images and icons on the home hub tabs.",
      selectors: [".activity-center__tab_content_image", ".activity-center__tab_label_icon"],
    },
    {
      id: "lobby-background",
      label: "Lobby background art",
      description: "The animated art behind the party lobby.",
      selectors: [".parties-background"],
    },
    {
      id: "tft-tab",
      label: "TFT nav tab",
      description: "The Teamfight Tactics item in the top navigation.",
      selectors: [".menu_item_navbar_tft"],
    },
    {
      id: "rp-top-up",
      label: "RP top-up button",
      description: "The buy-RP shortcut next to your currency.",
      selectors: [".currency-rp-top-up"],
    },
    {
      id: "notifications",
      label: "Notifications bell",
      description: "The notifications button in the top bar.",
      selectors: [".notifications-button"],
    },
    {
      id: "support-button",
      label: "Support button",
      description: "The help and support window control.",
      selectors: [".app-controls-support"],
    },
    {
      id: "nav-dividers",
      label: "Top bar dividers",
      description: "Vertical rules between top bar sections.",
      selectors: [".right-nav-vertical-rule"],
    },
    {
      id: "version-badge",
      label: "Version badge",
      description: "The alpha or patch version panel.",
      selectors: [".alpha-version-panel"],
    },
  ];
  const defaults = { paused: false };
  let pluginRoot = pluginName;
  let settings;
  // The preset choices, custom selectors and welcome flag share the saved object with `paused`, but
  // the settings window has no field for them, so this plugin keeps and saves them itself.
  let extras = loadExtras();
  let commandBound = false;
  let customTimer = 0;
  let flushCustom;

  function storedObject() {
    const stored = window.DataStore?.get?.(settingsKey, {});
    return stored && typeof stored === "object" ? stored : {};
  }

  function loadExtras() {
    const stored = storedObject();
    return {
      hidden: Array.isArray(stored.hidden) ? stored.hidden.filter((id) => presets.some((preset) => preset.id === id)) : [],
      custom: String(stored.custom || ""),
      welcomed: Boolean(stored.welcomed),
    };
  }

  // Saved next to the declared settings, merged into what's stored so nothing else is lost.
  function saveExtras(patch) {
    extras = { ...extras, ...patch };
    window.DataStore?.set?.(settingsKey, { ...storedObject(), ...patch });
    applyRules();
  }

  // Settings live in maoloader's shared settings window (Ctrl+K → Plugin settings). On a runtime
  // older than 0.1.7 there is no such window; the plugin then keeps working with what's saved.
  function defineSettings() {
    if (typeof window.PluginSettings?.define === "function") {
      return window.PluginSettings.define({
        id: pluginName,
        title: "Declutter",
        description: "Hides parts of the League client you don't use. Nothing is hidden until you switch it on.",
        icon: `https://plugins/${pluginRoot}/assets/icon.svg`,
        storageKey: settingsKey,
        fields: [
          {
            key: "paused",
            type: "toggle",
            label: "Show everything",
            description: "Turns every rule below off for now, without losing your choices.",
            default: defaults.paused,
          },
        ],
        page: { render: renderPage, destroy: destroyPage },
      });
    }
    const values = { paused: Boolean(storedObject().paused ?? defaults.paused) };
    const listeners = new Set();
    return {
      get: (key) => (key ? values[key] : { ...values }),
      set(key, value) {
        values[key] = value;
        window.DataStore?.set?.(settingsKey, { ...storedObject(), ...values });
        listeners.forEach((listener) => listener({ ...values }, [key]));
      },
      onChange(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
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

  function isValidSelector(selector) {
    // Braces, semicolons or comments could escape the generated rule and hide unrelated UI.
    if (/[{};]|\/\*/.test(selector)) return false;
    try {
      document.createDocumentFragment().querySelector(selector);
      return true;
    } catch {
      return false;
    }
  }

  function customSelectors() {
    const valid = [];
    const invalid = [];
    for (const line of extras.custom.split(/\r?\n/)) {
      const selector = line.trim();
      if (!selector || selector.startsWith("//")) continue;
      (isValidSelector(selector) ? valid : invalid).push(selector);
    }
    return { valid, invalid };
  }

  function activeSelectors() {
    if (settings.get("paused")) return [];
    const fromPresets = presets.filter((preset) => extras.hidden.includes(preset.id)).flatMap((preset) => preset.selectors);
    return [...new Set([...fromPresets, ...customSelectors().valid])];
  }

  function applyRules() {
    let style = document.getElementById(rulesStyleId);
    if (!style) {
      style = document.createElement("style");
      style.id = rulesStyleId;
      (document.head || document.documentElement).appendChild(style);
    }
    // One rule per selector so a selector the client does not support only drops itself.
    style.textContent = activeSelectors()
      .map((selector) => `${selector} { display: none !important; }`)
      .join("\n");
  }

  function renderCustomNote(note) {
    const { valid, invalid } = customSelectors();
    note.classList.toggle("is-error", invalid.length > 0);
    note.textContent = invalid.length
      ? `Ignored invalid selector${invalid.length === 1 ? "" : "s"}: ${invalid.join(", ")}`
      : `${valid.length} custom selector${valid.length === 1 ? "" : "s"} active. One per line, // for comments.`;
  }

  // The presets and custom selectors, drawn under the fields in the shared settings window.
  function renderPage(container) {
    const presetRows = presets
      .map(
        (preset) => `
          <label class="field">
            <span class="copy"><strong>${escapeHtml(preset.label)}</strong><small>${escapeHtml(preset.description)}</small></span>
            <span class="switch"><input type="checkbox" data-preset="${preset.id}" ${extras.hidden.includes(preset.id) ? "checked" : ""} /><span></span></span>
          </label>`,
      )
      .join("");

    container.innerHTML = `
      <style>
        .declutter-custom { padding: 11px 0; }
        .declutter-custom textarea { display: block; width: 100%; min-height: 96px; margin-top: 8px; padding: 8px 10px; border: 1px solid rgba(200, 170, 110, 0.24); border-radius: 7px; background: #06111c; color: #f0e6d2; font: 12px/1.5 "Cascadia Code", Consolas, monospace; resize: vertical; }
        .declutter-custom textarea:focus { border-color: #c8aa6e; outline: none; }
        .declutter-custom p { margin: 6px 0 0; font-size: 12px; }
        .declutter-custom p.is-error { color: #e0796b; }
      </style>
      <p class="heading">Hide</p>
      ${presetRows}
      <p class="heading">Custom selectors</p>
      <div class="declutter-custom">
        <span class="copy"><strong>Your own selectors</strong><small>Paste selectors from the DOM Inspector plugin.</small></span>
        <textarea data-custom spellcheck="false" placeholder=".some-banner&#10;.another-promo" aria-label="Custom selectors">${escapeHtml(extras.custom)}</textarea>
        <p class="muted" data-custom-note></p>
      </div>`;

    container.querySelectorAll("[data-preset]").forEach((input) => {
      input.addEventListener("change", () => {
        const id = input.getAttribute("data-preset");
        const hidden = extras.hidden.filter((entry) => entry !== id);
        if (input.checked) hidden.push(id);
        saveExtras({ hidden });
      });
    });

    const custom = container.querySelector("[data-custom]");
    const note = container.querySelector("[data-custom-note]");
    flushCustom = () => {
      window.clearTimeout(customTimer);
      customTimer = 0;
      if (custom.value !== extras.custom) saveExtras({ custom: custom.value });
      renderCustomNote(note);
    };
    custom.addEventListener("input", () => {
      window.clearTimeout(customTimer);
      customTimer = window.setTimeout(flushCustom, 300);
    });
    renderCustomNote(note);
  }

  function destroyPage() {
    // Save what was typed in the last 300 ms before the page goes away.
    if (customTimer) flushCustom?.();
    flushCustom = undefined;
  }

  function bindCommandBar() {
    if (commandBound || typeof window.CommandBar?.addAction !== "function") return;
    commandBound = true;
    window.CommandBar.addAction({
      name: "Declutter settings",
      group: "declutter",
      tags: ["hide", "clean", "css", "ui", "settings"],
      perform: () => settings.open(),
    });
    window.CommandBar.addAction({
      name: () => (settings.get("paused") ? "Resume declutter" : "Pause declutter"),
      group: "declutter",
      tags: ["hide", "show", "clean"],
      perform: () => {
        settings.set("paused", !settings.get("paused"));
        toast("info", settings.get("paused") ? "Declutter paused. Everything is visible." : "Declutter resumed.", { duration: 2500 });
      },
    });
  }

  exports.init = function init(context) {
    if (context?.meta?.name) pluginRoot = context.meta.name;
    settings = defineSettings();
    settings.onChange(() => {
      applyRules();
      window.CommandBar?.update?.();
    });
    applyRules();
  };

  exports.load = function load() {
    bindCommandBar();
    if (!extras.welcomed) {
      saveExtras({ welcomed: true });
      toast("info", {
        title: "Declutter installed",
        description: "Nothing is hidden yet. Choose what to hide in its settings.",
        duration: 8000,
        action: { label: "Open settings", onClick: () => settings.open() },
      });
    }
  };
})();
