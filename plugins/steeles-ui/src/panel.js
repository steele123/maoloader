// Right panel: show, collapse until hover or hide the friends panel, hide parts of it, and make it
// see-through with an optional divider line.

import {
  registerSection,
  registerTab,
  getSettings,
  updateSettings,
  onSettingsChange,
  onDomChange,
  setRules,
  readOldSettings,
  clamp,
  hexOr,
  anchor,
  releaseAnchors,
  switchField,
  rangeField,
  segmented,
  colorField,
  bindFormHelpers,
  showSections,
  PANEL_SELECTOR,
  COLLAPSED_PANEL_STRIP,
} from "./core.js";

const SECTION = "panel";
const DIVIDER_ID = "steeles-ui-panel-divider";
const SECTION_ATTRIBUTE = "data-steeles-ui-panel-section";
const INNER_SELECTORS = [".lol-social-sidebar", ".lol-social-panel"];
const MODES = [
  { id: "visible", label: "Visible" },
  { id: "collapsed", label: "Collapse until hover" },
  { id: "hidden", label: "Hidden" },
];
// Each part is found from something only it contains; see markSections.
const PARTS = [
  { id: "profile", label: "Profile card", description: "Your icon, name and status at the top." },
  { id: "header", label: "Friends header", description: "The Social title and its add-friend and folder buttons." },
  { id: "friends", label: "Friends list", description: "Everyone in your friends list." },
  { id: "bottom", label: "Bottom bar", description: "The bar along the bottom of the panel." },
];
const DEFAULTS = {
  mode: "visible",
  hidden: [],
  seeThrough: true,
  tint: 45,
  divider: false,
  dividerColor: "#785a28",
  dividerWidth: 1,
};

registerSection(SECTION, {
  defaults: DEFAULTS,
  // The tint and divider used to live in the Backdrop plugin.
  migrate: () => {
    const old = readOldSettings("client-backdrop.settings");
    if (!old) return undefined;
    return {
      seeThrough: old.socialPanel !== false,
      tint: old.socialTint ?? DEFAULTS.tint,
      divider: Boolean(old.divider),
      dividerColor: old.dividerColor,
      dividerWidth: old.dividerWidth,
    };
  },
  normalize: (raw) => ({
    mode: MODES.some((mode) => mode.id === raw.mode) ? raw.mode : "visible",
    hidden: Array.isArray(raw.hidden) ? raw.hidden.filter((id) => PARTS.some((part) => part.id === id)) : [],
    seeThrough: Boolean(raw.seeThrough),
    tint: clamp(raw.tint, 0, 90),
    divider: Boolean(raw.divider),
    dividerColor: hexOr(raw.dividerColor, DEFAULTS.dividerColor),
    dividerWidth: clamp(raw.dividerWidth, 1, 4) || 1,
  }),
});

function settings() {
  return getSettings(SECTION);
}

function panel() {
  return document.querySelector(PANEL_SELECTOR);
}

function findPart(root, id) {
  if (id === "profile") {
    // Friends' avatars use the same element, so only count one outside the friends list.
    return [...root.querySelectorAll(".identity-icon, lol-social-avatar")].find((element) => !element.closest("lol-social-roster"));
  }
  if (id === "header") return root.querySelector(".lol-social-actions-bar");
  if (id === "friends") return root.querySelector("lol-social-roster");
  if (id === "bottom") return root.querySelector(".lol-social-lower-pane-container");
  return undefined;
}

// A part is the outermost element inside the panel that holds its marker and no other part's
// marker. That survives Riot renaming or re-nesting the wrappers around each part.
function markSections() {
  const root = panel();
  const wanted = root && settings().hidden.length;
  const marked = new Map();
  if (wanted) {
    const markers = PARTS.map((part) => [part.id, findPart(root, part.id)]).filter(([, element]) => element);
    for (const [id, marker] of markers) {
      const others = markers.filter(([otherId]) => otherId !== id).map(([, element]) => element);
      let node = marker;
      while (node.parentElement && node.parentElement !== root && !others.some((other) => node.parentElement.contains(other))) {
        node = node.parentElement;
      }
      if (node !== root) marked.set(node, id);
    }
  }
  for (const element of document.querySelectorAll(`[${SECTION_ATTRIBUTE}]`)) {
    if (!marked.has(element)) element.removeAttribute(SECTION_ATTRIBUTE);
  }
  for (const [element, id] of marked) {
    if (element.getAttribute(SECTION_ATTRIBUTE) !== id) element.setAttribute(SECTION_ATTRIBUTE, id);
  }
}

