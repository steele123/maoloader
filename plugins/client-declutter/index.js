/**
 * @description Hide League client clutter with toggleable presets and your own selectors.
 * @author maoloader
 * @link https://github.com/steele123/maoloader
 */
(function () {
  const pluginName = "client-declutter";
  const hostId = "maoloader-client-declutter";
  const stylesheetId = "maoloader-client-declutter-styles";
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
  const defaults = { paused: false, hidden: [], custom: "", welcomed: false };
  let pluginRoot = pluginName;
  let settings = loadSettings();
  let commandBound = false;

  function loadSettings() {
    const stored = window.DataStore?.get?.(settingsKey, {});
    const merged = { ...defaults, ...(stored && typeof stored === "object" ? stored : {}) };
    merged.paused = Boolean(merged.paused);
    merged.hidden = Array.isArray(merged.hidden) ? merged.hidden.filter((id) => presets.some((preset) => preset.id === id)) : [];
    merged.custom = String(merged.custom || "");
    return merged;
  }

  function saveSettings(patch) {
    settings = { ...settings, ...patch };
    window.DataStore?.set?.(settingsKey, settings);
    applyRules();
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
    for (const line of settings.custom.split(/\r?\n/)) {
      const selector = line.trim();
      if (!selector || selector.startsWith("//")) continue;
      (isValidSelector(selector) ? valid : invalid).push(selector);
    }
    return { valid, invalid };
  }

  function activeSelectors() {
    if (settings.paused) return [];
    const fromPresets = presets.filter((preset) => settings.hidden.includes(preset.id)).flatMap((preset) => preset.selectors);
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

  function renderInvalid(root) {
    const note = root.querySelector("[data-custom-note]");
    const { valid, invalid } = customSelectors();
    note.classList.toggle("is-error", invalid.length > 0);
    note.textContent = invalid.length
      ? `Ignored invalid selector${invalid.length === 1 ? "" : "s"}: ${invalid.join(", ")}`
      : `${valid.length} custom selector${valid.length === 1 ? "" : "s"} active. One per line, // for comments.`;
  }

  function openSettings() {
    let element = host();
    if (!element) {
      element = document.createElement("maoloader-client-declutter");
      element.id = hostId;
      element.style.cssText = "position:fixed;inset:0;z-index:2147483646;display:flex;pointer-events:none;";
      element.attachShadow({ mode: "open" });
      document.body.appendChild(element);
    }

    const root = element.shadowRoot;
    const presetRows = presets
      .map(
        (preset) => `
          <label class="field">
            <span class="field-copy"><strong>${escapeHtml(preset.label)}</strong><small>${escapeHtml(preset.description)}</small></span>
            <span class="switch"><input type="checkbox" data-preset="${preset.id}" ${settings.hidden.includes(preset.id) ? "checked" : ""} /><span></span></span>
          </label>`,
      )
      .join("");

    root.innerHTML = `
      <link id="${stylesheetId}" rel="stylesheet" href="https://plugins/${pluginRoot}/styles.css" />
      <div class="sheet-backdrop">
        <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
          <header class="sheet-header">
            <img src="https://plugins/${pluginRoot}/assets/icon.svg" alt="" width="32" height="32" />
            <div class="sheet-title"><h1 id="sheet-title">Declutter</h1><span>Switch on what to hide</span></div>
            <button class="sheet-close" type="button" data-close aria-label="Close">×</button>
          </header>
          <div class="sheet-body">
            ${presetRows}
            <div class="field is-stacked">
              <span class="field-copy"><strong>Custom selectors</strong><small>Paste selectors from the DOM Inspector plugin.</small></span>
              <textarea data-custom spellcheck="false" placeholder=".some-banner&#10;.another-promo">${escapeHtml(settings.custom)}</textarea>
              <p class="field-note" data-custom-note></p>
            </div>
          </div>
          <footer class="sheet-footer">
            <label class="footer-toggle"><span class="switch"><input type="checkbox" data-paused ${settings.paused ? "checked" : ""} /><span></span></span>Show everything</label>
            <span>Saved automatically</span>
          </footer>
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
    root.querySelectorAll("[data-preset]").forEach((input) => {
      input.addEventListener("change", () => {
        const id = input.getAttribute("data-preset");
        const hidden = settings.hidden.filter((entry) => entry !== id);
        if (input.checked) hidden.push(id);
        saveSettings({ hidden });
      });
    });
    root.querySelector("[data-paused]").addEventListener("change", (event) => saveSettings({ paused: event.target.checked }));

    const custom = root.querySelector("[data-custom]");
    let customTimer = 0;
    custom.addEventListener("input", () => {
      window.clearTimeout(customTimer);
      customTimer = window.setTimeout(() => {
        saveSettings({ custom: custom.value });
        renderInvalid(root);
      }, 300);
    });
    renderInvalid(root);
    root.querySelector("[data-preset]")?.focus();
  }

  function bindCommandBar() {
    if (commandBound || typeof window.CommandBar?.addAction !== "function") return;
    commandBound = true;
    window.CommandBar.addAction({
      name: "Declutter settings",
      group: "declutter",
      tags: ["hide", "clean", "css", "ui"],
      perform: openSettings,
    });
    window.CommandBar.addAction({
      name: () => (settings.paused ? "Resume declutter" : "Pause declutter"),
      group: "declutter",
      tags: ["hide", "show", "clean"],
      perform: () => {
        saveSettings({ paused: !settings.paused });
        toast("info", settings.paused ? "Declutter paused. Everything is visible." : "Declutter resumed.", { duration: 2500 });
      },
    });
  }

  exports.init = function init(context) {
    if (context?.meta?.name) pluginRoot = context.meta.name;
    applyRules();
  };

  exports.load = function load() {
    bindCommandBar();
    if (!settings.welcomed) {
      saveSettings({ welcomed: true });
      toast("info", {
        title: "Declutter installed",
        description: "Nothing is hidden yet. Choose what to hide in its settings.",
        duration: 8000,
        action: { label: "Open settings", onClick: openSettings },
      });
    }
  };
})();
