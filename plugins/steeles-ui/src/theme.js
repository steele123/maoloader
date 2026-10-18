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
  pluginUrl,
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
  { id: "geist", label: "Geist" },
  { id: "serif", label: "Serif" },
  { id: "custom", label: "Custom" },
];
const FONT_STACKS = {
  clean: { display: '"Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif', body: '"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif' },
  geist: { display: '"Geist", "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif', body: '"Geist", "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif' },
  serif: { display: '"LoL Display", Georgia, serif', body: '"LoL Display", Georgia, serif' },
};

const DEFAULTS = { recolor: false, accent: CLIENT_GOLD, neutral: false, font: "client", customFont: "" };

registerSection(SECTION, {
  defaults: DEFAULTS,
  normalize: (raw) => ({
    recolor: Boolean(raw.recolor),
    accent: hexOr(raw.accent, CLIENT_GOLD),
    neutral: Boolean(raw.neutral),
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

// Moves a gold shade to the accent: the accent's hue, saturation scaled the same way, and the
// shade's lightness shifted by the difference, so dark and light golds stay dark and light.
function accentShade(rgb, accent) {
  const [, goldS, goldL] = rgbToHsl(hexToRgb(CLIENT_GOLD));
  const [, shadeS, shadeL] = rgbToHsl(rgb);
  const [accentH, accentS, accentL] = rgbToHsl(hexToRgb(accent));
  const saturation = goldS ? clamp01(accentS * (shadeS / goldS)) : accentS;
  return hslToRgb([accentH, saturation, clamp01(shadeL + (accentL - goldL))]);
}

// ---- Recolouring ----
// Each client rule that uses gold (or, with neutral colours on, navy, teal or cream) gets a copy
// with only those properties, recoloured. The copies come later in the page with the same
// selectors, so they win and the client's own hover, active and disabled states keep working.

let lastSheetCount = -1;
let lastSignature = "";

const GOLD_KEYS = new Set(GOLD_SHADES.map((hex) => hexToRgb(hex).join(",")));
const HAS_COLOR = /#[0-9a-f]{3}|rgba?\(/i;
// Any hex or rgb()/rgba() colour, as stylesheets write them.
const COLOR_PATTERN = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b|rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*[\d.]+\s*)?\)/gi;

function parseColor(text) {
  if (text.startsWith("#")) {
    let hex = text.slice(1);
    if (hex.length <= 4) hex = [...hex].map((char) => char + char).join("");
    const rgb = [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16));
    return { rgb, alpha: hex.length === 8 ? String(Math.round((parseInt(hex.slice(6), 16) / 255) * 1000) / 1000) : undefined };
  }
  const parts = text.slice(text.indexOf("(") + 1, -1).split(",").map((part) => part.trim());
  return { rgb: parts.slice(0, 3).map((part) => Math.round(Number(part))), alpha: parts[3] };
}

// Navy, teal and blue, the dark gold-browns of frames and borders, and the client's creams and
// warm greys lose their colour but keep their lightness. Bright, light colours that mean something
// (status dots, rarity, wins and losses) stay.
function neutralShade(rgb) {
  const [h, s, l] = rgbToHsl(rgb);
  if (!s || (s >= 0.55 && l >= 0.5)) return undefined;
  const darkGold = h >= 30 && h <= 60 && l < 0.35;
  if (!((h >= 150 && h <= 260) || s < 0.35 || darkGold)) return undefined;
  return hslToRgb([h, 0, l]);
}

function recolorValue(value, accent, neutral) {
  return value.replace(COLOR_PATTERN, (match) => {
    const { rgb, alpha } = parseColor(match.toLowerCase());
    const shade = accent && GOLD_KEYS.has(rgb.join(",")) ? accentShade(rgb, accent) : neutral ? neutralShade(rgb) : undefined;
    if (!shade) return match;
    return alpha !== undefined ? `rgba(${shade.join(", ")}, ${alpha})` : `rgb(${shade.join(", ")})`;
  });
}

function recolorCss(sheets, accent, neutral) {
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
      if (rule.type !== CSSRule.STYLE_RULE || !HAS_COLOR.test(rule.cssText)) continue;
      const declarations = [];
      for (let index = 0; index < rule.style.length; index += 1) {
        const property = rule.style[index];
        const value = rule.style.getPropertyValue(property);
        if (!HAS_COLOR.test(value)) continue;
        const next = recolorValue(value, accent, neutral);
        // An !important original needs an !important copy to lose to.
        if (next !== value) declarations.push(`${property}: ${next}${rule.style.getPropertyPriority(property) ? " !important" : ""}`);
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

function recolorRoot(root, accent, neutral) {
  const head = root === document ? document.head || document.documentElement : root;
  let style = head.querySelector?.(`style[${RECOLOR_ATTRIBUTE}]`);
  if (!accent && !neutral) {
    style?.remove();
    return;
  }
  if (!style) {
    style = document.createElement("style");
    style.setAttribute(RECOLOR_ATTRIBUTE, "");
  }
  style.textContent = recolorCss(root.styleSheets, accent, neutral);
  // Last in the page (or shadow root), so it comes after every sheet it overrides.
  if (head.lastElementChild !== style) head.appendChild(style);
}

// Steele's UI's own windows have their own stylesheets; they follow the accent too.
function ownRoots() {
  return [...document.querySelectorAll("steeles-ui-home, steeles-ui-topbar, steeles-ui-settings")].map((host) => host.shadowRoot).filter(Boolean);
}

// A stylesheet still loading has no rules to read yet, and finishing doesn't change the sheet
// count; recolour again once it arrives. Loads come in bursts on screen changes, so batch them.
const watchedRoots = new WeakSet();
let reloadTimer = 0;

function watchSheetLoads(roots) {
  for (const root of roots) {
    if (watchedRoots.has(root)) continue;
    watchedRoots.add(root);
    root.addEventListener(
      "load",
      (event) => {
        const link = event.target;
        if (link?.tagName !== "LINK" || link.rel !== "stylesheet") return;
        const current = settings();
        if (!current.recolor && !current.neutral) return;
        clearTimeout(reloadTimer);
        reloadTimer = setTimeout(() => applyRecolor(true), 150);
      },
      true,
    );
  }
}

function applyRecolor(force = false) {
  const current = settings();
  const accent = current.recolor && current.accent.toLowerCase() !== CLIENT_GOLD ? current.accent : "";
  const neutral = current.neutral;
  const roots = [document, ...ownRoots()];
  watchSheetLoads(roots);
  const sheetCount = roots.reduce((total, root) => total + root.styleSheets.length, 0);
  const signature = `${accent}|${neutral}|${roots.length}`;
  // The client adds stylesheets as screens load; only redo the work when that happens.
  if (!force && sheetCount === lastSheetCount && signature === lastSignature) return;
  lastSheetCount = sheetCount;
  lastSignature = signature;
  for (const root of roots) recolorRoot(root, accent, neutral);
}

// Riot's components (buttons, inputs, tabs) keep their styles in their own shadow roots, out of
// reach of the page's rules, so each gets its own recoloured copy. Components of one kind share
// the same styles, so each kind's copy is only worked out once.
const COMPONENT_PATTERN = /^(LOL|UIKIT|HEXTECH)-/;
const componentCss = new Map();
const componentSources = new WeakMap();
let componentTimer = 0;

function componentRoots(scope = document, found = []) {
  for (const element of scope.querySelectorAll("*")) {
    const root = element.shadowRoot;
    if (!root) continue;
    if (COMPONENT_PATTERN.test(element.tagName)) found.push(root);
    // maoloader's and Steele's UI's own windows aren't Riot's; their insides are left alone.
    if (!/^(MAOLOADER|STEELES-UI)-/.test(element.tagName)) componentRoots(root, found);
  }
  return found;
}

function hashText(text) {
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) hash = (hash * 33 + text.charCodeAt(index)) | 0;
  return hash;
}

function recolorComponents() {
  const current = settings();
  const accent = current.recolor && current.accent.toLowerCase() !== CLIENT_GOLD ? current.accent : "";
  const neutral = current.neutral;
  for (const root of componentRoots()) {
    let style = root.querySelector(`style[${RECOLOR_ATTRIBUTE}]`);
    if (!accent && !neutral) {
      style?.remove();
      componentSources.delete(root);
      continue;
    }
    const sources = [...root.querySelectorAll(`style:not([${RECOLOR_ATTRIBUTE}]), link[rel="stylesheet"]`)];
    const known = componentSources.get(root);
    const lastSource = sources[sources.length - 1];
    // Same styles as last time, and the copy still comes after them: nothing to do.
    if (
      known?.mode === `${accent}|${neutral}` &&
      known.sources.length === sources.length &&
      known.sources.every((node, index) => node === sources[index]) &&
      (!style || !lastSource || lastSource.compareDocumentPosition(style) & Node.DOCUMENT_POSITION_FOLLOWING)
    ) {
      continue;
    }
    componentSources.set(root, { mode: `${accent}|${neutral}`, sources });
    const text = sources.map((node) => (node.tagName === "LINK" ? node.href : node.textContent)).join("\n");
    const key = `${accent}|${neutral}|${text.length}|${hashText(text)}`;
    if (!componentCss.has(key)) componentCss.set(key, recolorCss(root.styleSheets, accent, neutral));
    const css = componentCss.get(key);
    if (!css) {
      style?.remove();
      continue;
    }
    if (!style) {
      style = document.createElement("style");
      style.setAttribute(RECOLOR_ATTRIBUTE, "");
    }
    if (style.textContent !== css) style.textContent = css;
    root.appendChild(style);
  }
}

// Components appear as screens open; catch up shortly after the page settles.
function scheduleComponents() {
  if (componentTimer) return;
  componentTimer = setTimeout(() => {
    componentTimer = 0;
    recolorComponents();
  }, 250);
}

const NEUTRAL_COMPONENTS = ["lol-uikit-flat-button", "lol-uikit-flat-button-secondary", "lol-uikit-flat-button-group"];

// Champ select's Lock In button and the framed rune and spell buttons beside it.
const NEUTRAL_CHAMP_SELECT = [".lock-in .action-button", ".framed-icon-button-frame"];

// The right panel's party and invite card (a looping blue video), Clash's panel art, and the gold
// level ring around your icon; the icon itself keeps its colours.
const NEUTRAL_PANEL = [
  "lol-parties-game-info-panel",
  ".rcp-fe-viewport-sidebar .clash-social-persistent-magic-bg",
  ".lol-social-identity .summoner-level-ring",
];

// Post-game's Continue button and the close button beside it.
const NEUTRAL_POSTGAME = [".find-match-button-container", ".generic-button-primary-img-container img"];

const NEUTRAL_IMAGES = [
  ".generic-button-primary-img-container img",
  ".lobby-header-buttons-container",
  ".lobby-header-map-icon",
  ".point-eligibility-icon",
  ".find-match-button-container",
  ".close-button-container",
  ".v2-position-selector-component",
];

// Fonts that ship with the plugin.
const FONT_FILES = { geist: { family: "Geist", file: "assets/fonts/Geist-Variable.woff2" } };

function applyFont() {
  const current = settings();
  const custom = current.customFont.trim();
  const stack =
    current.font === "custom" && custom ? { display: `"${custom}", ${FONT_STACKS.clean.display}`, body: `"${custom}", ${FONT_STACKS.clean.body}` } : FONT_STACKS[current.font];
  // Steele's UI's own client styles (lobby and other screens) read the accent from here.
  const accent = current.recolor ? current.accent : CLIENT_GOLD;
  const rules = [`:root { --sui-accent: ${accent}; --sui-accent-rgb: ${hexToRgb(accent).join(", ")}; }`];
  const file = FONT_FILES[current.font];
  if (file) {
    rules.push(`@font-face { font-family: "${file.family}"; src: url("${pluginUrl(file.file)}") format("woff2"); font-weight: 100 900; font-style: normal; font-display: swap; }`);
  }
  // --sui-font reaches Steele's UI's own windows (home, top bar), which have their own styles.
  if (stack) rules.push(`:root { --font-display: ${stack.display} !important; --font-body: ${stack.body} !important; --sui-font: ${stack.body}; }`);
  // The lobby's gold and teal buttons are images, which recolouring can't reach; grey them instead.
  // The banners stay in colour: they're yours.
  if (current.neutral) rules.push(`.parties-view :is(${NEUTRAL_IMAGES.join(", ")}) { filter: grayscale(1); }`);
  if (current.neutral) rules.push(`.champion-select :is(${NEUTRAL_CHAMP_SELECT.join(", ")}) { filter: grayscale(1); }`);
  if (current.neutral) rules.push(`.postgame-footer :is(${NEUTRAL_POSTGAME.join(", ")}) { filter: grayscale(1); }`);
  if (current.neutral) rules.push(`:is(${NEUTRAL_PANEL.join(", ")}) { filter: grayscale(1); }`);
  // Riot's framed buttons draw their gold frame from images too.
  if (current.neutral) rules.push(`:is(${NEUTRAL_COMPONENTS.join(", ")}) { filter: grayscale(1); }`);
  setRules(SECTION, rules);
}

function apply() {
  applyFont();
  applyRecolor(true);
  recolorComponents();
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
    id: "mono",
    label: "Mono",
    swatches: ["#ededed", "#000000"],
    patch: {
      theme: { recolor: true, accent: "#ededed", neutral: true, font: "geist" },
      backdrop: { enabled: true, effect: "none", fillOpacity: 100, mode: "color", color: "#000000", hideScreenArt: true },
      topBar: { mode: "custom" },
      panel: { seeThrough: true, tint: 85, divider: true, dividerColor: "#262626", dividerWidth: 1 },
    },
  },
  {
    id: "hextech",
    label: "Hextech",
    swatches: ["#0ac8b9", "#091428"],
    patch: {
      theme: { recolor: true, neutral: false, accent: "#0ac8b9", font: "client" },
      backdrop: { enabled: true, effect: "none", fillOpacity: 100, mode: "gradient", gradientFrom: "#091428", gradientTo: "#0a7a8a", gradientAngle: 160 },
      panel: { seeThrough: true, tint: 55, divider: true, dividerColor: "#0ac8b9" },
    },
  },
  {
    id: "midnight",
    label: "Midnight",
    swatches: ["#9d8bff", "#05070d"],
    patch: {
      theme: { recolor: true, neutral: false, accent: "#9d8bff", font: "clean" },
      backdrop: { enabled: true, effect: "none", fillOpacity: 100, mode: "color", color: "#05070d" },
      topBar: { mode: "custom" },
      panel: { mode: "visible", seeThrough: true, tint: 70 },
    },
  },
  {
    id: "focus",
    label: "Focus",
    swatches: [CLIENT_GOLD, "#0a1428"],
    patch: {
      theme: { recolor: false, neutral: false, font: "clean" },
      backdrop: { enabled: true, effect: "none", fillOpacity: 100, mode: "color", color: "#0a1428" },
      topBar: { mode: "custom" },
      panel: { mode: "collapsed" },
    },
  },
  {
    id: "ember",
    label: "Ember",
    swatches: ["#ff7a45", "#1a0b10"],
    patch: {
      theme: { recolor: true, neutral: false, accent: "#ff7a45", font: "client" },
      backdrop: { enabled: true, effect: "none", fillOpacity: 100, mode: "gradient", gradientFrom: "#1a0b10", gradientTo: "#7a2a1f", gradientAngle: 125 },
      panel: { divider: true, dividerColor: "#ff7a45" },
    },
  },
  {
    id: "rose",
    label: "Rose",
    swatches: ["#f472b6", "#12060d", "#4a1230"],
    patch: {
      theme: { recolor: true, neutral: false, accent: "#f472b6", font: "clean" },
      backdrop: { enabled: true, effect: "none", fillOpacity: 100, mode: "gradient", gradientFrom: "#12060d", gradientTo: "#4a1230", gradientAngle: 150, hideScreenArt: true },
      topBar: { mode: "custom" },
      panel: { mode: "visible", seeThrough: true, tint: 60, divider: true, dividerColor: "#4a1230", dividerWidth: 1 },
    },
  },
  {
    id: "emerald",
    label: "Emerald",
    swatches: ["#34d399", "#04110c", "#0b3b2c"],
    patch: {
      theme: { recolor: true, neutral: false, accent: "#34d399", font: "geist" },
      backdrop: { enabled: true, effect: "none", fillOpacity: 100, mode: "gradient", gradientFrom: "#04110c", gradientTo: "#0b3b2c", gradientAngle: 165, hideScreenArt: true },
      topBar: { mode: "custom" },
      panel: { mode: "visible", seeThrough: true, tint: 65, divider: true, dividerColor: "#0b3b2c", dividerWidth: 1 },
    },
  },
  {
    id: "frost",
    label: "Frost",
    swatches: ["#7dd3fc", "#06101a", "#1b3a52"],
    patch: {
      theme: { recolor: true, neutral: false, accent: "#7dd3fc", font: "clean" },
      backdrop: { enabled: true, effect: "none", fillOpacity: 100, mode: "gradient", gradientFrom: "#06101a", gradientTo: "#1b3a52", gradientAngle: 200, hideScreenArt: true },
      topBar: { mode: "custom" },
      panel: { mode: "visible", seeThrough: true, tint: 50, divider: true, dividerColor: "#1b3a52", dividerWidth: 1 },
    },
  },
  {
    id: "void",
    label: "Void",
    swatches: ["#c084fc", "#0b0614", "#2a0f45"],
    patch: {
      theme: { recolor: true, neutral: false, accent: "#c084fc", font: "serif" },
      backdrop: { enabled: true, effect: "none", fillOpacity: 100, mode: "gradient", gradientFrom: "#0b0614", gradientTo: "#2a0f45", gradientAngle: 135, hideScreenArt: true },
      topBar: { mode: "custom" },
      panel: { mode: "visible", seeThrough: true, tint: 70, divider: true, dividerColor: "#c084fc", dividerWidth: 1 },
    },
  },
  {
    id: "crimson",
    label: "Crimson",
    swatches: ["#ef4444", "#0c0606"],
    patch: {
      theme: { recolor: true, neutral: true, accent: "#ef4444", font: "serif" },
      backdrop: { enabled: true, effect: "none", fillOpacity: 100, mode: "color", color: "#0c0606", hideScreenArt: true },
      topBar: { mode: "custom" },
      panel: { mode: "visible", seeThrough: true, tint: 85, divider: true, dividerColor: "#3a1212", dividerWidth: 1 },
    },
  },
  {
    // The desktop shows through, blurred and tinted dark (acrylic needs Windows 10 or 11).
    id: "glass",
    label: "Glass",
    swatches: ["#ffffff", "#2a2f36", "#11151a"],
    patch: {
      theme: { recolor: true, neutral: true, accent: "#f5f5f5", font: "geist" },
      backdrop: { enabled: true, mode: "color", color: "#0b0e12", fillOpacity: 55, effect: "acrylic", hideScreenArt: true },
      topBar: { mode: "custom" },
      panel: { mode: "visible", seeThrough: true, tint: 40, divider: true, dividerColor: "#3a3f46", dividerWidth: 1 },
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
      ${switchField("data-th-recolor", current.recolor, "Accent colour", "Recolours the client's gold: buttons, borders, highlights and text. Parts drawn as images, like framed button borders, keep their gold.")}
      <div class="mode-section" data-th-accent ${current.recolor ? "" : "hidden"}>
        <div class="field">
          <span class="field-copy"><strong>Colour</strong></span>
          ${colorField("data-th-accent-color", current.accent, "Accent colour")}
        </div>
      </div>
      ${switchField("data-th-neutral", current.neutral, "Neutral colours", "Turns the client's navy, teal and cream into greys, for a clean black-and-white look. Bright colours like rarity, wins and losses stay.")}
    </div>
    <div class="field is-stacked section-start">
      <span class="field-copy"><strong>Font</strong><small>League keeps Riot's fonts. Clean uses Windows' Segoe UI; Geist is a crisp modern sans that comes with Steele's UI; Serif uses League's title font everywhere.</small></span>
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
  container.querySelector("[data-th-neutral]").addEventListener("change", (event) => save({ neutral: event.target.checked }));
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
    if (!settings().recolor && !settings().neutral) return;
    applyRecolor();
    scheduleComponents();
  });
  apply();
}
