/**
 * @name maoloader-example
 * @description Reference plugin showing CSS imports, DataStore, Toast, CommandBar, and optional LCU socket hooks.
 * @author maoloader
 * @link https://maoloader.dev/plugins/maoloader-example
 */

import "./styles.css";

const STORE_KEY = "maoloader-example:clicks";
const PHASE_KEY = "maoloader-example:last-phase";
const ROOT_ID = "maoloader-example-root";

let context = {};
let subscription;

export function init(pluginContext = {}) {
  context = pluginContext;
  console.info("[maoloader-example] initialized", pluginContext.meta ?? {});
  window.Toast?.info?.("Example plugin initialized");
  observeGameflowPhase();
}

export function load() {
  mountPanel();
  registerCommand();
  window.Toast?.success?.("Example plugin loaded");
}

function observeGameflowPhase() {
  try {
    subscription = context.socket?.observe?.("/lol-gameflow/v1/gameflow-phase", (message) => {
      const phase = typeof message === "string" ? message : (message?.data ?? message?.eventType ?? "unknown");
      window.DataStore?.set?.(PHASE_KEY, phase);
      updatePanel();
    });
  } catch (error) {
    console.warn("[maoloader-example] could not observe gameflow phase", error);
  }
}

function registerCommand() {
  window.CommandBar?.addAction?.({
    id: "maoloader-example:ping",
    name: "Show example plugin toast",
    group: "maoloader example",
    legend: "Plugin template",
    tags: ["example", "toast", "datastore"],
    perform() {
      const clicks = incrementClicks();
      window.Toast?.success?.(`Example plugin action ran ${clicks} time${clicks === 1 ? "" : "s"}`);
      updatePanel();
    },
  });
}

function mountPanel() {
  if (!document.body || document.getElementById(ROOT_ID)) {
    return;
  }

  const root = document.createElement("section");
  root.id = ROOT_ID;
  root.setAttribute("aria-label", "maoloader example plugin");
  root.innerHTML = `
    <div class="maoloader-example-card">
      <p class="maoloader-example-kicker">maoloader example</p>
      <strong>Plugin API smoke test</strong>
      <span data-example-clicks></span>
      <span data-example-phase></span>
      <button type="button" data-example-action>Run action</button>
    </div>
  `;

  root.querySelector("[data-example-action]")?.addEventListener("click", () => {
    const clicks = incrementClicks();
    window.Toast?.info?.(`Stored ${clicks} example click${clicks === 1 ? "" : "s"}`);
    updatePanel();
  });

  document.body.appendChild(root);
  updatePanel();
}

function updatePanel() {
  const root = document.getElementById(ROOT_ID);
  if (!root) {
    return;
  }

  const clicks = Number(window.DataStore?.get?.(STORE_KEY, 0) ?? 0);
  const phase = window.DataStore?.get?.(PHASE_KEY, "not observed yet");

  const clicksElement = root.querySelector("[data-example-clicks]");
  if (clicksElement) {
    clicksElement.textContent = `DataStore clicks: ${clicks}`;
  }

  const phaseElement = root.querySelector("[data-example-phase]");
  if (phaseElement) {
    phaseElement.textContent = `Gameflow phase: ${phase}`;
  }
}

function incrementClicks() {
  const current = Number(window.DataStore?.get?.(STORE_KEY, 0) ?? 0);
  const next = current + 1;
  window.DataStore?.set?.(STORE_KEY, next);
  return next;
}

export function unload() {
  subscription?.disconnect?.();
  document.getElementById(ROOT_ID)?.remove?.();
}