function applyRules() {
  const current = settings();
  const rules = [];
  if (current.mode === "hidden") {
    rules.push(`${PANEL_SELECTOR} { display: none !important; }`);
    // The client sizes everything else for a 223px panel: the main area is a fixed 1055px, the
    // persistent layer stops 223px short and the home screen is fixed too. Without these the
    // panel's space is left as a dead strip on the right.
    rules.push(
      `#rcp-fe-viewport-root > .rcp-fe-viewport-main { width: 100% !important; flex: 1 1 auto !important; }`,
      `#rcp-fe-viewport-root > .rcp-fe-viewport-persistent { right: 0 !important; }`,
      `#rcp-fe-viewport-root > .rcp-fe-viewport-persistent > .screen-root.active { width: 100% !important; }`,
      `#rcp-fe-viewport-root > .rcp-fe-viewport-persistent .activity-center-application { width: 100% !important; }`,
    );
  } else if (current.mode === "collapsed") {
    // Slides off to the right leaving a strip; hovering the strip brings it back over the page.
    // It's taken out of the layout so screens (lobby, profile, collection) use the space it
    // leaves instead of stopping 223px short.
    rules.push(
      `${PANEL_SELECTOR} { position: absolute !important; top: 0; bottom: 0; right: 0; transform: translateX(calc(100% - ${COLLAPSED_PANEL_STRIP}px)); transition: transform 0.22s ease; }`,
      `#rcp-fe-viewport-root > .rcp-fe-viewport-main { width: calc(100% - ${COLLAPSED_PANEL_STRIP}px) !important; flex: 0 0 auto !important; }`,
      `#rcp-fe-viewport-root > .rcp-fe-viewport-persistent { right: ${COLLAPSED_PANEL_STRIP}px !important; }`,
      `#rcp-fe-viewport-root > .rcp-fe-viewport-persistent > .screen-root.active { width: 100% !important; }`,
      `#rcp-fe-viewport-root > .rcp-fe-viewport-persistent .activity-center-application { width: 100% !important; }`,
    );
    // Open, it sits over the page but under the window controls. The custom top bar trims itself
    // where the open panel would be (see topbar.js).
    rules.push(`${PANEL_SELECTOR}:hover { transform: none; z-index: 11; }`);
    rules.push(`[data-screen-name="window-controls"] { z-index: 12; }`);
    // Over the page, a see-through panel would show the screen under it; keep it readable.
    if (current.seeThrough) {
      rules.push(`${PANEL_SELECTOR}:hover { background: rgba(1, 10, 19, ${Math.max(current.tint, 92) / 100}) !important; backdrop-filter: blur(8px); }`);
    }
    rules.push(
      `${PANEL_SELECTOR}:not(:hover)::before { content: ""; position: absolute; top: 0; bottom: 0; left: 0; width: ${COLLAPSED_PANEL_STRIP}px; ` +
        "background: linear-gradient(90deg, rgba(200,170,110,0.55), rgba(200,170,110,0.08)); z-index: 2147483001; pointer-events: none; }",
    );
  }
  for (const id of current.hidden) rules.push(`[${SECTION_ATTRIBUTE}="${id}"] { display: none !important; }`);
  if (current.seeThrough && current.mode !== "hidden") {
    rules.push(`${PANEL_SELECTOR} { background: rgba(1, 10, 19, ${current.tint / 100}) !important; }`);
    rules.push(`${INNER_SELECTORS.join(", ")} { background: transparent !important; }`);
  }
  if (current.divider && current.mode !== "hidden") {
    // The divider sits above the panel's content, so keep its layering inside the panel.
    rules.push(`${PANEL_SELECTOR} { isolation: isolate; }`);
  }
  setRules(SECTION, rules);
}

// A real element on top of the panel's content; a border or shadow on the panel gets covered by its children.
function renderDivider() {
  const current = settings();
  const root = panel();
  let line = document.getElementById(DIVIDER_ID);
  const show = current.divider && current.mode !== "hidden" && root;
  releaseAnchors("panel-divider", show ? root : undefined);
  if (!show) {
    line?.remove();
    return;
  }
  anchor(root, "panel-divider");
  if (!line || line.parentNode !== root) {
    line?.remove();
    line = document.createElement("div");
    line.id = DIVIDER_ID;
    line.setAttribute("aria-hidden", "true");
  }
  // Last child, so it paints above everything else in the panel.
  if (root.lastElementChild !== line) root.appendChild(line);
  line.style.cssText =
    `position:absolute;top:0;bottom:0;left:0;width:${current.dividerWidth}px;` +
    `background:${current.dividerColor};z-index:2147483000;pointer-events:none;`;
}

function apply() {
  applyRules();
  markSections();
  renderDivider();
}

// The client rebuilds parts of the panel as friends come and go; keep marks and the line in place.
function onPageChange() {
  const current = settings();
  if (current.hidden.length) markSections();
  if (current.divider) {
    const root = panel();
    const line = document.getElementById(DIVIDER_ID);
    if (root && (!line || line.parentNode !== root || root.lastElementChild !== line)) renderDivider();
  }
}

