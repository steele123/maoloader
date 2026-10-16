/**
 * @description Visual DOM picker and sanitized snapshot exporter for maoloader plugin development.
 * @author maoloader developers
 * @link https://github.com/steele123/maoloader
 */
(function () {
  const pluginName = "maoloader-devtools";
  const hostId = "maoloader-dom-inspector";
  const stylesheetId = "maoloader-dom-inspector-styles";
  const historyKey = "maoloader-devtools.capture-history";
  const maxHtmlLength = 120000;
  const maxOutlineNodes = 180;
  const styleProperties = [
    "display",
    "visibility",
    "opacity",
    "position",
    "inset",
    "top",
    "right",
    "bottom",
    "left",
    "z-index",
    "width",
    "min-width",
    "max-width",
    "height",
    "min-height",
    "max-height",
    "margin",
    "padding",
    "border",
    "border-radius",
    "box-sizing",
    "overflow",
    "overflow-x",
    "overflow-y",
    "background",
    "background-color",
    "background-image",
    "color",
    "font-family",
    "font-size",
    "font-weight",
    "line-height",
    "letter-spacing",
    "text-align",
    "text-transform",
    "white-space",
    "text-overflow",
    "box-shadow",
    "filter",
    "transform",
    "transition",
    "animation",
    "pointer-events",
    "cursor",
    "user-select",
    "flex",
    "flex-direction",
    "align-items",
    "justify-content",
    "gap",
    "grid-template-columns",
    "grid-template-rows",
  ];
  const sensitiveAttribute = /(token|authorization|password|passwd|secret|session|cookie|account|puuid|summoner|email|phone|credential|srcdoc|value)/i;
  let pluginRoot = pluginName;
  let keybindBound = false;
  let commandBarBound = false;
  let picking = false;
  let hoveredElement = null;
  let selectedElement = null;
  let latestSnapshot = null;
  let captureSequence = 0;

  function inspectorHost() {
    return document.getElementById(hostId);
  }

  function inspectorRoot() {
    const host = inspectorHost();
    return host?.shadowRoot || host;
  }

  function ensureHost() {
    let host = inspectorHost();
    if (host) return host;

    host = document.createElement("maoloader-dom-inspector");
    host.id = hostId;
    host.style.cssText = "position:fixed;inset:0;z-index:2147483645;display:block;pointer-events:none;";
    try {
      host.attachShadow({ mode: "open", delegatesFocus: true });
    } catch {
      host.attachShadow?.({ mode: "open" });
    }
    document.body.appendChild(host);
    return host;
  }

  function ensureStylesheet() {
    const root = inspectorRoot();
    if (!root || root.querySelector(`#${stylesheetId}`)) return;

    const link = document.createElement("link");
    link.id = stylesheetId;
    link.rel = "stylesheet";
    link.href = `https://plugins/${pluginRoot}/styles.css`;
    root.appendChild(link);
  }

  function toast(kind, message) {
    const api = window.Toast;
    const show = api?.[kind] || api?.info || api?.show;
    if (typeof show === "function") show(message, { duration: 3200 });
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function cssEscape(value) {
    if (window.CSS?.escape) return window.CSS.escape(String(value));
    return String(value).replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
  }

  function redactText(value) {
    return String(value ?? "")
      .replace(/[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/g, "[redacted-email]")
      .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, "[redacted-id]")
      .replace(/\b(?:eyJ|RGV2|Bearer\s+)[A-Za-z0-9._~+/=-]{18,}\b/g, "[redacted-token]")
      .replace(/\b[A-Za-z0-9_-]{36,}\b/g, "[redacted-value]");
  }

  function sanitizeUrl(value) {
    const raw = String(value || "");
    if (/^(?:data|blob|javascript):/i.test(raw)) return `[redacted-${raw.split(":")[0].toLowerCase()}-url]`;
    try {
      const parsed = new URL(raw, location.href);
      parsed.username = "";
      parsed.password = "";
      parsed.search = "";
      parsed.hash = "";
      return parsed.href;
    } catch {
      return redactText(raw);
    }
  }

  function sanitizeClone(source) {
    const clone = source.cloneNode(true);
    const pairs = [[source, clone]];

    while (pairs.length) {
      const [original, copied] = pairs.pop();
      if (copied.nodeType === Node.ELEMENT_NODE) {
        const tag = copied.tagName?.toLowerCase();
        if (tag === "script" || tag === "noscript") {
          copied.replaceWith(document.createComment(`${tag} removed`));
          continue;
        }

        for (const attribute of [...copied.attributes]) {
          if (attribute.name.startsWith("on") || sensitiveAttribute.test(attribute.name)) {
            copied.setAttribute(attribute.name, "[redacted]");
          } else if (attribute.name === "href" || attribute.name === "src" || attribute.name === "action") {
            copied.setAttribute(attribute.name, sanitizeUrl(attribute.value));
          } else {
            copied.setAttribute(attribute.name, redactText(attribute.value));
          }
        }

        if (tag === "input" || tag === "textarea" || tag === "select") {
          copied.setAttribute("value", "[redacted]");
          if ("value" in copied) copied.value = "[redacted]";
        }
      } else if (copied.nodeType === Node.TEXT_NODE) {
        copied.textContent = redactText(copied.textContent);
      }

      const originalChildren = [...(original.childNodes || [])];
      const copiedChildren = [...(copied.childNodes || [])];
      for (let index = 0; index < Math.min(originalChildren.length, copiedChildren.length); index += 1) {
        pairs.push([originalChildren[index], copiedChildren[index]]);
      }
    }

    return clone;
  }

  function serializeElement(element) {
    const descendantCount = element.getElementsByTagName?.("*").length || 0;
    const descendantsOmitted = descendantCount > 1500;
    let sanitized;
    if (descendantsOmitted) {
      const shallow = element.cloneNode(false);
      shallow.appendChild(document.createComment(`${descendantCount} descendants omitted from HTML; see target.outline`));
      sanitized = sanitizeClone(shallow);
    } else {
      sanitized = sanitizeClone(element);
    }
    const html = sanitized.outerHTML || "";
    return {
      html: html.slice(0, maxHtmlLength),
      truncated: html.length > maxHtmlLength,
      originalLength: html.length,
      descendantsOmitted,
      descendantCount,
    };
  }

  function serializeShadowRoot(element) {
    if (!element.shadowRoot) return null;
    const container = document.createElement("div");
    for (const child of [...element.shadowRoot.childNodes]) {
      container.appendChild(sanitizeClone(child));
    }
    const html = container.innerHTML;
    return {
      mode: element.shadowRoot.mode || "open",
      html: html.slice(0, maxHtmlLength),
      truncated: html.length > maxHtmlLength,
      originalLength: html.length,
    };
  }

  function stableClasses(element) {
    return [...element.classList].filter(
      (className) => className.length <= 64 && !/\d{5,}/.test(className) && !/[a-f0-9]{12,}/i.test(className),
    );
  }

  function selectorSegment(element) {
    const tag = element.tagName.toLowerCase();
    if (element.id && element.id.length <= 80 && !/\d{5,}/.test(element.id)) {
      return `#${cssEscape(element.id)}`;
    }

    const classes = stableClasses(element).slice(0, 3);
    let segment = `${tag}${classes.map((className) => `.${cssEscape(className)}`).join("")}`;
    const parent = element.parentElement;
    if (parent) {
      const matching = [...parent.children].filter(
        (child) => child.tagName === element.tagName && classes.every((className) => child.classList.contains(className)),
      );
      if (matching.length > 1) segment += `:nth-of-type(${[...parent.children].filter((child) => child.tagName === element.tagName).indexOf(element) + 1})`;
    }
    return segment;
  }

  function selectorFor(element) {
    const parts = [];
    let current = element;

    while (current?.nodeType === Node.ELEMENT_NODE && parts.length < 8) {
      parts.unshift(selectorSegment(current));
      const root = current.getRootNode?.();
      const inShadowRoot = typeof ShadowRoot !== "undefined" && root instanceof ShadowRoot;
      if (current.id && !inShadowRoot) break;

      if (inShadowRoot) {
        parts.unshift(">>>");
        current = root.host;
      } else {
        current = current.parentElement;
      }
    }

    return parts.join(" > ").replace(/ > >>> > /g, " >>> ");
  }

  function ancestryFor(element) {
    const result = [];
    let current = element;
    while (current?.nodeType === Node.ELEMENT_NODE && result.length < 12) {
      result.unshift({
        tag: current.tagName.toLowerCase(),
        id: current.id || null,
        classes: stableClasses(current).slice(0, 8),
        role: current.getAttribute("role"),
      });
      const root = current.getRootNode?.();
      current = typeof ShadowRoot !== "undefined" && root instanceof ShadowRoot ? root.host : current.parentElement;
    }
    return result;
  }

  function attributesFor(element) {
    return Object.fromEntries(
      [...element.attributes].map((attribute) => {
        if (attribute.name.startsWith("on") || sensitiveAttribute.test(attribute.name)) return [attribute.name, "[redacted]"];
        if (["href", "src", "action"].includes(attribute.name)) return [attribute.name, sanitizeUrl(attribute.value)];
        return [attribute.name, redactText(attribute.value)];
      }),
    );
  }

  function computedStylesFor(element, pseudoElement) {
    let computed;
    try {
      computed = getComputedStyle(element, pseudoElement);
    } catch {
      return null;
    }
    return Object.fromEntries(styleProperties.map((property) => [property, computed.getPropertyValue(property)]));
  }

  function pseudoStylesFor(element, pseudoElement) {
    const computed = getComputedStyle(element, pseudoElement);
    const content = computed.getPropertyValue("content");
    if (!content || content === "none" || content === "normal") return null;
    return {
      content: redactText(content),
      display: computed.getPropertyValue("display"),
      position: computed.getPropertyValue("position"),
      color: computed.getPropertyValue("color"),
      background: computed.getPropertyValue("background"),
      width: computed.getPropertyValue("width"),
      height: computed.getPropertyValue("height"),
    };
  }

  function outlineFor(element) {
    let count = 0;
    let truncated = false;

    function visit(node, depth) {
      if (count >= maxOutlineNodes) {
        truncated = true;
        return null;
      }
      count += 1;
      const item = {
        tag: node.tagName.toLowerCase(),
        id: node.id || null,
        classes: stableClasses(node).slice(0, 6),
        role: node.getAttribute("role"),
        ariaLabel: redactText(node.getAttribute("aria-label")),
      };
      const directText = [...node.childNodes]
        .filter((child) => child.nodeType === Node.TEXT_NODE)
        .map((child) => child.textContent.trim())
        .filter(Boolean)
        .join(" ");
      if (directText) item.text = redactText(directText).slice(0, 180);
      if (depth < 7) {
        const children = [...node.children].map((child) => visit(child, depth + 1)).filter(Boolean);
        if (children.length) item.children = children;
      } else if (node.children.length) {
        item.childrenTruncated = true;
        truncated = true;
      }
      if (node.shadowRoot) item.hasOpenShadowRoot = true;
      return item;
    }

    return { tree: visit(element, 0), nodes: count, truncated };
  }

  function rectFor(element) {
    const rect = element.getBoundingClientRect();
    return {
      x: Math.round(rect.x * 100) / 100,
      y: Math.round(rect.y * 100) / 100,
      width: Math.round(rect.width * 100) / 100,
      height: Math.round(rect.height * 100) / 100,
      top: Math.round(rect.top * 100) / 100,
      right: Math.round(rect.right * 100) / 100,
      bottom: Math.round(rect.bottom * 100) / 100,
      left: Math.round(rect.left * 100) / 100,
    };
  }

  function cssStarter(selector, styles) {
    return `${selector} {\n  /* Current layout: ${styles.display}; ${styles.position}; ${styles.width} x ${styles.height} */\n  \n}`;
  }

  function buildSnapshot(element) {
    const selector = selectorFor(element);
    const styles = computedStylesFor(element) || {};
    const serialized = serializeElement(element);
    const parent = element.parentElement ? serializeElement(element.parentElement) : null;
    return {
      schemaVersion: 1,
      capturedAt: new Date().toISOString(),
      loader: {
        name: "maoloader",
        version: window.Pengu?.version || window.__llver || "unknown",
        plugin: pluginRoot,
      },
      page: {
        url: sanitizeUrl(location.href),
        pathname: location.pathname,
        hash: redactText(location.hash),
        title: redactText(document.title),
        viewport: { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio },
      },
      target: {
        selector,
        cssStarter: cssStarter(selector, styles),
        tag: element.tagName.toLowerCase(),
        id: element.id || null,
        classes: stableClasses(element),
        attributes: attributesFor(element),
        text: redactText(element.innerText || element.textContent || "").trim().slice(0, 2000),
        rect: rectFor(element),
        computedStyles: styles,
        pseudoElements: {
          before: pseudoStylesFor(element, "::before"),
          after: pseudoStylesFor(element, "::after"),
        },
        ancestry: ancestryFor(element),
        outline: outlineFor(element),
        outerHtml: serialized.html,
        outerHtmlTruncated: serialized.truncated,
        outerHtmlOriginalLength: serialized.originalLength,
        outerHtmlDescendantsOmitted: serialized.descendantsOmitted,
        descendantCount: serialized.descendantCount,
        shadowRoot: serializeShadowRoot(element),
      },
      context: parent
        ? {
            parentSelector: selectorFor(element.parentElement),
            parentHtml: parent.html,
            parentHtmlTruncated: parent.truncated,
            parentHtmlOriginalLength: parent.originalLength,
            parentHtmlDescendantsOmitted: parent.descendantsOmitted,
            parentDescendantCount: parent.descendantCount,
          }
        : null,
    };
  }

  function captureFileName() {
    captureSequence += 1;
    return `capture-${new Date().toISOString().replace(/[:.]/g, "-")}-${captureSequence}.json`;
  }

  function captureHistory() {
    const history = window.DataStore?.get?.(historyKey, []);
    return Array.isArray(history) ? history : [];
  }

  function rememberCapture(snapshot, fileName) {
    const history = captureHistory();
    history.unshift({
      capturedAt: snapshot.capturedAt,
      selector: snapshot.target.selector,
      tag: snapshot.target.tag,
      route: snapshot.page.pathname,
      path: `captures/${fileName}`,
    });
    window.DataStore?.set?.(historyKey, history.slice(0, 20));
  }

  async function saveSnapshot(snapshot) {
    if (typeof window.PluginFS?.write !== "function") return { saved: false, fileName: null };
    const fileName = captureFileName();
    const payload = JSON.stringify(snapshot, null, 2);
    await window.PluginFS.mkdir("captures");
    const saved = await window.PluginFS.write(`captures/${fileName}`, payload);
    const latestSaved = await window.PluginFS.write("captures/latest.json", payload);
    if (saved && latestSaved) rememberCapture(snapshot, fileName);
    return { saved: Boolean(saved && latestSaved), fileName };
  }

  async function copyText(value) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      const input = document.createElement("textarea");
      input.value = value;
      input.style.cssText = "position:fixed;opacity:0;pointer-events:none";
      document.body.appendChild(input);
      input.select();
      const copied = Boolean(document.execCommand?.("copy"));
      input.remove();
      return copied;
    }
  }

  async function captureElement(element, options = {}) {
    if (!(element instanceof Element)) throw new TypeError("MaoloaderDOM.capture expects a DOM Element.");
    const snapshot = buildSnapshot(element);
    latestSnapshot = snapshot;
    selectedElement = element;
    const result = options.save === false ? { saved: false, fileName: null } : await saveSnapshot(snapshot);
    renderPanel();
    if (result.saved) {
      toast("success", "DOM capture saved to captures/latest.json.");
    } else if (options.save !== false) {
      toast("warning", "DOM captured in memory, but PluginFS could not save it.");
    }
    return snapshot;
  }

  function updateHighlight(element) {
    const root = inspectorRoot();
    const highlight = root?.querySelector(".dom-highlight");
    const label = root?.querySelector(".dom-highlight-label");
    if (!highlight || !label || !element) return;
    const rect = element.getBoundingClientRect();
    highlight.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
    highlight.style.width = `${Math.max(0, rect.width)}px`;
    highlight.style.height = `${Math.max(0, rect.height)}px`;
    label.textContent = `${selectorSegment(element)}  ${Math.round(rect.width)} × ${Math.round(rect.height)}`;
  }

  function elementAtPoint(x, y) {
    let element = document.elementsFromPoint?.(x, y).find((candidate) => candidate !== inspectorHost() && !inspectorHost()?.contains(candidate)) || document.elementFromPoint(x, y);
    const visited = new Set();
    while (element?.shadowRoot && !visited.has(element)) {
      visited.add(element);
      const nested = element.shadowRoot.elementFromPoint?.(x, y);
      if (!(nested instanceof Element) || nested === element) break;
      element = nested;
    }
    return element;
  }

  function onPickerMove(event) {
    if (!picking) return;
    const element = elementAtPoint(event.clientX, event.clientY);
    if (!(element instanceof Element) || element === hoveredElement) return;
    hoveredElement = element;
    updateHighlight(element);
  }

  function onPickerClick(event) {
    if (!picking || event.button !== 0) return;
    const element = elementAtPoint(event.clientX, event.clientY) || hoveredElement;
    if (!(element instanceof Element)) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();
    stopPicker(false);
    captureElement(element).catch((error) => {
      console.error("[maoloader-devtools] Failed to capture element.", error);
      toast("error", `DOM capture failed: ${error?.message || error}`);
    });
  }

  function onPickerKeydown(event) {
    if (!picking || event.key !== "Escape") return;
    event.preventDefault?.();
    event.stopPropagation?.();
    stopPicker(true);
  }

  function startPicker() {
    openPanel(false);
    if (picking) return;
    picking = true;
    hoveredElement = null;
    inspectorRoot()?.querySelector(".dom-surface")?.classList.add("is-picking");
    window.addEventListener("mousemove", onPickerMove, true);
    window.addEventListener("click", onPickerClick, true);
    window.addEventListener("keydown", onPickerKeydown, true);
  }

  function stopPicker(cancelled) {
    if (!picking) return;
    picking = false;
    hoveredElement = null;
    window.removeEventListener("mousemove", onPickerMove, true);
    window.removeEventListener("click", onPickerClick, true);
    window.removeEventListener("keydown", onPickerKeydown, true);
    inspectorRoot()?.querySelector(".dom-surface")?.classList.remove("is-picking");
    if (cancelled) toast("info", "Element picker cancelled.");
  }

  function historyMarkup() {
    const history = captureHistory().slice(0, 5);
    if (!history.length) return '<div class="dom-empty">No captures yet</div>';
    return history
      .map(
        (entry) => `
          <div class="dom-history-row">
            <span>${escapeHtml(entry.tag)}</span>
            <div><strong>${escapeHtml(entry.selector)}</strong><small>${escapeHtml(entry.route)} · ${escapeHtml(new Date(entry.capturedAt).toLocaleTimeString())}</small></div>
          </div>`,
      )
      .join("");
  }

  function selectionMarkup() {
    if (!latestSnapshot) return '<div class="dom-empty dom-empty-selection">Pick an element to create a snapshot</div>';
    const target = latestSnapshot.target;
    return `
      <div class="dom-selection-heading">
        <span class="dom-tag">${escapeHtml(target.tag)}</span>
        <strong>${escapeHtml(target.selector)}</strong>
      </div>
      <dl>
        <div><dt>Size</dt><dd>${target.rect.width} × ${target.rect.height}</dd></div>
        <div><dt>Children</dt><dd>${target.outline.nodes - 1}</dd></div>
        <div><dt>Shadow root</dt><dd>${target.shadowRoot ? "Open" : "None"}</dd></div>
        <div><dt>HTML</dt><dd>${Math.round(target.outerHtmlOriginalLength / 1024 * 10) / 10} KB</dd></div>
      </dl>
      <pre>${escapeHtml(target.text || "No visible text")}</pre>`;
  }

  function bindPanelActions() {
    const root = inspectorRoot();
    root?.querySelector("[data-dom-close]")?.addEventListener("click", closePanel);
    root?.querySelector("[data-dom-pick]")?.addEventListener("click", startPicker);
    root?.querySelector("[data-dom-copy-selector]")?.addEventListener("click", async () => {
      if (!latestSnapshot) return;
      const copied = await copyText(latestSnapshot.target.selector);
      toast(copied ? "success" : "error", copied ? "Selector copied." : "Could not copy selector.");
    });
    root?.querySelector("[data-dom-copy-css]")?.addEventListener("click", async () => {
      if (!latestSnapshot) return;
      const copied = await copyText(latestSnapshot.target.cssStarter);
      toast(copied ? "success" : "error", copied ? "Starter CSS copied." : "Could not copy starter CSS.");
    });
    root?.querySelector("[data-dom-copy-json]")?.addEventListener("click", async () => {
      if (!latestSnapshot) return;
      const copied = await copyText(JSON.stringify(latestSnapshot, null, 2));
      toast(copied ? "success" : "error", copied ? "DOM snapshot copied." : "Could not copy DOM snapshot.");
    });
    root?.querySelector("[data-dom-folder]")?.addEventListener("click", () => window.openPluginsFolder?.(pluginRoot));
  }

  function renderPanel() {
    ensureHost();
    ensureStylesheet();
    const root = inspectorRoot();
    if (!root) return;
    const stylesheet = root.querySelector(`#${stylesheetId}`);
    root.replaceChildren?.(...(stylesheet ? [stylesheet] : []));
    if (!root.replaceChildren) root.innerHTML = "";
    if (!root.querySelector(`#${stylesheetId}`)) ensureStylesheet();

    const surface = document.createElement("div");
    surface.className = `dom-surface${picking ? " is-picking" : ""}`;
    surface.innerHTML = `
      <div class="dom-highlight"><span class="dom-highlight-label"></span></div>
      <div class="dom-picker-banner"><strong>Select an element</strong><span>Esc to cancel</span></div>
      <section class="dom-panel" aria-labelledby="dom-panel-title">
        <header>
          <div class="dom-title"><img src="https://plugins/${pluginRoot}/assets/icon.svg" alt="" /><div><h1 id="dom-panel-title">DOM Inspector</h1><span>${escapeHtml(location.pathname || "/")}</span></div></div>
          <button class="dom-icon-button" type="button" data-dom-close aria-label="Close DOM Inspector">×</button>
        </header>
        <div class="dom-primary-actions">
          <button class="dom-primary" type="button" data-dom-pick>Pick element</button>
          <button type="button" data-dom-folder>Captures folder</button>
        </div>
        <div class="dom-section">
          <div class="dom-section-title"><h2>Selection</h2><span>sanitized</span></div>
          ${selectionMarkup()}
          <div class="dom-secondary-actions">
            <button type="button" data-dom-copy-selector ${latestSnapshot ? "" : "disabled"}>Copy selector</button>
            <button type="button" data-dom-copy-css ${latestSnapshot ? "" : "disabled"}>Copy CSS</button>
            <button type="button" data-dom-copy-json ${latestSnapshot ? "" : "disabled"}>Copy JSON</button>
          </div>
        </div>
        <div class="dom-section dom-history">
          <div class="dom-section-title"><h2>Recent captures</h2><span>latest.json</span></div>
          ${historyMarkup()}
        </div>
        <footer><span>Capture file</span><code>captures/latest.json</code><kbd>Ctrl Shift D</kbd></footer>
      </section>`;
    root.appendChild(surface);
    bindPanelActions();
  }

  function openPanel(showToast = true) {
    if (!inspectorHost()) renderPanel();
    if (showToast) toast("success", "DOM Inspector opened.");
  }

  function closePanel() {
    stopPicker(false);
    inspectorHost()?.remove();
  }

  function togglePanel() {
    if (inspectorHost()) closePanel();
    else openPanel(false);
  }

  function bindKeybind() {
    if (keybindBound) return;
    keybindBound = true;
    window.addEventListener(
      "keydown",
      (event) => {
        if (event.ctrlKey && event.shiftKey && event.key?.toLowerCase() === "d") {
          event.preventDefault?.();
          event.stopPropagation?.();
          event.stopImmediatePropagation?.();
          togglePanel();
        }
      },
      true,
    );
  }

  function bindCommandBar() {
    if (commandBarBound || typeof window.CommandBar?.addAction !== "function") return;
    commandBarBound = true;
    window.CommandBar.addAction({
      name: "Open DOM Inspector",
      group: "maoloader developer",
      tags: ["element", "picker", "html", "css", "developer"],
      perform: () => openPanel(false),
    });
    window.CommandBar.addAction({
      name: "Pick Client Element",
      group: "maoloader developer",
      tags: ["dom", "inspect", "selector", "developer"],
      perform: startPicker,
    });
  }

  function exposeDeveloperApi() {
    const api = Object.freeze({
      open: () => openPanel(false),
      close: closePanel,
      pick: startPicker,
      capture: captureElement,
      getLatest: () => latestSnapshot,
      getCapturePath: () => `${pluginRoot}/captures/latest.json`,
    });
    try {
      Object.defineProperty(window, "MaoloaderDOM", {
        value: api,
        enumerable: false,
        configurable: true,
        writable: false,
      });
    } catch {
      window.MaoloaderDOM = api;
    }
  }

  exports.init = function init(context) {
    if (context?.meta?.name) pluginRoot = context.meta.name;
  };

  exports.load = function load() {
    bindKeybind();
    bindCommandBar();
    exposeDeveloperApi();
  };
})();
