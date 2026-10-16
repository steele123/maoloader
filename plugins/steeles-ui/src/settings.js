// Steele's UI settings: a tab per area (Backdrop, Home, Top bar, Right panel, Theme, Profile).

import { getTabs, setSettingsOpener, openSettings, pluginUrl, revealWhenStyled } from "./core.js";

const SHEET_ID = "steeles-ui-settings";
const SHEET_STYLE_ID = "steeles-ui-settings-styles";
let lastTab = "";

function closeSettings() {
  document.getElementById(SHEET_ID)?.remove();
}

async function showTab(root, tabId) {
  const tabs = getTabs();
  const tab = tabs.find((entry) => entry.id === tabId) || tabs[0];
  if (!tab) return;
  lastTab = tab.id;
  root.querySelectorAll("[data-tab]").forEach((button) => {
    const selected = button.getAttribute("data-tab") === tab.id;
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
  const body = root.querySelector("[data-tab-body]");
  // Some tabs load data first (local backgrounds, queues); a tab switched away from meanwhile is dropped.
  if (tab.prepare) {
    try {
      await tab.prepare();
    } catch (error) {
      console.warn("[steeles-ui] Could not load the tab's data.", error);
    }
  }
  if (lastTab !== tab.id) return;
  body.innerHTML = tab.render();
  body.scrollTop = 0;
  tab.bind(body);
}

// A const for the loader's fallback path, which doesn't recognise "export async function".
export const openSettingsWindow = async (tabId) => {
  let element = document.getElementById(SHEET_ID);
  if (!element) {
    element = document.createElement("steeles-ui-settings");
    element.id = SHEET_ID;
    element.style.cssText = "position:fixed;inset:0;z-index:2147483646;display:flex;pointer-events:none;";
    element.attachShadow({ mode: "open" });
    document.body.appendChild(element);
  }

  const tabs = getTabs();
  const root = element.shadowRoot;
  root.innerHTML = `
    <link id="${SHEET_STYLE_ID}" rel="stylesheet" href="${pluginUrl("styles.css")}" />
    <div class="sheet-backdrop">
      <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <header class="sheet-header">
          <img src="${pluginUrl("assets/icon.svg")}" alt="" width="32" height="32" />
          <div class="sheet-title"><h1 id="sheet-title">Steele's UI</h1><span>Backdrop, home, top bar, panel, theme and profile</span></div>
          <button class="sheet-close" type="button" data-close aria-label="Close">×</button>
        </header>
        <nav class="tabs" role="tablist" aria-label="Settings sections">
          ${tabs.map((tab) => `<button class="tab" type="button" role="tab" data-tab="${tab.id}" aria-selected="false">${tab.label}</button>`).join("")}
        </nav>
        <div class="sheet-body" role="tabpanel" data-tab-body></div>
        <footer class="sheet-footer"><span>Saved automatically</span><span><kbd>Ctrl</kbd> + <kbd>K</kbd> → Steele's UI settings</span></footer>
      </section>
    </div>`;

  revealWhenStyled(element, SHEET_STYLE_ID);
  root.querySelector("[data-close]").addEventListener("click", closeSettings);
  const backdrop = root.querySelector(".sheet-backdrop");
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) closeSettings();
  });
  backdrop.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeSettings();
  });
  const tabList = root.querySelector("[role='tablist']");
  tabList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-tab]");
    if (button) showTab(root, button.getAttribute("data-tab"));
  });
  // Arrow keys move between tabs, as tab lists usually do.
  tabList.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const ids = tabs.map((tab) => tab.id);
    const next = ids[(ids.indexOf(lastTab) + (event.key === "ArrowRight" ? 1 : ids.length - 1)) % ids.length];
    showTab(root, next).then(() => root.querySelector(`[data-tab="${next}"]`)?.focus());
  });

  await showTab(root, tabId || lastTab || tabs[0]?.id);
  root.querySelector(`[data-tab="${lastTab}"]`)?.focus();
};

// maoloader 0.1.7+ has one settings window for every plugin: Steele's UI draws its tabs there as a
// page. Older runtimes don't, so they keep the standalone window above.
function renderPage(container, context) {
  const tabs = getTabs();
  container.innerHTML = `
    <link rel="stylesheet" href="${pluginUrl("settings-page.css")}" />
    <div class="sui-page">
      <nav class="subtabs" role="tablist" aria-label="Steele's UI sections">
        ${tabs.map((tab) => `<button type="button" role="tab" data-tab="${tab.id}" aria-selected="false">${tab.label}</button>`).join("")}
      </nav>
      <div data-tab-body></div>
    </div>`;
  const page = container.querySelector(".sui-page");
  page.querySelector("[role='tablist']").addEventListener("click", (event) => {
    const button = event.target.closest("[data-tab]");
    if (button) showTab(page, button.getAttribute("data-tab"));
  });
  showTab(page, context?.tab || lastTab || tabs[0]?.id);
}

export function startSettings() {
  if (typeof window.PluginSettings?.define === "function") {
    const settings = window.PluginSettings.define({
      id: "steeles-ui",
      title: "Steele's UI",
      description: "Backdrop, home, top bar, right panel, theme and profile. Changes apply as you make them.",
      icon: pluginUrl("assets/icon.svg"),
      // No declared fields; this key is never written. Steele's UI keeps its own settings.
      storageKey: "steeles-ui.plugin-settings",
      page: { render: renderPage },
    });
    setSettingsOpener((tabId) => settings.open({ tab: tabId }));
  } else {
    setSettingsOpener(openSettingsWindow);
  }
  window.CommandBar?.addAction?.({
    name: "Steele's UI settings",
    group: "steele's ui",
    tags: ["backdrop", "home", "top bar", "right panel", "theme", "settings", "steele"],
    perform: () => openSettings(),
  });
}