// ---- Settings tab ----

function renderTab() {
  const current = settings();
  return `
    <div class="field is-stacked">
      <span class="field-copy"><strong>Panel</strong><small>The friends and chat panel on the right.</small></span>
      ${segmented("data-pn-mode", MODES, current.mode, "Right panel")}
    </div>
    <div class="mode-section" data-pn-section="hidden" ${current.mode === "hidden" ? "" : "hidden"}>
      <div class="field is-stacked"><p class="field-note">Bring it back any time with <kbd>Ctrl</kbd> + <kbd>K</kbd> → <code>Show the right panel</code>.</p></div>
    </div>
    <div class="mode-section" data-pn-section="visible collapsed" ${current.mode === "hidden" ? "hidden" : ""}>
      <div class="field is-stacked section-start">
        <span class="field-copy"><strong>Hide parts</strong></span>
      </div>
      ${PARTS.map((part) => switchField(`data-pn-part="${part.id}"`, current.hidden.includes(part.id), part.label, part.description)).join("")}
      ${switchField("data-pn-see-through", current.seeThrough, "See-through", "Lets your backdrop show behind the panel.")}
      <div class="mode-section" data-pn-tint ${current.seeThrough ? "" : "hidden"}>
        ${rangeField("data-pn-tint-range", current.tint, "Panel tint", "Darkens the panel so names stay readable. 0% is fully clear.", { max: 90, unit: "%" })}
      </div>
      ${switchField("data-pn-divider", current.divider, "Divider", "A line between the client and the panel.")}
      <div class="mode-section" data-pn-divider-section ${current.divider ? "" : "hidden"}>
        <div class="field">
          <span class="field-copy"><strong>Divider color</strong></span>
          ${colorField("data-pn-divider-color", current.dividerColor, "Divider color")}
        </div>
        ${rangeField("data-pn-divider-width", current.dividerWidth, "Divider width", "Thickness of the line.", { min: 1, max: 4, unit: "px" })}
      </div>
    </div>`;
}

function bindTab(container) {
  bindFormHelpers(container);
  const save = (patch, options) => updateSettings(SECTION, patch, options);

  container.querySelectorAll("[data-pn-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.getAttribute("data-pn-mode");
      save({ mode });
      container.querySelectorAll("[data-pn-mode]").forEach((other) => other.setAttribute("aria-checked", String(other === button)));
      showSections(container, "data-pn-section", mode);
    });
  });
  container.querySelectorAll("[data-pn-part]").forEach((input) => {
    input.addEventListener("change", () => {
      const id = input.getAttribute("data-pn-part");
      const hidden = settings().hidden.filter((entry) => entry !== id);
      if (input.checked) hidden.push(id);
      save({ hidden });
    });
  });
  container.querySelector("[data-pn-see-through]").addEventListener("change", (event) => {
    save({ seeThrough: event.target.checked });
    container.querySelector("[data-pn-tint]").hidden = !event.target.checked;
  });
  container.querySelector("[data-pn-divider]").addEventListener("change", (event) => {
    save({ divider: event.target.checked });
    container.querySelector("[data-pn-divider-section]").hidden = !event.target.checked;
  });
  for (const [selector, key] of [
    ["[data-pn-tint-range]", "tint"],
    ["[data-pn-divider-width]", "dividerWidth"],
  ]) {
    const input = container.querySelector(selector);
    input.addEventListener("input", () => save({ [key]: Number(input.value) }, { save: false }));
    input.addEventListener("change", () => save({ [key]: Number(input.value) }));
  }
  const color = container.querySelector("[data-color][data-pn-divider-color]");
  color.addEventListener("input", () => save({ dividerColor: color.value }, { save: false }));
  color.addEventListener("change", () => save({ dividerColor: color.value }));
}

registerTab({ id: "panel", label: "Right panel", render: renderTab, bind: bindTab });

export function startPanel() {
  onSettingsChange((name) => {
    if (name === SECTION) apply();
  });
  onDomChange(onPageChange);
  apply();
  window.CommandBar?.addAction?.({
    name: () => (settings().mode === "hidden" ? "Show the right panel" : "Hide the right panel"),
    group: "steele's ui",
    tags: ["right panel", "friends", "social", "sidebar", "hide"],
    perform: () => updateSettings(SECTION, { mode: settings().mode === "hidden" ? "visible" : "hidden" }),
  });
  window.CommandBar?.addAction?.({
    name: () => (settings().mode === "collapsed" ? "Keep the right panel open" : "Collapse the right panel until hover"),
    group: "steele's ui",
    tags: ["right panel", "friends", "social", "sidebar", "collapse"],
    perform: () => updateSettings(SECTION, { mode: settings().mode === "collapsed" ? "visible" : "collapsed" }),
  });
}
