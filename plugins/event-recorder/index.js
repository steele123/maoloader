/**
 * @description Records the client's live events so plugin authors can see what data is available.
 * @author maoloader
 * @link https://github.com/steele123/maoloader
 */
(function () {
  const pluginName = "event-recorder";
  const hostId = "maoloader-event-recorder";
  const stylesheetId = "maoloader-event-recorder-styles";
  const ROW_LIMIT = 400;
  const DETAIL_LIMIT = 200_000;
  const TYPES = ["Create", "Update", "Delete"];

  // Used when the runtime has no PluginSettings (maoloader before 0.1.7).
  const FALLBACK_SETTINGS = { recordOnLoad: false, openOnLoad: false, maxEvents: 1000, keepData: true, ignore: "" };

  let pluginRoot = pluginName;
  let socket;
  let settings;
  let subscription;
  let recording = false;
  let events = [];
  let nextId = 1;
  let selectedId = 0;
  let view = "live";
  let filterText = "";
  const shownTypes = new Set(TYPES);
  const endpoints = new Map();
  let renderQueued = false;
  let ratePerSecond = 0;
  let rateCount = 0;

  // ---- Settings ----

  function defineSettings() {
    if (typeof window.PluginSettings?.define !== "function") {
      return { get: (key) => (key ? FALLBACK_SETTINGS[key] : { ...FALLBACK_SETTINGS }), onChange: () => () => {}, open: null };
    }
    return window.PluginSettings.define({
      id: pluginName,
      title: "Event recorder",
      description: "Records the League client's live events (the same ones plugins get from socket.observe) so you can see what data is available.",
      icon: `https://plugins/${pluginRoot}/assets/icon.svg`,
      fields: [
        { type: "heading", label: "Recording" },
        { key: "recordOnLoad", type: "toggle", label: "Record from client start", description: "Catches events sent while the client loads.", default: false },
        { key: "maxEvents", type: "range", label: "Events to keep", description: "Older events are dropped first.", min: 200, max: 5000, step: 100, default: 1000 },
        { key: "keepData", type: "toggle", label: "Keep event data", description: "Turn off to log only which endpoints fire. Uses far less memory.", default: true },
        {
          key: "ignore",
          type: "text",
          label: "Ignore endpoints",
          description: "Comma-separated beginnings, e.g. /lol-hovercard, /riot-messaging-service",
          placeholder: "/lol-hovercard, /patcher",
          maxLength: 1000,
          default: "",
        },
        { type: "heading", label: "Panel" },
        { key: "openOnLoad", type: "toggle", label: "Open the panel on client start", default: false },
        { type: "button", label: "Clear recorded events", buttonLabel: "Clear", action: () => clearEvents() },
      ],
    });
  }

  function ignoredPrefixes() {
    return String(settings.get("ignore") || "")
      .split(",")
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean);
  }

  // ---- Recording ----

  function onEvent(event) {
    if (!recording || !event || typeof event.uri !== "string") return;
    const uri = event.uri;
    const lower = uri.toLowerCase();
    if (ignoredPrefixes().some((prefix) => lower.startsWith(prefix))) return;

    const entry = {
      id: nextId++,
      time: Date.now(),
      uri,
      type: TYPES.includes(event.eventType) ? event.eventType : String(event.eventType || "Update"),
      data: settings.get("keepData") ? event.data : undefined,
    };
    events.push(entry);
    const limit = settings.get("maxEvents");
    if (events.length > limit) events.splice(0, events.length - limit);

    const endpoint = endpoints.get(uri) ?? { uri, count: 0, types: new Set(), last: entry };
    endpoint.count += 1;
    endpoint.types.add(entry.type);
    endpoint.last = entry;
    endpoints.set(uri, endpoint);
    rateCount += 1;
    queueRender();
  }

  function startRecording() {
    if (recording) return;
    recording = true;
    if (!subscription) subscription = socket?.observe?.("all", onEvent);
    queueRender();
    window.CommandBar?.update?.();
  }

  function stopRecording() {
    recording = false;
    queueRender();
    window.CommandBar?.update?.();
  }

  function clearEvents() {
    events = [];
    endpoints.clear();
    selectedId = 0;
    queueRender();
  }

  setInterval(() => {
    ratePerSecond = rateCount;
    rateCount = 0;
    if (host()) updateHeader();
  }, 1000);

  // ---- Helpers ----

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }

  function toast(kind, message, options) {
    const api = window.Toast;
    const show = api?.[kind] || api?.info || api?.show;
    return typeof show === "function" ? show(message, options) : undefined;
  }

  function clock(time) {
    const date = new Date(time);
    const pad = (value, size = 2) => String(value).padStart(size, "0");
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
  }

  async function copyText(text, what) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // The client can refuse the async clipboard; a hidden textarea still works.
      const area = document.createElement("textarea");
      area.value = text;
      area.style.cssText = "position:fixed;left:-9999px;";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    toast("success", `Copied ${what}.`, { duration: 1800 });
  }

  function observeSnippet(uri) {
    return `socket.observe("${uri}", (event) => {\n  // event.eventType is "Create", "Update" or "Delete"\n  console.log(event.data);\n});`;
  }

  function matches(entry) {
    if (!shownTypes.has(entry.type)) return false;
    const query = filterText.trim().toLowerCase();
    return !query || entry.uri.toLowerCase().includes(query);
  }

  // ---- Panel ----

  function host() {
    return document.getElementById(hostId);
  }

  function revealWhenStyled(element) {
    const link = element.shadowRoot.getElementById(stylesheetId);
    const show = () => (element.style.visibility = "");
    if (!link || link.sheet) return show();
    element.style.visibility = "hidden";
    link.addEventListener("load", show, { once: true });
    link.addEventListener("error", show, { once: true });
  }

  function closePanel() {
    host()?.remove();
    window.CommandBar?.update?.();
  }

  function openPanel() {
    if (host()) return;
    const element = document.createElement("maoloader-event-recorder");
    element.id = hostId;
    element.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483640;display:block;";
    element.attachShadow({ mode: "open" });
    document.body.appendChild(element);
    const root = element.shadowRoot;
    root.innerHTML = `
      <link id="${stylesheetId}" rel="stylesheet" href="https://plugins/${pluginRoot}/styles.css" />
      <section class="panel" role="dialog" aria-label="Event recorder">
        <header data-drag>
          <img src="https://plugins/${pluginRoot}/assets/icon.svg" alt="" width="20" height="20" />
          <strong>Event recorder</strong>
          <span class="status" data-status></span>
          <span class="spacer"></span>
          <button type="button" class="record" data-record></button>
          <button type="button" class="icon" data-clear title="Clear" aria-label="Clear">⌫</button>
          <button type="button" class="icon" data-export title="Save as JSON" aria-label="Save as JSON">⤓</button>
          ${settings.open ? '<button type="button" class="icon" data-settings title="Settings" aria-label="Settings">⚙</button>' : ""}
          <button type="button" class="icon" data-close title="Close" aria-label="Close">×</button>
        </header>
        <div class="toolbar">
          <input type="search" data-filter placeholder="Filter by endpoint, e.g. gameflow" aria-label="Filter by endpoint" value="${escapeHtml(filterText)}" />
          <span class="chips">${TYPES.map((type) => `<button type="button" class="chip is-${type.toLowerCase()}" data-type="${type}" aria-pressed="${shownTypes.has(type)}">${type}</button>`).join("")}</span>
          <span class="views" role="tablist">
            <button type="button" role="tab" data-view="live" aria-selected="${view === "live"}">Live</button>
            <button type="button" role="tab" data-view="endpoints" aria-selected="${view === "endpoints"}">Endpoints</button>
          </span>
        </div>
        <div class="split">
          <ol class="rows" data-rows></ol>
          <div class="detail" data-detail></div>
        </div>
      </section>`;
    revealWhenStyled(element);
    bindPanel(root, element);
    render();
    window.CommandBar?.update?.();
  }

  function bindPanel(root, element) {
    root.addEventListener("click", (event) => {
      const target = event.target;
      if (target.closest("[data-close]")) return closePanel();
      if (target.closest("[data-record]")) return recording ? stopRecording() : startRecording();
      if (target.closest("[data-clear]")) return clearEvents();
      if (target.closest("[data-export]")) return exportEvents();
      if (target.closest("[data-settings]")) return settings.open?.();
      const typeButton = target.closest("[data-type]");
      if (typeButton) {
        const type = typeButton.getAttribute("data-type");
        shownTypes.has(type) ? shownTypes.delete(type) : shownTypes.add(type);
        typeButton.setAttribute("aria-pressed", String(shownTypes.has(type)));
        return render();
      }
      const viewButton = target.closest("[data-view]");
      if (viewButton) {
        view = viewButton.getAttribute("data-view");
        root.querySelectorAll("[data-view]").forEach((button) => button.setAttribute("aria-selected", String(button === viewButton)));
        return render();
      }
      const row = target.closest("[data-id]");
      if (row) {
        selectedId = Number(row.getAttribute("data-id"));
        return render();
      }
      const copy = target.closest("[data-copy]");
      if (copy) return copySelected(copy.getAttribute("data-copy"));
    });
    root.querySelector("[data-filter]").addEventListener("input", (event) => {
      filterText = event.target.value;
      render();
    });
    root.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closePanel();
    });
    makeDraggable(root.querySelector("[data-drag]"), element);
  }

  // Drag by the header; the panel stays where it's dropped until the client reloads.
  function makeDraggable(handle, element) {
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest("button")) return;
      const rect = element.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      const offsetY = event.clientY - rect.top;
      handle.setPointerCapture(event.pointerId);
      const move = (moveEvent) => {
        const left = Math.min(window.innerWidth - 120, Math.max(0, moveEvent.clientX - offsetX));
        const top = Math.min(window.innerHeight - 40, Math.max(0, moveEvent.clientY - offsetY));
        element.style.cssText = `position:fixed;left:${left}px;top:${top}px;z-index:2147483640;display:block;`;
      };
      const stop = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", stop);
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", stop);
    });
  }

  function queueRender() {
    if (renderQueued || !host()) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      render();
    });
  }

  function updateHeader() {
    const root = host()?.shadowRoot;
    if (!root) return;
    const status = root.querySelector("[data-status]");
    if (status) status.textContent = `${events.length.toLocaleString()} events · ${endpoints.size} endpoints${recording ? ` · ${ratePerSecond}/s` : ""}`;
    const button = root.querySelector("[data-record]");
    if (button) {
      button.textContent = recording ? "Pause" : "Record";
      button.classList.toggle("is-on", recording);
    }
  }

  function render() {
    const root = host()?.shadowRoot;
    if (!root) return;
    updateHeader();
    const rows = root.querySelector("[data-rows]");
    if (view === "live") {
      const shown = [];
      for (let index = events.length - 1; index >= 0 && shown.length < ROW_LIMIT; index -= 1) {
        if (matches(events[index])) shown.push(events[index]);
      }
      rows.innerHTML = shown.length
        ? shown
            .map(
              (entry) =>
                `<li data-id="${entry.id}" class="${entry.id === selectedId ? "is-selected" : ""}"><span class="badge is-${entry.type.toLowerCase()}">${entry.type[0]}</span><span class="uri">${escapeHtml(entry.uri)}</span><time>${clock(entry.time)}</time></li>`,
            )
            .join("")
        : `<li class="empty">${recording ? "Waiting for events… do something in the client." : "Press Record to start capturing events."}</li>`;
    } else {
      const shown = [...endpoints.values()].filter((endpoint) => matches({ uri: endpoint.uri, type: endpoint.last.type })).sort((left, right) => right.count - left.count);
      rows.innerHTML = shown.length
        ? shown
            .slice(0, ROW_LIMIT)
            .map(
              (endpoint) =>
                `<li data-id="${endpoint.last.id}" class="${endpoint.last.id === selectedId ? "is-selected" : ""}"><span class="count">${endpoint.count}</span><span class="uri">${escapeHtml(endpoint.uri)}</span><time>${clock(endpoint.last.time)}</time></li>`,
            )
            .join("")
        : `<li class="empty">No endpoints yet.</li>`;
    }
    renderDetail(root.querySelector("[data-detail]"));
  }

  function selectedEvent() {
    return events.find((entry) => entry.id === selectedId) ?? [...endpoints.values()].find((endpoint) => endpoint.last.id === selectedId)?.last;
  }

  function renderDetail(detail) {
    const entry = selectedEvent();
    if (!entry) {
      detail.innerHTML = `<p class="hint">Pick an event to see its data and a ready-made <code>socket.observe</code> snippet.</p>`;
      return;
    }
    let json = entry.data === undefined ? "(data not kept; turn on “Keep event data” in settings)" : JSON.stringify(entry.data, null, 2) ?? "null";
    const truncated = json.length > DETAIL_LIMIT;
    if (truncated) json = `${json.slice(0, DETAIL_LIMIT)}\n…`;
    const endpoint = endpoints.get(entry.uri);
    detail.innerHTML = `
      <div class="detail-head">
        <span class="badge is-${entry.type.toLowerCase()}">${entry.type}</span>
        <code class="detail-uri">${escapeHtml(entry.uri)}</code>
      </div>
      <p class="meta">${clock(entry.time)}${endpoint ? ` · fired ${endpoint.count}× (${[...endpoint.types].join(", ")})` : ""}${truncated ? " · shortened for display" : ""}</p>
      <div class="actions">
        <button type="button" data-copy="snippet">Copy observe snippet</button>
        <button type="button" data-copy="json">Copy JSON</button>
        <button type="button" data-copy="uri">Copy endpoint</button>
      </div>
      <pre>${escapeHtml(json)}</pre>`;
  }

  function copySelected(what) {
    const entry = selectedEvent();
    if (!entry) return;
    if (what === "snippet") return copyText(observeSnippet(entry.uri), "the snippet");
    if (what === "uri") return copyText(entry.uri, "the endpoint");
    return copyText(JSON.stringify(entry.data, null, 2) ?? "null", "the JSON");
  }

  async function exportEvents() {
    const shown = events.filter(matches);
    if (!shown.length) {
      toast("info", "Nothing to save yet.", { duration: 2000 });
      return;
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const file = `recordings/events-${stamp}.json`;
    const body = JSON.stringify(
      shown.map((entry) => ({ time: new Date(entry.time).toISOString(), uri: entry.uri, eventType: entry.type, data: entry.data })),
      null,
      2,
    );
    const saved = window.PluginFS ? (await window.PluginFS.mkdir("recordings"), await window.PluginFS.write(file, body)) : false;
    if (saved) {
      toast("success", {
        title: `Saved ${shown.length} events`,
        description: `plugins/${pluginRoot}/${file}`,
        action: { label: "Open folder", onClick: () => window.openPluginsFolder?.(`${pluginRoot}/recordings`) },
      });
    } else {
      await copyText(body, `${shown.length} events as JSON (saving to a file isn't available)`);
    }
  }

  // ---- Commands ----

  function bindCommandBar() {
    if (typeof window.CommandBar?.addAction !== "function") return;
    window.CommandBar.addAction({
      name: () => (host() ? "Close the event recorder" : "Open the event recorder"),
      group: "event recorder",
      tags: ["events", "socket", "observe", "websocket", "lcu", "debug", "dev", "recorder"],
      perform: () => {
        if (host()) return closePanel();
        openPanel();
        startRecording();
      },
    });
    window.CommandBar.addAction({
      name: () => (recording ? "Pause recording events" : "Start recording events"),
      group: "event recorder",
      tags: ["events", "record", "socket", "dev"],
      perform: () => {
        recording ? stopRecording() : startRecording();
        toast("info", recording ? "Recording client events." : "Event recording paused.", { duration: 2000 });
      },
    });
  }

  exports.init = function init(context) {
    if (context?.meta?.name) pluginRoot = context.meta.name;
    socket = context?.socket || window.socket;
    settings = defineSettings();
    if (settings.get("recordOnLoad")) startRecording();
  };

  exports.load = function load() {
    bindCommandBar();
    if (settings.get("openOnLoad")) {
      openPanel();
      startRecording();
    }
  };
})();
