// Shared plumbing for Steele's UI: one settings store, one page watcher, one stylesheet of rules.

export const PLUGIN = "steeles-ui";
const SETTINGS_KEY = "steeles-ui.settings";
const RULES_STYLE_ID = "steeles-ui-rules";
const POSITIONED_MARKER = "data-steeles-ui-positioned";

export const state = { root: PLUGIN, socket: undefined };

export function pluginUrl(path) {
  return `https://plugins/${state.root}/${path}`;
}

// ---- Settings ----

const sections = new Map();
const settingsListeners = [];
let settings;

// Each area registers its defaults and how to clean stored values, before settings are first read.
export function registerSection(name, { defaults, normalize, migrate }) {
  sections.set(name, { defaults, normalize, migrate });
}

function loadSettings() {
  const stored = window.DataStore?.get?.(SETTINGS_KEY, undefined);
  const loaded = {};
  for (const [name, section] of sections) {
    // First run: carry settings over from the separate Backdrop and Clean Home plugins.
    const raw = stored && typeof stored === "object" ? stored[name] : section.migrate?.();
    const merged = { ...section.defaults, ...(raw && typeof raw === "object" ? raw : {}) };
    loaded[name] = section.normalize ? section.normalize(merged) : merged;
  }
  return loaded;
}

export function getSettings(name) {
  settings ??= loadSettings();
  return name ? settings[name] : settings;
}

// save: false previews a change (a slider being dragged) without writing it.
// quiet: true tells listeners not to re-render (notes being typed).
export function updateSettings(name, patch, { save = true, quiet = false } = {}) {
  getSettings();
  const section = sections.get(name);
  const merged = { ...settings[name], ...patch };
  settings = { ...settings, [name]: section?.normalize ? section.normalize(merged) : merged };
  if (save) window.DataStore?.set?.(SETTINGS_KEY, settings);
  for (const listener of settingsListeners) listener(name, { save, quiet });
  window.CommandBar?.update?.();
}

// Writes settings once on the first run, so carried-over settings stick without a change first.
export function persistSettings() {
  if (window.DataStore?.has?.(SETTINGS_KEY)) return;
  window.DataStore?.set?.(SETTINGS_KEY, getSettings());
}

export function onSettingsChange(listener) {
  settingsListeners.push(listener);
}

export function readOldSettings(key) {
  const value = window.DataStore?.get?.(key, undefined);
  return value && typeof value === "object" ? value : undefined;
}

// ---- Settings tabs ----
// Areas register their tab here and the settings window reads them from here, so no module
// imports another in a loop (the loader's fallback path awaits imports and would hang on a cycle).

const tabs = [];
let settingsOpener = () => {};

export function registerTab(tab) {
  tabs.push(tab);
}

export function getTabs() {
  return tabs;
}

export function setSettingsOpener(opener) {
  settingsOpener = opener;
}

export function openSettings(tabId) {
  settingsOpener(tabId);
}

// ---- Client landmarks used by several areas ----

export const NAV_SCREEN_SELECTOR = 'div[data-screen-name="rcp-fe-lol-navigation-screen"]';
export const PANEL_SELECTOR = ".rcp-fe-viewport-sidebar";
// Minimize, settings and close live in the top bar; they stay visible whatever the top bar mode.
export const WINDOW_CONTROLS_SELECTOR = '[class*="app-controls"], [class*="window-controls"]';

export function navScreen() {
  return document.querySelector(NAV_SCREEN_SELECTOR);
}

export function windowControls() {
  return [...document.querySelectorAll(`${NAV_SCREEN_SELECTOR} :is(${WINDOW_CONTROLS_SELECTOR})`)].filter(
    (element) => element.getBoundingClientRect().width > 0,
  );
}

// ---- Page rules: every area contributes CSS to one <style> ----

const ruleSets = new Map();

export function setRules(name, rules) {
  ruleSets.set(name, rules.filter(Boolean));
  let style = document.getElementById(RULES_STYLE_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = RULES_STYLE_ID;
    (document.head || document.documentElement).appendChild(style);
  }
  style.textContent = [...ruleSets.values()].flat().join("\n");
}

// ---- One watcher for the whole page ----

const domListeners = [];
let observer;
let queued = false;

function flush() {
  queued = false;
  for (const listener of domListeners) {
    try {
      listener();
    } catch (error) {
      console.error("[steeles-ui]", error);
    }
  }
}

// Batched to one call per frame, since the client changes the page constantly.
export function requestSync() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(flush);
}

export function onDomChange(listener) {
  domListeners.push(listener);
  if (observer || !document.body) return;
  observer = new MutationObserver(requestSync);
  // "active" moves between Riot's menu items without adding or removing elements.
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["active"] });
  window.addEventListener("resize", requestSync);
}

export function syncNow() {
  flush();
}

// ---- Helpers ----

