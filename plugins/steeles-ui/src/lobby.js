// Lobby: cards for open party seats, the chat and the progression panel, plus switches to hide the
// chat while it can't be used and the progression panel. The styles live in lobby.css; this sets
// which of them apply.

import { registerSection, registerTab, getSettings, updateSettings, onSettingsChange, pluginUrl, switchField } from "./core.js";

const SECTION = "lobby";
const STYLE_ID = "steeles-ui-lobby-styles";
const ATTRIBUTE = "data-sui-lobby";
const DEFAULTS = { style: true, hideSoloChat: true, hideProgression: false };

registerSection(SECTION, {
  defaults: DEFAULTS,
  normalize: (raw) => ({
    style: raw.style !== false,
    hideSoloChat: raw.hideSoloChat !== false,
    hideProgression: Boolean(raw.hideProgression),
  }),
});

function settings() {
  return getSettings(SECTION);
}

function apply() {
  const current = settings();
  const tokens = [current.style && "style", current.hideSoloChat && "hide-solo-chat", current.hideProgression && "hide-progression"].filter(Boolean);
  if (tokens.length) {
    document.documentElement.setAttribute(ATTRIBUTE, tokens.join(" "));
    if (!document.getElementById(STYLE_ID)) {
      const link = document.createElement("link");
      link.id = STYLE_ID;
      link.rel = "stylesheet";
      link.href = pluginUrl("lobby.css");
      (document.head || document.documentElement).appendChild(link);
    }
  } else {
    document.documentElement.removeAttribute(ATTRIBUTE);
    document.getElementById(STYLE_ID)?.remove();
  }
}

// The open-seat card is drawn around Riot's small invite button; clicking anywhere on the card
// invites, not just the button. Riot's button acts on a full press and release, not click().
function onClick(event) {
  if (!settings().style) return;
  const seat = event.target.closest?.(".parties-view .invite-button-container");
  if (!seat || event.target.closest(".invite-button")) return;
  const button = seat.querySelector(".invite-button img");
  if (!button) return;
  const options = { bubbles: true, cancelable: true, composed: true, button: 0, view: window };
  for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
    button.dispatchEvent(type.startsWith("pointer") ? new PointerEvent(type, options) : new MouseEvent(type, options));
  }
}

// ---- Settings tab ----

function renderTab() {
  const current = settings();
  return `
    ${switchField("data-lb-style", current.style, "Lobby styling", "Open seats become cards you can click to invite, and the chat and progression panel match the rest of Steele's UI.")}
    ${switchField("data-lb-solo-chat", current.hideSoloChat, "Hide chat when it's off", "The lobby chat is switched off while you're on your own; hide it until someone joins.")}
    ${switchField("data-lb-progression", current.hideProgression, "Hide the progression panel", "The Progression and Invited tabs in the bottom right.")}`;
}

function bindTab(container) {
  for (const [selector, key] of [
    ["[data-lb-style]", "style"],
    ["[data-lb-solo-chat]", "hideSoloChat"],
    ["[data-lb-progression]", "hideProgression"],
  ]) {
    container.querySelector(selector).addEventListener("change", (event) => updateSettings(SECTION, { [key]: event.target.checked }));
  }
}

registerTab({ id: "lobby", label: "Lobby", render: renderTab, bind: bindTab });

export function startLobby() {
  onSettingsChange((name) => {
    if (name === SECTION) apply();
  });
  document.addEventListener("click", onClick, true);
  apply();
}
