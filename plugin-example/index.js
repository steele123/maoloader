/**
 * @name plugin-example
 * @description Root-level example plugin for testing maoloader registry submission manifests.
 * @author maoloader
 * @link https://github.com/steele123/maoloader
 */

import "./styles.css";

const ROOT_ID = "maoloader-plugin-example-root";
const STORE_KEY = "maoloader-plugin-example:clicks";

export function init(context = {}) {
  console.info("[plugin-example] initialized", context.meta ?? {});
  window.Toast?.info?.("Plugin example initialized");
}

export function load() {
  mountExamplePanel();
  window.Toast?.success?.("Plugin example loaded");
}

export function unload() {
  document.getElementById(ROOT_ID)?.remove?.();
}

function mountExamplePanel() {
  if (!document.body || document.getElementById(ROOT_ID)) {
    return;
  }

  const root = document.createElement("section");
  root.id = ROOT_ID;
  root.setAttribute("aria-label", "maoloader plugin example");
  root.innerHTML = `
    <div class="maoloader-plugin-example-card">
      <p>maoloader example</p>
      <strong>Registry manifest test</strong>
      <span data-click-count></span>
      <button type="button">Ping maoloader</button>
    </div>
  `;

  root.querySelector("button")?.addEventListener("click", () => {
    const clicks = incrementClicks();
    window.Toast?.success?.(`Example clicked ${clicks} time${clicks === 1 ? "" : "s"}`);
    updateClickCount();
  });

  document.body.appendChild(root);
  updateClickCount();
}

function incrementClicks() {
  const current = Number(window.DataStore?.get?.(STORE_KEY, 0) ?? 0);
  const next = current + 1;
  window.DataStore?.set?.(STORE_KEY, next);
  return next;
}

function updateClickCount() {
  const root = document.getElementById(ROOT_ID);
  const count = Number(window.DataStore?.get?.(STORE_KEY, 0) ?? 0);
  const target = root?.querySelector("[data-click-count]");
  if (target) {
    target.textContent = `Stored clicks: ${count}`;
  }
}