export function toast(kind, message, options) {
  const api = window.Toast;
  const show = api?.[kind] || api?.info || api?.show;
  return typeof show === "function" ? show(message, options) : undefined;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// Written as a const: the loader's fallback path only recognises "export function" and "export const".
export const lcu = async (path, options) => {
  const response = await fetch(path, options);
  if (!response.ok) throw new Error(`${options?.method || "GET"} ${path} failed with ${response.status}`);
  const text = await response.text();
  return text ? JSON.parse(text) : undefined;
};

export function jsonRequest(method, body) {
  return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

const hexPattern = /^#[0-9a-f]{6}$/i;

export function isHex(value) {
  return hexPattern.test(String(value));
}

export function hexOr(value, fallback) {
  return isHex(value) ? String(value).toLowerCase() : fallback;
}

// CEF 108 predates color-mix(), so opacity is applied by converting hex to rgba.
export function rgba(hex, opacity) {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${opacity / 100})`;
}

// Keeps a surface hidden until its stylesheet applies, so it never flashes unstyled. data-ready
// turns transitions on two frames later, so styles arriving don't animate in.
export function revealWhenStyled(element, styleId) {
  const link = element.shadowRoot.getElementById(styleId);
  const show = () => {
    element.style.visibility = "";
    requestAnimationFrame(() => requestAnimationFrame(() => element.setAttribute("data-ready", "")));
  };
  if (!link || link.sheet) return show();
  element.style.visibility = "hidden";
  link.addEventListener("load", show, { once: true });
  link.addEventListener("error", show, { once: true });
}

// position: relative with no offsets doesn't move an element; it only lets us anchor things to it.
// Only applied to elements that were static, and undone when no longer needed.
export function anchor(element, owner) {
  if (!element) return;
  if (element.hasAttribute(POSITIONED_MARKER)) {
    const owners = new Set(element.getAttribute(POSITIONED_MARKER).split(" "));
    owners.add(owner);
    element.setAttribute(POSITIONED_MARKER, [...owners].join(" "));
    return;
  }
  if (getComputedStyle(element).position === "static") {
    element.style.position = "relative";
    element.setAttribute(POSITIONED_MARKER, owner);
  }
}

export function releaseAnchors(owner, keep) {
  for (const element of document.querySelectorAll(`[${POSITIONED_MARKER}]`)) {
    if (element === keep) continue;
    const owners = element.getAttribute(POSITIONED_MARKER).split(" ").filter((entry) => entry !== owner);
    if (owners.length) {
      element.setAttribute(POSITIONED_MARKER, owners.join(" "));
    } else {
      element.style.position = "";
      element.removeAttribute(POSITIONED_MARKER);
    }
  }
}

// Drawn rather than the ⚙ character, which renders differently from font to font.
export const gearIcon =
  '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
  '<circle cx="12" cy="12" r="3"/>' +
  '<path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>' +
  "</svg>";

// ---- Settings form helpers shared by every tab ----

export function switchField(attribute, checked, label, description = "") {
  return `
    <label class="field">
      <span class="field-copy"><strong>${label}</strong>${description ? `<small>${description}</small>` : ""}</span>
      <span class="switch"><input type="checkbox" ${attribute} ${checked ? "checked" : ""} /><span></span></span>
    </label>`;
}

export function rangeField(attribute, value, label, description, { min = 0, max = 100, step = 1, unit = "" } = {}) {
  return `
    <div class="field">
      <span class="field-copy"><strong>${label}</strong>${description ? `<small>${description}</small>` : ""}</span>
      <span class="range-row">
        <input type="range" min="${min}" max="${max}" step="${step}" value="${value}" ${attribute} data-unit="${unit}" aria-label="${label}" />
        <span class="field-value">${value}${unit}</span>
      </span>
    </div>`;
}

export function segmented(attribute, options, current, label) {
  return `
    <div class="segmented" role="radiogroup" aria-label="${label}" style="grid-template-columns:repeat(${options.length},minmax(0,1fr))">
      ${options.map((option) => `<button type="button" role="radio" ${attribute}="${option.id}" aria-checked="${current === option.id}">${option.label}</button>`).join("")}
    </div>`;
}

export function colorField(attribute, value, label) {
  return `
    <span class="color-field">
      <input type="color" value="${value}" data-color ${attribute} aria-label="${label}" />
      <input class="text-input hex-input" type="text" value="${value}" data-hex ${attribute} maxlength="7" spellcheck="false" aria-label="${label} hex" />
    </span>`;
}

// Live range labels and paired color inputs, for any tab's container.
export function bindFormHelpers(container) {
  container.querySelectorAll('input[type="range"]').forEach((input) => {
    const label = input.parentElement.querySelector(".field-value");
    input.addEventListener("input", () => {
      if (label) label.textContent = `${input.value}${input.getAttribute("data-unit") || ""}`;
    });
  });
  container.querySelectorAll(".color-field").forEach((field) => {
    const picker = field.querySelector("[data-color]");
    const hex = field.querySelector("[data-hex]");
    picker.addEventListener("input", () => {
      hex.value = picker.value;
      hex.classList.remove("is-invalid");
    });
    hex.addEventListener("input", () => {
      const value = hex.value.trim().startsWith("#") ? hex.value.trim() : `#${hex.value.trim()}`;
      const valid = isHex(value);
      hex.classList.toggle("is-invalid", !valid);
      if (valid) {
        picker.value = value.toLowerCase();
        picker.dispatchEvent(new Event("input", { bubbles: true }));
        picker.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
  });
}

export function showSections(container, attribute, value) {
  container.querySelectorAll(`[${attribute}]`).forEach((section) => {
    section.hidden = !section.getAttribute(attribute).split(" ").includes(value);
  });
}
