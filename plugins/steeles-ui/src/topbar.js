// Top bar: keep Riot's, replace it with a slim custom bar, or hide it and navigate from Ctrl+K.

import {
  registerSection,
  registerTab,
  getSettings,
  updateSettings,
  onSettingsChange,
  onDomChange,
  requestSync,
  setRules,
  readOldSettings,
  pluginUrl,
  toast,
  escapeHtml,
  revealWhenStyled,
  openSettings,
  gearIcon,
  switchField,
  segmented,
  bindFormHelpers,
  showSections,
  navScreen,
  windowControls,
  NAV_SCREEN_SELECTOR,
  PANEL_SELECTOR,
  COLLAPSED_PANEL_STRIP,
  WINDOW_CONTROLS_SELECTOR,
} from "./core.js";

const SECTION = "topBar";
const BAR_ID = "steeles-ui-topbar";
const BAR_STYLE_ID = "steeles-ui-topbar-styles";
const NAV_ITEM_SELECTOR = ".main-navigation-menu-item";
const NAV_ITEM_PREFIX = "menu_item_navbar_";
const PLAY_BUTTON_SELECTORS = [".play-button-container", ".play-button-frame", ".play-button-text"];
const MODES = [
  { id: "riot", label: "Riot's" },
  { id: "custom", label: "Custom" },
  { id: "hidden", label: "Hidden" },
];
const DEFAULTS = { mode: "riot", navItems: [], showPlay: true };

const seenNav = new Map();
const navCommands = new Set();
let resizeObserver;
let navStyleObserver;
let observedNav;
let observedPanel;

registerSection(SECTION, {
  defaults: DEFAULTS,
  // The top bar options used to live in the Clean Home plugin.
  migrate: () => {
    const old = readOldSettings("clean-home.settings");
    return old ? { mode: old.topBar, navItems: old.navItems, showPlay: old.showPlay } : undefined;
  },
  normalize: (raw) => ({
    mode: MODES.some((mode) => mode.id === raw.mode) ? raw.mode : "riot",
    navItems: Array.isArray(raw.navItems) ? raw.navItems.map(String) : [],
    showPlay: raw.showPlay !== false,
  }),
});

function settings() {
  return getSettings(SECTION);
}

function applyRules() {
  if (settings().mode === "riot") {
    setRules(SECTION, []);
    return;
  }
  setRules(SECTION, [
    // visibility (not display) keeps Riot's bar laid out and clickable from code, and lets the
    // window controls inside it opt back in.
    `${NAV_SCREEN_SELECTOR} { visibility: hidden !important; }`,
    `${NAV_SCREEN_SELECTOR} :is(${WINDOW_CONTROLS_SELECTOR}) { visibility: visible !important; }`,
    // Dialogs, menus and tooltips live in the client's layer manager; keep them above the custom
    // bar (z-index 10) so a dialog's close button near the top stays clickable. :where() keeps this
    // weaker than any z-index the client sets itself.
    `:where(#lol-uikit-layer-manager-wrapper) > * { z-index: 11; }`,
    // A friend's profile opens as a full-page modal whose close button overlaps the bottom of the
    // top bar, as Riot draws it; lift its layer above the custom bar.
    `.rcp-fe-viewport-overlay > .screen-root:has(> lol-uikit-full-page-modal) { z-index: 11; }`,
  ]);
}

// ---- Riot's menu items ----

function navKey(item) {
  const name = [...item.classList].find((className) => className.startsWith(NAV_ITEM_PREFIX));
  return name ? name.slice(NAV_ITEM_PREFIX.length) : "";
}

