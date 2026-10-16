// Theme: an accent colour and a font across the whole client, plus one-click presets and share
// codes for the complete Steele's UI look.

import {
  registerSection,
  registerTab,
  getSettings,
  getDefaults,
  updateSettings,
  onSettingsChange,
  onDomChange,
  setRules,
  toast,
  escapeHtml,
  hexOr,
  isHex,
  switchField,
  segmented,
  colorField,
  bindFormHelpers,
  showSections,
} from "./core.js";

const SECTION = "theme";
const RECOLOR_ATTRIBUTE = "data-steeles-ui-recolor";
const CLIENT_GOLD = "#c8aa6e";
const SHARE_PREFIX = "SUI1-";
// The areas a look is made of. Home cards and notes are personal, so they never travel in a code.
const LOOK_SECTIONS = ["theme", "backdrop", "topBar", "panel"];

const FONTS = [
  { id: "client", label: "League" },
  { id: "clean", label: "Clean" },
  { id: "serif", label: "Serif" },
  { id: "custom", label: "Custom" },
];
const FONT_STACKS = {
  clean: { display: '"Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif', body: '"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif' },
  serif: { display: '"LoL Display", Georgia, serif', body: '"LoL Display", Georgia, serif' },
};

const DEFAULTS = { recolor: false, accent: CLIENT_GOLD, font: "client", customFont: "" };

