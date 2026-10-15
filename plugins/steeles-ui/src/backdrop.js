// Backdrop: an image, video, color, gradient or see-through window behind the client.

import {
  registerSection,
  registerTab,
  getSettings,
  updateSettings,
  onSettingsChange,
  onDomChange,
  setRules,
  readOldSettings,
  pluginUrl,
  state,
  toast,
  escapeHtml,
  clamp,
  hexOr,
  rgba,
  switchField,
  rangeField,
  segmented,
  colorField,
  bindFormHelpers,
  showSections,
} from "./core.js";

const SECTION = "backdrop";
const LAYER_ID = "steeles-ui-backdrop-layer";
const BACKGROUNDS_DIR = "backgrounds";
const VIEWPORT_SELECTOR = "#rcp-fe-viewport-root";
const MEDIA_PATTERN = /\.(png|jpe?g|webp|gif|avif|mp4|webm)$/i;
const VIDEO_PATTERN = /\.(mp4|webm)(?:[?#]|$)/i;
const SCREEN_ART_SELECTORS = [".parties-background", ".activity-center__background-component__image"];
const MODES = [
  { id: "image", label: "Image" },
  { id: "color", label: "Color" },
  { id: "gradient", label: "Gradient" },
  { id: "transparent", label: "Transparent" },
];
const EFFECTS = [
  { id: "none", label: "None" },
  { id: "mica", label: "Mica (Windows 11)" },
  { id: "acrylic", label: "Acrylic" },
  { id: "blurbehind", label: "Blur behind" },
];
const GRADIENT_PRESETS = [
  { label: "Night", from: "#0f2027", to: "#2c5364", angle: 135 },
  { label: "Hextech", from: "#091428", to: "#0a7a8a", angle: 160 },
  { label: "Gold", from: "#1e1a12", to: "#785a28", angle: 145 },
  { label: "Ember", from: "#1a0b10", to: "#7a2a1f", angle: 125 },
  { label: "Violet", from: "#120c24", to: "#4b2a7a", angle: 150 },
];
const DEFAULTS = {
  enabled: true,
  mode: "image",
  sourceType: "none",
  file: "",
  url: "",
  dim: 35,
  blur: 0,
  color: "#0a1428",
  gradientFrom: GRADIENT_PRESETS[0].from,
  gradientTo: GRADIENT_PRESETS[0].to,
  gradientAngle: GRADIENT_PRESETS[0].angle,
  fillOpacity: 100,
  hideScreenArt: true,
  effect: "none",
};

let localFiles = [];
let appliedEffect = "";

registerSection(SECTION, {
  defaults: DEFAULTS,
  migrate: () => readOldSettings("client-backdrop.settings"),
  normalize: (raw) => ({
    enabled: Boolean(raw.enabled),
    mode: MODES.some((mode) => mode.id === raw.mode) ? raw.mode : "image",
    sourceType: ["none", "file", "url"].includes(raw.sourceType) ? raw.sourceType : "none",
    file: String(raw.file || ""),
    url: String(raw.url || ""),
    dim: clamp(raw.dim, 0, 85),
    blur: clamp(raw.blur, 0, 24),
    color: hexOr(raw.color, DEFAULTS.color),
    gradientFrom: hexOr(raw.gradientFrom, DEFAULTS.gradientFrom),
    gradientTo: hexOr(raw.gradientTo, DEFAULTS.gradientTo),
    gradientAngle: clamp(raw.gradientAngle, 0, 360),
    fillOpacity: clamp(raw.fillOpacity, 0, 100),
    hideScreenArt: Boolean(raw.hideScreenArt),
    effect: EFFECTS.some((effect) => effect.id === raw.effect) ? raw.effect : "none",
  }),
});

function settings() {
  return getSettings(SECTION);
}

function mediaUrl() {
  const current = settings();
  if (current.sourceType === "file" && current.file) {
    return pluginUrl(`${BACKGROUNDS_DIR}/${encodeURIComponent(current.file)}`);
  }
  if (current.sourceType === "url" && /^https:\/\//i.test(current.url.trim())) return current.url.trim();
  return "";
}

function fillBackground() {
  const current = settings();
  if (current.mode === "color") return rgba(current.color, current.fillOpacity);
  if (current.mode === "gradient") {
    return `linear-gradient(${current.gradientAngle}deg, ${rgba(current.gradientFrom, current.fillOpacity)}, ${rgba(current.gradientTo, current.fillOpacity)})`;
  }
  return "";
}

// What the layer should show: an image or video, a CSS fill, or nothing at all.
function layerSpec() {
  const current = settings();
  if (!current.enabled) return undefined;
  if (current.mode === "image") {
    const url = mediaUrl();
    return url ? { url } : undefined;
  }
  const background = fillBackground();
  return background ? { background } : undefined;
}

// Transparent mode needs a see-through window, so it falls back to the plain transparent effect.
function activeEffect() {
  const current = settings();
  if (!current.enabled) return "none";
  if (current.effect !== "none") return current.effect;
  return current.mode === "transparent" ? "transparent" : "none";
}

export function backdropActive() {
  return Boolean(layerSpec()) || activeEffect() !== "none";
}

function applyEffect() {
  const effect = activeEffect();
  if (effect === appliedEffect || (effect === "none" && !appliedEffect)) return;
  if (effect !== "none") {
    window.Effect?.apply?.(effect, effect === "mica" ? { material: "mica" } : {});
    appliedEffect = effect;
  } else {
    // Only clear an effect this plugin set, so other plugins' effects are left alone.
    window.Effect?.clear?.();
    appliedEffect = "";
  }
}

function applyRules() {
  if (!backdropActive()) {
    setRules(SECTION, []);
    return;
  }
  setRules(SECTION, [
    `html, body, ${VIEWPORT_SELECTOR} { background: transparent !important; }`,
    `${VIEWPORT_SELECTOR} { isolation: isolate; }`,
    settings().hideScreenArt ? `${SCREEN_ART_SELECTORS.join(", ")} { display: none !important; }` : "",
  ]);
}

function layerParent() {
  return document.querySelector(VIEWPORT_SELECTOR) || document.body;
}

function ensureLayer() {
  const parent = layerParent();
  if (!parent) return undefined;
  let layer = document.getElementById(LAYER_ID);
  if (!layer || layer.parentNode !== parent) {
    layer?.remove();
    layer = document.createElement("div");
    layer.id = LAYER_ID;
    layer.setAttribute("aria-hidden", "true");
    parent.insertBefore(layer, parent.firstChild);
  }
  layer.style.cssText = `position:${parent === document.body ? "fixed" : "absolute"};inset:0;z-index:-1;overflow:hidden;pointer-events:none;`;
  return layer;
}

function renderMedia(layer, url) {
  const current = settings();
  const isVideo = VIDEO_PATTERN.test(url);
  let media = layer.querySelector("[data-media]");
  if (!media || media.getAttribute("data-src") !== url) {
    media?.remove();
    media = document.createElement(isVideo ? "video" : "img");
    media.setAttribute("data-media", "");
    media.setAttribute("data-src", url);
    if (isVideo) {
      Object.assign(media, { autoplay: true, muted: true, loop: true, playsInline: true });
    } else {
      media.alt = "";
      media.decoding = "async";
    }
    media.addEventListener("error", () => toast("error", "The backdrop could not be loaded. Check the file or URL."), { once: true });
    media.src = url;
    layer.insertBefore(media, layer.firstChild);
  }
  media.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;" +
    (current.blur > 0 ? `filter:blur(${current.blur}px);transform:scale(1.06);` : "");

  let dim = layer.querySelector("[data-dim]");
  if (!dim) {
    dim = document.createElement("div");
    dim.setAttribute("data-dim", "");
    layer.appendChild(dim);
  }
  dim.style.cssText = `position:absolute;inset:0;background:rgba(5,8,12,${current.dim / 100});`;
}

function renderLayer() {
  const spec = layerSpec();
  if (!spec) {
    document.getElementById(LAYER_ID)?.remove();
    return;
  }
  const layer = ensureLayer();
  if (!layer) return;
  if (spec.url) {
    renderMedia(layer, spec.url);
  } else {
    layer.replaceChildren();
    layer.style.background = spec.background;
  }
}

function apply() {
  applyRules();
  applyEffect();
  if (document.body) renderLayer();
}

// The client builds its viewport after plugins start, and can rebuild it; re-attach the layer then.
function onPageChange() {
  if (!layerSpec()) return;
  const layer = document.getElementById(LAYER_ID);
  if (!layer || layer.parentNode !== layerParent()) renderLayer();
}

async function refreshLocalFiles() {
  const entries = await window.PluginFS?.ls?.(BACKGROUNDS_DIR);
  localFiles = Array.isArray(entries) ? entries.filter((name) => MEDIA_PATTERN.test(name)).sort((a, b) => a.localeCompare(b)) : [];
}

// ---- Settings tab ----

function sourceOptions() {
  const current = settings();
  const options = [`<option value="none" ${current.sourceType === "none" ? "selected" : ""}>No image</option>`];
  for (const file of localFiles) {
    const selected = current.sourceType === "file" && current.file === file;
    options.push(`<option value="file:${escapeHtml(file)}" ${selected ? "selected" : ""}>${escapeHtml(file)}</option>`);
  }
  if (current.sourceType === "file" && current.file && !localFiles.includes(current.file)) {
    options.push(`<option value="file:${escapeHtml(current.file)}" selected>${escapeHtml(current.file)} (missing)</option>`);
  }
  options.push(`<option value="url" ${current.sourceType === "url" ? "selected" : ""}>Image or video URL…</option>`);
  return options.join("");
}

function hiddenUnless(...modes) {
  return modes.includes(settings().mode) ? "" : "hidden";
}

function renderTab() {
  const current = settings();
  return `
    ${switchField("data-bd-enabled", current.enabled, "Use backdrop", "Turn off to get the stock client background back.")}
    <div class="field is-stacked">
      <span class="field-copy"><strong>Style</strong></span>
      ${segmented("data-bd-mode", MODES, current.mode, "Backdrop style")}
    </div>

    <div class="mode-section" data-bd-section="image" ${hiddenUnless("image")}>
      <div class="field is-stacked">
        <span class="field-copy"><strong>Background</strong><small>Files from the plugin's <code>backgrounds</code> folder (${localFiles.length} found), or an https URL.</small></span>
        <div class="source-row">
          <select data-bd-source aria-label="Background">${sourceOptions()}</select>
          <button class="button" type="button" data-bd-open-folder>Open folder</button>
        </div>
        <input class="text-input" type="url" data-bd-url placeholder="https://example.com/wallpaper.jpg" value="${escapeHtml(current.url)}" ${current.sourceType === "url" ? "" : "hidden"} />
      </div>
      ${rangeField('data-bd-range="dim"', current.dim, "Dim", "Darkens the image so text stays readable.", { max: 85, unit: "%" })}
      ${rangeField('data-bd-range="blur"', current.blur, "Blur", "Softens busy images.", { max: 24, unit: "px" })}
    </div>

    <div class="mode-section" data-bd-section="color" ${hiddenUnless("color")}>
      <div class="field">
        <span class="field-copy"><strong>Color</strong><small>One flat color behind everything.</small></span>
        ${colorField('data-bd-color="color"', current.color, "Color")}
      </div>
    </div>

    <div class="mode-section" data-bd-section="gradient" ${hiddenUnless("gradient")}>
      <div class="field is-stacked">
        <span class="field-copy"><strong>Presets</strong></span>
        <div class="presets">
          ${GRADIENT_PRESETS.map(
            (preset, index) =>
              `<button type="button" class="preset" data-bd-preset="${index}" title="${preset.label}" aria-label="${preset.label} gradient" style="background:linear-gradient(${preset.angle}deg, ${preset.from}, ${preset.to})"></button>`,
          ).join("")}
        </div>
      </div>
      <div class="field">
        <span class="field-copy"><strong>From</strong></span>
        ${colorField('data-bd-color="gradientFrom"', current.gradientFrom, "Gradient start")}
      </div>
      <div class="field">
        <span class="field-copy"><strong>To</strong></span>
        ${colorField('data-bd-color="gradientTo"', current.gradientTo, "Gradient end")}
      </div>
      ${rangeField('data-bd-range="gradientAngle"', current.gradientAngle, "Angle", "Direction of the gradient.", { max: 360, unit: "°" })}
    </div>

    <div class="mode-section" data-bd-section="color gradient" ${hiddenUnless("color", "gradient")}>
      ${rangeField('data-bd-range="fillOpacity"', current.fillOpacity, "Opacity", "Lower it to tint a window effect instead of covering it.", { unit: "%" })}
    </div>

    <div class="mode-section" data-bd-section="transparent" ${hiddenUnless("transparent")}>
      <div class="field is-stacked">
        <p class="field-note">The client background is removed so the window shows through. With no window effect you see your desktop; pick Mica, Acrylic or Blur behind to frost it.</p>
      </div>
    </div>

    ${switchField("data-bd-hide-art", current.hideScreenArt, "Hide screen art", "Removes lobby and home art that covers the backdrop.")}
    <div class="field">
      <span class="field-copy"><strong>Window effect</strong><small>Native see-through effect behind the client.</small></span>
      <select class="effect-select" data-bd-effect aria-label="Window effect">
        ${EFFECTS.map((effect) => `<option value="${effect.id}" ${current.effect === effect.id ? "selected" : ""}>${effect.label}</option>`).join("")}
      </select>
    </div>
    <div class="field is-stacked"><p class="field-note">The friends panel's see-through tint and divider are on the Right panel tab.</p></div>`;
}

function bindTab(container) {
  bindFormHelpers(container);
  const save = (patch, options) => updateSettings(SECTION, patch, options);

  container.querySelector("[data-bd-enabled]").addEventListener("change", (event) => save({ enabled: event.target.checked }));
  container.querySelector("[data-bd-hide-art]").addEventListener("change", (event) => save({ hideScreenArt: event.target.checked }));
  container.querySelector("[data-bd-effect]").addEventListener("change", (event) => save({ effect: event.target.value }));

  container.querySelectorAll("[data-bd-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.getAttribute("data-bd-mode");
      save({ mode });
      container.querySelectorAll("[data-bd-mode]").forEach((other) => other.setAttribute("aria-checked", String(other === button)));
      showSections(container, "data-bd-section", mode);
    });
  });

  const urlInput = container.querySelector("[data-bd-url]");
  container.querySelector("[data-bd-source]").addEventListener("change", (event) => {
    const value = event.target.value;
    urlInput.hidden = value !== "url";
    if (value.startsWith("file:")) save({ sourceType: "file", file: value.slice(5) });
    else save({ sourceType: value });
    if (value === "url") urlInput.focus();
  });
  urlInput.addEventListener("change", () => {
    const url = urlInput.value.trim();
    if (url && !/^https:\/\//i.test(url)) {
      toast("warning", "Use an https:// URL for the backdrop.");
      return;
    }
    save({ url });
  });
  container.querySelector("[data-bd-open-folder]").addEventListener("click", () => {
    window.openPluginsFolder?.(`${state.root}/${BACKGROUNDS_DIR}`);
  });

  // Sliders and colors preview while dragging and save when let go.
  container.querySelectorAll("[data-bd-range]").forEach((input) => {
    const key = input.getAttribute("data-bd-range");
    input.addEventListener("input", () => save({ [key]: Number(input.value) }, { save: false }));
    input.addEventListener("change", () => save({ [key]: Number(input.value) }));
  });
  container.querySelectorAll("[data-color][data-bd-color]").forEach((picker) => {
    const key = picker.getAttribute("data-bd-color");
    picker.addEventListener("input", () => save({ [key]: picker.value }, { save: false }));
    picker.addEventListener("change", () => save({ [key]: picker.value }));
  });

  container.querySelectorAll("[data-bd-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      const preset = GRADIENT_PRESETS[Number(button.getAttribute("data-bd-preset"))];
      save({ gradientFrom: preset.from, gradientTo: preset.to, gradientAngle: preset.angle });
      for (const [key, value] of [
        ["gradientFrom", preset.from],
        ["gradientTo", preset.to],
      ]) {
        container.querySelectorAll(`[data-bd-color="${key}"]`).forEach((input) => (input.value = value));
      }
      const angle = container.querySelector('[data-bd-range="gradientAngle"]');
      angle.value = String(preset.angle);
      angle.dispatchEvent(new Event("input"));
    });
  });
}

registerTab({ id: "backdrop", label: "Backdrop", prepare: refreshLocalFiles, render: renderTab, bind: bindTab });

export function startBackdrop() {
  onSettingsChange((name) => {
    if (name === SECTION) apply();
  });
  onDomChange(onPageChange);
  apply();
  window.CommandBar?.addAction?.({
    name: () => (settings().enabled ? "Turn off backdrop" : "Turn on backdrop"),
    group: "steele's ui",
    tags: ["background", "wallpaper", "theme", "backdrop"],
    perform: () => updateSettings(SECTION, { enabled: !settings().enabled }),
  });
}
