/**
 * @description Steele's UI: backdrop, custom home, top bar and right panel for the League client, in one plugin.
 * @author maoloader developers
 * @link https://github.com/steele123/maoloader
 */

import { state, persistSettings } from "./src/core.js";
// Import order is tab order in the settings window.
import { startBackdrop } from "./src/backdrop.js";
import { startHome } from "./src/home.js";
import { startTopBar } from "./src/topbar.js";
import { startPanel } from "./src/panel.js";
import { startSettings } from "./src/settings.js";

export function init(context) {
  if (context?.meta?.name) state.root = context.meta.name;
  state.socket = context?.socket || window.socket;
}

export function load() {
  persistSettings();
  startSettings();
  startBackdrop();
  startHome();
  startTopBar();
  startPanel();
}