function prettyKey(key) {
  const known = { tft: "TFT", event_hub: "Event hub" };
  return known[key] || key.replace(/_/g, " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

function navLabel(item, key) {
  const text = (item.textContent || "").replace(/\s+/g, " ").trim();
  const label = text || item.getAttribute("aria-label") || item.getAttribute("title") || prettyKey(key);
  // Riot's labels are all caps; title case reads better in lists and commands.
  return label === label.toUpperCase() && label.length > 3 ? label.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()) : label;
}

function nativeNavItems() {
  return [...document.querySelectorAll(NAV_ITEM_SELECTOR)].filter((item) => navKey(item));
}

function scanNav() {
  for (const item of nativeNavItems()) {
    const key = navKey(item);
    seenNav.set(key, navLabel(item, key));
    addNavCommand(key);
  }
}

// Our buttons click Riot's real (hidden) items, so navigation behaves exactly as normal.
function goTo(key) {
  const item = nativeNavItems().find((entry) => navKey(entry) === key);
  if (!item) {
    toast("warning", "That menu isn't available right now.", { duration: 2500 });
    return;
  }
  (item.querySelector("button, a, [role='button']") || item).click();
}

function clickPlay() {
  for (const selector of PLAY_BUTTON_SELECTORS) {
    const button = document.querySelector(selector);
    if (button) {
      button.click();
      return;
    }
  }
  toast("warning", "The Play button isn't available right now.", { duration: 2500 });
}

function addNavCommand(key) {
  if (navCommands.has(key) || typeof window.CommandBar?.addAction !== "function") return;
  navCommands.add(key);
  window.CommandBar.addAction({
    name: () => `Go to ${seenNav.get(key) || prettyKey(key)}`,
    group: "navigation",
    tags: ["navigate", "go", "menu", "top bar", key],
    perform: () => goTo(key),
  });
}

function shownNavKeys() {
  const order = nativeNavItems().map(navKey);
  const keys = order.length ? order : [...seenNav.keys()];
  const chosen = settings().navItems;
  return chosen.length ? keys.filter((key) => chosen.includes(key)) : keys;
}

// ---- Custom bar ----

// Where the panel sits when not shifted, so a collapsed panel (moved right but still in place)
// keeps the bar from running under the spot it slides back into. offsetLeft ignores transforms,
// so this is the same before, during and after the slide.
function panelLayoutLeft(panel, rect) {
  const parent = panel.offsetParent;
  if (!parent) return rect.left;
  return parent.getBoundingClientRect().left + parent.clientLeft + panel.offsetLeft;
}

// Where the custom bar has to stop: a little before the window controls, and right at the right
// panel (where your profile sits) when it reaches up beside the top bar, so the two meet with no gap.
const CONTROLS_GAP = 8;

function barRightEdge(rect) {
  const edges = [rect.right - 2 * CONTROLS_GAP, ...windowControls().map((element) => element.getBoundingClientRect().left - CONTROLS_GAP)];
  const panel = document.querySelector(PANEL_SELECTOR);
  const box = panel?.getBoundingClientRect();
  // A collapsed panel slides over the page when hovered, so it only claims its strip.
  if (box?.width && getComputedStyle(panel).position === "absolute") {
    const parent = panel.offsetParent?.getBoundingClientRect();
    if (parent) edges.push(parent.right - COLLAPSED_PANEL_STRIP);
  } else if (box?.width && box.top < rect.bottom && box.bottom > rect.top) {
    const left = panelLayoutLeft(panel, box);
    if (left > rect.left) edges.push(left);
  }
  return Math.min(...edges);
}

function watchSizes() {
  const nav = navScreen();
  const panel = document.querySelector(PANEL_SELECTOR);
  if (!nav || typeof ResizeObserver !== "function" || (nav === observedNav && panel === observedPanel)) return;
  resizeObserver?.disconnect();
  observedNav = nav;
  observedPanel = panel;
  resizeObserver = new ResizeObserver(requestSync);
  resizeObserver.observe(nav);
  if (panel) resizeObserver.observe(panel);
  // Riot shows and hides its bar with an inline style (see riotHidesBar).
  navStyleObserver?.disconnect();
  navStyleObserver = new MutationObserver(requestSync);
  navStyleObserver.observe(nav, { attributes: true, attributeFilter: ["style"] });
}

function createBar() {
  const element = document.createElement("steeles-ui-topbar");
  element.id = BAR_ID;
  const root = element.attachShadow({ mode: "open" });
  root.innerHTML = `
    <link id="${BAR_STYLE_ID}" rel="stylesheet" href="${pluginUrl("topbar.css")}" />
    <nav class="bar" aria-label="Main menu"><div class="items" data-items></div><button class="bar-icon" type="button" data-bar-settings aria-label="Top bar settings" title="Top bar settings">${gearIcon}</button></nav>`;
  revealWhenStyled(element, BAR_STYLE_ID);
  root.addEventListener("click", (event) => {
    const item = event.target.closest("[data-nav]");
    if (item) goTo(item.getAttribute("data-nav"));
    else if (event.target.closest("[data-play]")) clickPlay();
    else if (event.target.closest("[data-bar-settings]")) openSettings("topbar");
  });
  // Inside the client's root, so the client's own layers (a friend's profile, the collapsed panel
  // sliding open) can sit above the bar by z-index, as they do over Riot's bar.
  (document.getElementById("rcp-fe-viewport-root") || document.body).appendChild(element);
  return element;
}

// Champ select fills the whole window from its own full-screen layer, which hides Riot's top bar;
// the custom bar steps aside too instead of covering champ select's timer.
function fullScreenActive() {
  const layer = document.querySelector(".rcp-fe-viewport-full-screen");
  return [...(layer?.children || [])].some((screen) => {
    const box = screen.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && getComputedStyle(screen).visibility !== "hidden";
  });
}

// Screens that use the top of the window themselves, like post-game with its result and Advanced
// Details button, hide Riot's bar with an inline style; Steele's UI's rules hide it from a
// stylesheet, so the inline style is Riot's own signal.
function riotHidesBar(nav) {
  return nav?.style.visibility === "hidden";
}

function syncBar() {
  scanNav();
  watchSizes();
  const current = settings();
  let bar = document.getElementById(BAR_ID);
  const nav = navScreen();
  const rect = nav?.getBoundingClientRect();
  if (current.mode !== "custom" || !rect || !rect.height || fullScreenActive() || riotHidesBar(nav)) {
    bar?.remove();
    return;
  }
  if (!bar) bar = createBar();

  const rightEdge = barRightEdge(rect);
  const width = Math.max(0, Math.round(rightEdge - rect.left));
  bar.style.cssText =
    `position:fixed;left:${Math.round(rect.left)}px;top:${Math.round(rect.top)}px;` +
    `width:${width}px;height:${Math.round(rect.height)}px;z-index:10;display:block;` +
    (bar.style.visibility ? `visibility:${bar.style.visibility};` : "");

  const activeKey = navKey(document.querySelector(`${NAV_ITEM_SELECTOR}[active]`) || document.createElement("i"));
  const html =
    (current.showPlay ? '<button class="play" type="button" data-play>Play</button>' : "") +
    shownNavKeys()
      .map(
        (key) =>
          `<button class="item${key === activeKey ? " is-active" : ""}" type="button" data-nav="${escapeHtml(key)}">${escapeHtml(
            seenNav.get(key) || prettyKey(key),
          )}</button>`,
      )
      .join("");
  // Only touch the DOM when something changed, since this runs on every client update.
  if (bar.__lastHtml !== html) {
    bar.__lastHtml = html;
    bar.shadowRoot.querySelector("[data-items]").innerHTML = html;
  }
}

// ---- Settings tab ----

function renderTab() {
  const current = settings();
  return `
    <div class="field is-stacked">
      <span class="field-copy"><strong>Top bar</strong><small>Applies on every screen. Minimize, settings and close always stay.</small></span>
      ${segmented("data-tb-mode", MODES, current.mode, "Top bar")}
    </div>
    <div class="mode-section" data-tb-section="riot" ${current.mode === "riot" ? "" : "hidden"}>
      <div class="field is-stacked"><p class="field-note">Riot's top bar, unchanged.</p></div>
    </div>
    <div class="mode-section" data-tb-section="custom" ${current.mode === "custom" ? "" : "hidden"}>
      ${switchField("data-tb-play", current.showPlay, "Play button")}
      <div class="field is-stacked">
        <span class="field-copy"><strong>Menu items</strong><small>None ticked shows them all.</small></span>
        <div class="check-grid">
          ${
            seenNav.size
              ? [...seenNav]
                  .map(
                    ([key, label]) =>
                      `<label class="check"><input type="checkbox" data-tb-item="${escapeHtml(key)}" ${current.navItems.includes(key) ? "checked" : ""} /> ${escapeHtml(label)}</label>`,
                  )
                  .join("")
              : '<p class="field-note">The menu items haven\'t loaded yet.</p>'
          }
        </div>
      </div>
    </div>
    <div class="mode-section" data-tb-section="hidden" ${current.mode === "hidden" ? "" : "hidden"}>
      <div class="field is-stacked"><p class="field-note">Get around with <kbd>Ctrl</kbd> + <kbd>K</kbd>: every menu has a <code>Go to …</code> command, and <code>Open Play</code> opens the Play screen.</p></div>
    </div>`;
}

function bindTab(container) {
  bindFormHelpers(container);
  container.querySelectorAll("[data-tb-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.getAttribute("data-tb-mode");
      updateSettings(SECTION, { mode });
      container.querySelectorAll("[data-tb-mode]").forEach((other) => other.setAttribute("aria-checked", String(other === button)));
      showSections(container, "data-tb-section", mode);
    });
  });
  container.querySelector("[data-tb-play]").addEventListener("change", (event) => updateSettings(SECTION, { showPlay: event.target.checked }));
  container.querySelectorAll("[data-tb-item]").forEach((input) => {
    input.addEventListener("change", () => {
      const key = input.getAttribute("data-tb-item");
      const navItems = settings().navItems.filter((item) => item !== key);
      if (input.checked) navItems.push(key);
      updateSettings(SECTION, { navItems });
    });
  });
}