registerSection(SECTION, {
  defaults: DEFAULTS,
  normalize: (raw) => ({
    recolor: Boolean(raw.recolor),
    accent: hexOr(raw.accent, CLIENT_GOLD),
    font: FONTS.some((font) => font.id === raw.font) ? raw.font : "client",
    // A font name only: no quotes, braces or semicolons that could break out of the rule.
    customFont: String(raw.customFont || "").replace(/["'{};<>\\]/g, "").slice(0, 60),
  }),
});

function settings() {
  return getSettings(SECTION);
}

// ---- Colour maths ----

function hexToRgb(hex) {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function rgbToHsl([r, g, b]) {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === rn ? (gn - bn) / d + (gn < bn ? 6 : 0) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb([h, s, l]) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0), f(8), f(4)].map((value) => Math.round(value * 255));
}

const clamp01 = (value) => Math.min(1, Math.max(0, value));

// The client's golds, as written in its stylesheets (hex, or rgb() with an optional alpha).
const GOLD_SHADES = ["#c8aa6e", "#c89b3c", "#785a28", "#cdbe91", "#c8a96e"];
const GOLD_PATTERN = new RegExp(
  `${GOLD_SHADES.join("|")}|rgba?\\(\\s*(${GOLD_SHADES.map((hex) => hexToRgb(hex).join(",\\s*")).join("|")})\\s*(?:,\\s*([\\d.]+)\\s*)?\\)`,
  "gi",
);

// Moves a gold shade to the accent: the accent's hue, saturation scaled the same way, and the
// shade's lightness shifted by the difference, so dark and light golds stay dark and light.
function accentShade(rgb, accent) {
  const [, goldS, goldL] = rgbToHsl(hexToRgb(CLIENT_GOLD));
  const [, shadeS, shadeL] = rgbToHsl(rgb);
  const [accentH, accentS, accentL] = rgbToHsl(hexToRgb(accent));
  const saturation = goldS ? clamp01(accentS * (shadeS / goldS)) : accentS;
  return hslToRgb([accentH, saturation, clamp01(shadeL + (accentL - goldL))]);
}

function recolorValue(value, accent) {
  return value.replace(GOLD_PATTERN, (match, rgbList, alpha) => {
    const rgb = match.startsWith("#") ? hexToRgb(match.toLowerCase()) : rgbList.split(",").map((part) => Number(part.trim()));
    const [r, g, b] = accentShade(rgb, accent);
    return alpha !== undefined ? `rgba(${r}, ${g}, ${b}, ${alpha})` : `rgb(${r}, ${g}, ${b})`;
  });
}

// ---- Recolouring ----
// Each client rule that uses gold gets a copy with only those properties, in the accent. The
// copies come later in the page with the same selectors, so they win without !important and the
// client's own hover, active and disabled states keep working.

let lastSheetCount = -1;
let lastSignature = "";

function recolorCss(sheets, accent) {
  const out = [];
  const visit = (rules) => {
    for (const rule of rules) {
      if (rule.type === CSSRule.MEDIA_RULE || rule.type === CSSRule.SUPPORTS_RULE) {
        // Recolour inside the block, then wrap the copies in the same condition.
        const start = out.length;
        visit(rule.cssRules);
        if (out.length > start) {
          const keyword = rule.type === CSSRule.MEDIA_RULE ? "@media" : "@supports";
          out.push(`${keyword} ${rule.conditionText} {\n${out.splice(start).join("\n")}\n}`);
        }
        continue;
      }
      if (rule.type !== CSSRule.STYLE_RULE || !GOLD_PATTERN.test(rule.cssText)) {
        GOLD_PATTERN.lastIndex = 0;
        continue;
      }
      GOLD_PATTERN.lastIndex = 0;
      const declarations = [];
      for (let index = 0; index < rule.style.length; index += 1) {
        const property = rule.style[index];
        const value = rule.style.getPropertyValue(property);
        GOLD_PATTERN.lastIndex = 0;
        if (GOLD_PATTERN.test(value)) declarations.push(`${property}: ${recolorValue(value, accent)}`);
        GOLD_PATTERN.lastIndex = 0;
      }
      if (declarations.length) out.push(`${rule.selectorText} { ${declarations.join("; ")}; }`);
    }
  };
  for (const sheet of sheets) {
    if (sheet.ownerNode?.hasAttribute?.(RECOLOR_ATTRIBUTE)) continue;
    try {
      visit(sheet.cssRules);
    } catch {
      // Cross-origin sheets can't be read; skip them.
    }
  }
  return out.join("\n");
}

function recolorRoot(root, accent) {
  const head = root === document ? document.head || document.documentElement : root;
  let style = head.querySelector?.(`style[${RECOLOR_ATTRIBUTE}]`);
  if (!accent) {
    style?.remove();
    return;
  }
  if (!style) {
    style = document.createElement("style");
    style.setAttribute(RECOLOR_ATTRIBUTE, "");
  }
  style.textContent = recolorCss(root.styleSheets, accent);
  // Last in the page (or shadow root), so it comes after every sheet it overrides.
  if (head.lastElementChild !== style) head.appendChild(style);
}

// Steele's UI's own windows have their own stylesheets; they follow the accent too.
function ownRoots() {
  return [...document.querySelectorAll("steeles-ui-home, steeles-ui-topbar, steeles-ui-settings")].map((host) => host.shadowRoot).filter(Boolean);
}

function applyRecolor(force = false) {
  const current = settings();
  const accent = current.recolor && current.accent.toLowerCase() !== CLIENT_GOLD ? current.accent : "";
  const roots = [document, ...ownRoots()];
  const sheetCount = roots.reduce((total, root) => total + root.styleSheets.length, 0);
  const signature = `${accent}|${roots.length}`;
  // The client adds stylesheets as screens load; only redo the work when that happens.
  if (!force && sheetCount === lastSheetCount && signature === lastSignature) return;
  lastSheetCount = sheetCount;
  lastSignature = signature;
  for (const root of roots) recolorRoot(root, accent);
}

function applyFont() {
  const current = settings();
  const custom = current.customFont.trim();
  const stack =
    current.font === "custom" && custom ? { display: `"${custom}", ${FONT_STACKS.clean.display}`, body: `"${custom}", ${FONT_STACKS.clean.body}` } : FONT_STACKS[current.font];
  // Steele's UI's own client styles (lobby and other screens) read the accent from here.
  const accent = current.recolor ? current.accent : CLIENT_GOLD;
  const rules = [`:root { --sui-accent: ${accent}; --sui-accent-rgb: ${hexToRgb(accent).join(", ")}; }`];
  if (stack) rules.push(`:root { --font-display: ${stack.display} !important; --font-body: ${stack.body} !important; }`);
  setRules(SECTION, rules);
}

function apply() {
  applyFont();
  applyRecolor(true);
}

// ---- Presets and share codes ----

const PRESETS = [
  {
    id: "default",
    label: "Steele's default",
    swatches: [CLIENT_GOLD, "#0a1428"],
    reset: true,
  },
  {
    id: "hextech",
    label: "Hextech",
    swatches: ["#0ac8b9", "#091428"],
    patch: {
      theme: { recolor: true, accent: "#0ac8b9", font: "client" },
      backdrop: { enabled: true, mode: "gradient", gradientFrom: "#091428", gradientTo: "#0a7a8a", gradientAngle: 160 },
      panel: { seeThrough: true, tint: 55, divider: true, dividerColor: "#0ac8b9" },
    },
  },
  {
    id: "midnight",
    label: "Midnight",
    swatches: ["#9d8bff", "#05070d"],
    patch: {
      theme: { recolor: true, accent: "#9d8bff", font: "clean" },
      backdrop: { enabled: true, mode: "color", color: "#05070d" },
      topBar: { mode: "custom" },
      panel: { mode: "visible", seeThrough: true, tint: 70 },
    },
  },
  {
    id: "focus",
    label: "Focus",
    swatches: [CLIENT_GOLD, "#0a1428"],
    patch: {
      theme: { recolor: false, font: "clean" },
      backdrop: { enabled: true, mode: "color", color: "#0a1428" },
      topBar: { mode: "custom" },
      panel: { mode: "collapsed" },
    },
  },
  {
    id: "ember",
    label: "Ember",
    swatches: ["#ff7a45", "#1a0b10"],
    patch: {
      theme: { recolor: true, accent: "#ff7a45", font: "client" },
      backdrop: { enabled: true, mode: "gradient", gradientFrom: "#1a0b10", gradientTo: "#7a2a1f", gradientAngle: 125 },
      panel: { divider: true, dividerColor: "#ff7a45" },
    },
  },
];

function snapshot() {
  return Object.fromEntries(LOOK_SECTIONS.map((name) => [name, { ...getSettings(name) }]));
}

function restore(look) {
  for (const name of LOOK_SECTIONS) {
    if (look[name] && typeof look[name] === "object") updateSettings(name, look[name]);
  }
}

function applyPreset(id) {
  const preset = PRESETS.find((entry) => entry.id === id);
  if (!preset) return;
  const before = snapshot();
  if (preset.reset) {
    for (const name of LOOK_SECTIONS) {
      const defaults = getDefaults(name);
      // Keep the chosen backdrop image; the preset is about colours and layout.
      if (name === "backdrop") {
        const current = getSettings(name);
        Object.assign(defaults, { sourceType: current.sourceType, file: current.file, url: current.url });
      }
      updateSettings(name, defaults);
    }
  } else {
    for (const [name, patch] of Object.entries(preset.patch)) updateSettings(name, patch);
  }
  toast("success", {
    title: `${preset.label} applied`,
    action: { label: "Undo", onClick: () => restore(before) },
    duration: 6000,
  });
}

// A look as text: the look's settings as JSON, base64 so it survives chat apps.
function shareCode() {
  const look = snapshot();
  // A file in your own backgrounds folder means nothing on someone else's PC.
  if (look.backdrop.sourceType === "file") Object.assign(look.backdrop, { sourceType: "none", file: "" });
  const json = JSON.stringify({ v: 1, ...look });
  const base64 = btoa(String.fromCharCode(...new TextEncoder().encode(json)));
  return SHARE_PREFIX + base64.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function readShareCode(code) {
  const trimmed = String(code || "").trim();
  if (!trimmed.startsWith(SHARE_PREFIX)) throw new Error("That isn't a Steele's UI code. Codes start with SUI1-.");
  const base64 = trimmed.slice(SHARE_PREFIX.length).replaceAll("-", "+").replaceAll("_", "/");
  let look;
  try {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    look = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("That code is damaged. Copy it again, all of it.");
  }
  if (!look || look.v !== 1) throw new Error("That code is from a newer Steele's UI. Update the plugin first.");
  return look;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.cssText = "position:fixed;left:-9999px;";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
}

// ---- Settings tab ----

function renderTab() {
  const current = settings();
  return `
    <div class="field is-stacked">
      <span class="field-copy"><strong>Presets</strong><small>A complete look in one click: accent, font, backdrop, top bar and panel. You can undo right after.</small></span>
      <div class="look-grid">
        ${PRESETS.map(
          (preset) => `
          <button class="look-card" type="button" data-th-preset="${preset.id}">
            <span class="look-swatches">${preset.swatches.map((color) => `<span style="background:${color}"></span>`).join("")}</span>
            <strong>${escapeHtml(preset.label)}</strong>
          </button>`,
        ).join("")}
      </div>
    </div>
    <div class="field is-stacked section-start">
      <span class="field-copy"><strong>Share your look</strong><small>Copy a code to send to friends, or paste theirs to try it. Your notes and home cards stay yours.</small></span>
      <div class="share-row">
        <button class="button is-primary" type="button" data-th-copy>Copy my code</button>
        <input class="text-input" type="text" data-th-code placeholder="Paste a SUI1- code" spellcheck="false" />
        <button class="button" type="button" data-th-import>Apply</button>
      </div>
      <p class="field-note" data-th-code-error hidden></p>
    </div>
    <div class="section-start">
      ${switchField("data-th-recolor", current.recolor, "Accent colour", "Recolours the client's gold: buttons, borders, highlights and text. A few built-in parts, like the top menu icons, keep their gold.")}
      <div class="mode-section" data-th-accent ${current.recolor ? "" : "hidden"}>
        <div class="field">
          <span class="field-copy"><strong>Colour</strong></span>
          ${colorField("data-th-accent-color", current.accent, "Accent colour")}
        </div>
      </div>
    </div>
    <div class="field is-stacked section-start">
      <span class="field-copy"><strong>Font</strong><small>League keeps Riot's fonts. Clean uses Windows' Segoe UI; Serif uses League's title font everywhere.</small></span>
      ${segmented("data-th-font", FONTS, current.font, "Font")}
      <div class="mode-section" data-th-font-section="custom" ${current.font === "custom" ? "" : "hidden"}>
        <input class="text-input" type="text" data-th-custom-font value="${escapeHtml(current.customFont)}" placeholder="Name of a font on your PC, e.g. Inter" spellcheck="false" />
      </div>
    </div>`;
}

function bindTab(container) {
  bindFormHelpers(container);
  const save = (patch, options) => updateSettings(SECTION, patch, options);
  const rerender = () => {
    container.innerHTML = renderTab();
    bindTab(container);
  };

  container.querySelectorAll("[data-th-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      applyPreset(button.getAttribute("data-th-preset"));
      rerender();
    });
  });

  const codeInput = container.querySelector("[data-th-code]");
  const codeError = container.querySelector("[data-th-code-error]");
  container.querySelector("[data-th-copy]").addEventListener("click", async () => {
    await copyText(shareCode());
    toast("success", "Look copied. Paste it anywhere to share.", { duration: 2500 });
  });
  container.querySelector("[data-th-import]").addEventListener("click", () => {
    try {
      const look = readShareCode(codeInput.value);
      const before = snapshot();
      restore(look);
      toast("success", { title: "Look applied", action: { label: "Undo", onClick: () => restore(before) }, duration: 6000 });
      rerender();
    } catch (error) {
      codeError.textContent = error.message;
      codeError.classList.add("is-error");
      codeError.hidden = false;
    }
  });

  container.querySelector("[data-th-recolor]").addEventListener("change", (event) => {
    save({ recolor: event.target.checked });
    container.querySelector("[data-th-accent]").hidden = !event.target.checked;
  });
  const color = container.querySelector("[data-color][data-th-accent-color]");
  // Recolouring the client is heavy, so it happens when the picker closes, not while dragging.
  color.addEventListener("change", () => isHex(color.value) && save({ accent: color.value }));

  container.querySelectorAll("[data-th-font]").forEach((button) => {
    button.addEventListener("click", () => {
      const font = button.getAttribute("data-th-font");
      save({ font });
      container.querySelectorAll("[data-th-font]").forEach((other) => other.setAttribute("aria-checked", String(other === button)));
      showSections(container, "data-th-font-section", font);
    });
  });
  const customFont = container.querySelector("[data-th-custom-font]");
  customFont.addEventListener("change", () => save({ customFont: customFont.value }));
}

registerTab({ id: "theme", label: "Theme", render: renderTab, bind: bindTab });

export function startTheme() {
  onSettingsChange((name) => {
    if (name === SECTION) apply();
  });
  // New screens bring new stylesheets; recolour them as they arrive.
  onDomChange(() => {
    if (settings().recolor) applyRecolor();
  });
  apply();
}