registerTab({ id: "topbar", label: "Top bar", prepare: async () => scanNav(), render: renderTab, bind: bindTab });

export function startTopBar() {
  onSettingsChange((name) => {
    if (name === SECTION) {
      applyRules();
      syncBar();
    }
    // The right panel changing mode moves where the bar has to stop.
    if (name === "panel") requestSync();
  });
  onDomChange(syncBar);
  applyRules();
  syncBar();
  window.CommandBar?.addAction?.({
    name: "Open Play",
    group: "navigation",
    tags: ["play", "lobby", "queue", "navigate"],
    perform: clickPlay,
  });
  window.CommandBar?.addAction?.({
    name: () => (settings().mode === "riot" ? "Use custom top bar" : "Show Riot's top bar"),
    group: "steele's ui",
    tags: ["top bar", "navigation", "menu", "navbar"],
    perform: () => updateSettings(SECTION, { mode: settings().mode === "riot" ? "custom" : "riot" }),
  });
  window.CommandBar?.addAction?.({
    name: () => (settings().mode === "hidden" ? "Show the top bar again" : "Hide the top bar"),
    group: "steele's ui",
    tags: ["top bar", "navigation", "menu", "navbar", "hide"],
    perform: () => updateSettings(SECTION, { mode: settings().mode === "hidden" ? "riot" : "hidden" }),
  });
}
