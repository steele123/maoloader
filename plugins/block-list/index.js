/**
 * @description A better block list: search it, sort it A–Z, keep a note on why you blocked someone, see when you blocked them, and confirm before unblocking.
 * @author maoloader
 * @link https://github.com/steele123/maoloader
 */
(function () {
  const pluginName = "block-list";
  const settingsKey = "block-list.settings";
  const notesKey = "block-list.notes";
  const seenKey = "block-list.seen";
  const blockedApi = "/lol-chat/v1/blocked-players";
  const ROOT = ".lol-blocked-summoners";
  const LIST = ".blocked-summoners-list";
  const CARD = ".lol-blocked-player";
  const CARD_ACTION = ".lol-block-list-player";
  const TOOLBAR_ID = "maoloader-block-list-toolbar";
  const STYLE_ID = "maoloader-block-list-style";
  const defaults = { confirmUnblock: true, sort: "client", notesOnly: false };

  let pluginRoot = pluginName;
  let settings;
  let commandBound = false;
  let blocked = [];
  let byKey = new Map();
  let notes = readObject(notesKey);
  // When each player first showed up on your list, by PUUID. Everyone already blocked when the
  // plugin first ran is stored as 0: the client keeps no dates, so those have none.
  let seen = readObject(seenKey);
  let query = "";
  let editing = "";
  let confirming = null;
  let bypassClick = false;
  let observer;
  let decorateFrame = 0;

  function readObject(key) {
    const value = window.DataStore?.get?.(key);
    return value && typeof value === "object" ? value : {};
  }

  function toast(kind, message, options) {
    const api = window.Toast;
    const show = api?.[kind] || api?.info || api?.show;
    return typeof show === "function" ? show(message, options) : undefined;
  }

  async function lcu(path, options) {
    const response = await fetch(path, options);
    if (!response.ok) throw new Error(`${options?.method || "GET"} ${path} failed with ${response.status}`);
    const text = await response.text();
    return text ? JSON.parse(text) : undefined;
  }

  const escapeHtml = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const riotId = (player) => `${player.gameName || player.name || ""}#${player.gameTag || ""}`;
  // Cards show "Name #TAG" with the tag wrapped in invisible text-direction marks; the API has
  // the name and tag apart.
  const keyOf = (text) =>
    String(text || "")
      .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
      .replace(/\s+/g, " ")
      .replace(/\s*#\s*/, "#")
      .trim()
      .toLowerCase();
  const day = (time) => new Date(time).toLocaleDateString([], { month: "short", day: "numeric", year: new Date(time).getFullYear() === new Date().getFullYear() ? undefined : "numeric" });

  // ---- Data ----

  async function refreshBlocked() {
    try {
      const list = await lcu(blockedApi);
      blocked = Array.isArray(list) ? list : [];
    } catch {
      return;
    }
    byKey = new Map(blocked.map((player) => [keyOf(riotId(player)), player]));
    const firstRun = !Object.keys(seen).length;
    let changed = false;
    for (const player of blocked) {
      if (player.puuid && !(player.puuid in seen)) {
        seen[player.puuid] = firstRun ? 0 : Date.now();
        changed = true;
      }
    }
    if (changed) window.DataStore?.set?.(seenKey, seen);
    requestDecorate();
  }

  function setNote(puuid, text) {
    const value = String(text || "").trim().slice(0, 200);
    if (value) notes[puuid] = value;
    else delete notes[puuid];
    window.DataStore?.set?.(notesKey, notes);
  }

  // ---- Styles ----

  const STYLE = `
    #${TOOLBAR_ID} { display: grid; gap: 8px; margin: 10px 0 12px; }
    #${TOOLBAR_ID} .bl-row { display: flex; align-items: center; gap: 8px; }
    #${TOOLBAR_ID} .bl-search { position: relative; flex: 1; }
    #${TOOLBAR_ID} .bl-search svg { position: absolute; left: 10px; top: 50%; width: 14px; height: 14px; transform: translateY(-50%); color: #8c96a0; pointer-events: none; }
    #${TOOLBAR_ID} input { box-sizing: border-box; width: 100%; height: 32px; padding: 0 30px 0 32px; border: 1px solid rgba(200, 170, 110, 0.35); border-radius: 4px; background: rgba(1, 10, 19, 0.75); color: #f0e6d2; font: inherit; font-size: 13px; outline: none; }
    #${TOOLBAR_ID} input:focus { border-color: #c8aa6e; }
    #${TOOLBAR_ID} input::placeholder { color: #6f7880; }
    #${TOOLBAR_ID} .bl-clear { position: absolute; right: 6px; top: 50%; display: none; width: 20px; height: 20px; transform: translateY(-50%); border: 0; border-radius: 50%; background: transparent; color: #8c96a0; font-size: 15px; line-height: 20px; cursor: pointer; }
    #${TOOLBAR_ID} .bl-search.has-text .bl-clear { display: block; }
    #${TOOLBAR_ID} .bl-clear:hover { color: #f0e6d2; }
    #${TOOLBAR_ID} .bl-seg { display: inline-flex; border: 1px solid rgba(200, 170, 110, 0.3); border-radius: 4px; overflow: hidden; }
    #${TOOLBAR_ID} .bl-seg button, #${TOOLBAR_ID} .bl-button { height: 30px; padding: 0 10px; border: 0; background: rgba(1, 10, 19, 0.6); color: #a09b8c; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap; }
    #${TOOLBAR_ID} .bl-seg button + button { border-left: 1px solid rgba(200, 170, 110, 0.2); }
    #${TOOLBAR_ID} .bl-seg button[aria-pressed="true"] { background: rgba(200, 170, 110, 0.16); color: #f0e6d2; }
    #${TOOLBAR_ID} .bl-button { border: 1px solid rgba(200, 170, 110, 0.3); border-radius: 4px; }
    #${TOOLBAR_ID} button:hover { color: #f0e6d2; }
    #${TOOLBAR_ID} .bl-count { color: #8c96a0; font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap; }
    #${TOOLBAR_ID} .bl-empty { display: none; margin: 4px 0 0; color: #8c96a0; font-size: 12.5px; }
    #${TOOLBAR_ID}.is-empty .bl-empty { display: block; }

    ${CARD}.bl-hidden { display: none !important; }
    ${CARD} { position: relative; }
    ${CARD}.bl-has-extra { height: auto !important; min-height: 52px; }
    ${CARD} .bl-extra { margin: -4px 0 6px 32px; padding-right: 12px; color: #8c96a0; font-size: 11.5px; line-height: 1.35; overflow-wrap: anywhere; }
    ${CARD} .bl-extra em { color: #c8aa6e; font-style: normal; }
    /* The client shows its own unblock X at the row's right end on hover, so the pencil takes that
       spot only while the card isn't hovered, and steps to the X's left when it is. */
    ${CARD} .bl-note-button { position: absolute; top: 15px; right: 13px; display: grid; place-items: center; width: 22px; height: 22px; border: 0; border-radius: 4px; background: transparent; color: #8c96a0; cursor: pointer; opacity: 0; }
    ${CARD}:hover .bl-note-button { right: 38px; background: rgba(1, 10, 19, 0.9); }
    ${CARD}:hover .bl-note-button, ${CARD} .bl-note-button:focus-visible, ${CARD}.bl-has-note .bl-note-button { opacity: 1; }
    ${CARD} .bl-note-button:hover { background: rgb(30, 35, 40); color: #f0e6d2; }
    ${CARD}.bl-has-note .bl-note-button { color: #c8aa6e; }
    ${CARD} .bl-note-button svg { width: 13px; height: 13px; }
    ${CARD} .bl-note-editor { display: flex; gap: 6px; margin: -2px 8px 8px 32px; }
    ${CARD} .bl-note-editor input { flex: 1; min-width: 0; height: 26px; padding: 0 8px; border: 1px solid #c8aa6e; border-radius: 4px; background: rgba(1, 10, 19, 0.85); color: #f0e6d2; font: inherit; font-size: 12px; outline: none; }
    ${CARD} .bl-confirm { position: absolute; inset: 0; z-index: 2; display: flex; align-items: center; justify-content: flex-end; gap: 6px; padding: 0 8px; border-radius: 4px; border: 1px solid rgba(224, 88, 75, 0.45); background: rgba(1, 10, 19, 0.96); }
    ${CARD} .bl-confirm span { margin-right: auto; padding-left: 4px; color: #f0e6d2; font-size: 12px; font-weight: 700; }
    ${CARD} .bl-mini { height: 24px; padding: 0 10px; border: 1px solid rgba(200, 170, 110, 0.45); border-radius: 4px; background: rgba(1, 10, 19, 0.8); color: #f0e6d2; font: inherit; font-size: 11.5px; font-weight: 700; cursor: pointer; }
    ${CARD} .bl-mini.is-danger { border-color: rgba(224, 88, 75, 0.7); color: #f0a39a; }
    ${CARD} .bl-mini:hover { border-color: #f0e6d2; }
    html[data-maoloader-streamer] ${CARD} .bl-extra .bl-note-text { filter: blur(5px); }
  `;

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = STYLE;
    document.head.appendChild(style);
  }

  const ICONS = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-4-4L4 16z"/></svg>',
  };

  // ---- Toolbar ----

  function ensureToolbar(root) {
    let toolbar = document.getElementById(TOOLBAR_ID);
    if (toolbar && root.contains(toolbar)) return toolbar;
    toolbar?.remove();
    toolbar = document.createElement("div");
    toolbar.id = TOOLBAR_ID;
    toolbar.innerHTML = `
      <div class="bl-row">
        <label class="bl-search">${ICONS.search}<input type="text" spellcheck="false" aria-label="Search your block list" /><button class="bl-clear" type="button" aria-label="Clear search">×</button></label>
        <span class="bl-count" aria-live="polite"></span>
      </div>
      <div class="bl-row">
        <span class="bl-seg" role="group" aria-label="Sort">
          <button type="button" data-bl-sort="client">Client order</button><button type="button" data-bl-sort="name">A–Z</button><button type="button" data-bl-sort="recent">Newest</button>
        </span>
        <button class="bl-button" type="button" data-bl-notes aria-pressed="false">With notes</button>
        <span style="flex:1"></span>
        <button class="bl-button" type="button" data-bl-copy>Copy list</button>
      </div>
      <p class="bl-empty">No blocked players match.</p>`;
    const input = toolbar.querySelector("input");
    input.value = query;
    // The client's settings window handles keys; keep typing here from reaching it.
    input.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Escape" && input.value) {
        event.preventDefault();
        setQuery("");
      }
    });
    input.addEventListener("input", () => setQuery(input.value, { keepInput: true }));
    toolbar.querySelector(".bl-clear").addEventListener("click", () => {
      setQuery("");
      input.focus();
    });
    toolbar.querySelectorAll("[data-bl-sort]").forEach((button) =>
      button.addEventListener("click", () => {
        settings.set?.("sort", button.getAttribute("data-bl-sort"));
        requestDecorate();
      }),
    );
    toolbar.querySelector("[data-bl-notes]").addEventListener("click", () => {
      settings.set?.("notesOnly", !settings.get("notesOnly"));
      requestDecorate();
    });
    toolbar.querySelector("[data-bl-copy]").addEventListener("click", copyList);
    const info = root.querySelector(".blocked-summoners-info");
    root.insertBefore(toolbar, info ? info.nextSibling : root.querySelector(LIST));
    return toolbar;
  }

  function setQuery(value, { keepInput = false } = {}) {
    query = String(value || "");
    const input = document.querySelector(`#${TOOLBAR_ID} input`);
    if (input && !keepInput) input.value = query;
    requestDecorate();
  }

  async function copyList() {
    const text = blocked.map(riotId).join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.cssText = "position:fixed;left:-9999px;";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    toast("success", `Copied ${blocked.length} Riot IDs.`, { duration: 2500 });
  }

  // ---- Cards ----

  function playerFor(card) {
    const tagline = card.querySelector(".blocked-player-game-name-tagline")?.textContent;
    return byKey.get(keyOf(tagline));
  }

  function extraHtml(player) {
    const note = notes[player.puuid];
    const when = seen[player.puuid];
    const parts = [];
    if (note) parts.push(`<span class="bl-note-text">${escapeHtml(note)}</span>`);
    if (when) parts.push(`<em>Blocked ${escapeHtml(day(when))}</em>`);
    return parts.join(" · ");
  }

  function decorateCard(card, player) {
    card.dataset.blPuuid = player.puuid;
    if (!card.querySelector(".bl-note-button")) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "bl-note-button";
      button.innerHTML = ICONS.note;
      card.appendChild(button);
    }
    const button = card.querySelector(".bl-note-button");
    const note = notes[player.puuid];
    button.title = note ? "Edit note" : "Add a note";
    button.setAttribute("aria-label", note ? `Edit your note on ${riotId(player)}` : `Add a note on ${riotId(player)}`);
    card.classList.toggle("bl-has-note", Boolean(note));

    // Editing or showing the note and date, under the name.
    let extra = card.querySelector(".bl-extra");
    let editor = card.querySelector(".bl-note-editor");
    if (editing === player.puuid) {
      extra?.remove();
      if (!editor) {
        editor = document.createElement("div");
        editor.className = "bl-note-editor";
        editor.innerHTML = '<input type="text" maxlength="200" placeholder="Why you blocked them" spellcheck="false" /><button class="bl-mini" type="button">Save</button>';
        const input = editor.querySelector("input");
        input.value = note || "";
        const save = () => {
          setNote(player.puuid, input.value);
          editing = "";
          requestDecorate();
        };
        input.addEventListener("keydown", (event) => {
          event.stopPropagation();
          if (event.key === "Enter") save();
          if (event.key === "Escape") {
            editing = "";
            requestDecorate();
          }
        });
        editor.querySelector("button").addEventListener("click", save);
        card.appendChild(editor);
        window.setTimeout(() => input.focus(), 0);
      }
    } else {
      editor?.remove();
      const html = extraHtml(player);
      if (html) {
        if (!extra) {
          extra = document.createElement("div");
          extra.className = "bl-extra";
          card.appendChild(extra);
        }
        if (extra.innerHTML !== html) extra.innerHTML = html;
      } else extra?.remove();
    }
    card.classList.toggle("bl-has-extra", Boolean(card.querySelector(".bl-extra, .bl-note-editor")));
  }

  // Asking before an unblock. Every card gets it, even one the plugin hasn't matched to a player
  // yet (right after a new block, before the list refreshes).
  function renderConfirm(card) {
    const confirm = card.querySelector(".bl-confirm");
    if (confirming === card) {
      if (!confirm) {
        const box = document.createElement("div");
        box.className = "bl-confirm";
        box.innerHTML = '<span>Unblock this player?</span><button class="bl-mini is-danger" type="button" data-bl-yes>Unblock</button><button class="bl-mini" type="button" data-bl-no>Keep</button>';
        card.appendChild(box);
      }
    } else confirm?.remove();
  }

  function matches(card, player) {
    if (settings.get("notesOnly") && !notes[player?.puuid]) return false;
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return true;
    const haystack = `${card.querySelector(".blocked-player-game-name-tagline")?.textContent || ""} ${player ? notes[player.puuid] || "" : ""}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  }

  function decorate() {
    decorateFrame = 0;
    const root = document.querySelector(ROOT);
    if (!root) {
      confirming = null;
      return;
    }
    injectStyle();
    const toolbar = ensureToolbar(root);
    const cards = [...root.querySelectorAll(`${LIST} > ${CARD}`)];
    const sort = settings.get("sort");
    const ordered = cards.map((card) => ({ card, player: playerFor(card) }));
    const label = (card) => (card.querySelector(".blocked-player-game-name-tagline")?.textContent || "").trim();
    if (sort === "name") ordered.sort((a, b) => label(a.card).localeCompare(label(b.card), undefined, { sensitivity: "base" }));
    if (sort === "recent") ordered.sort((a, b) => (seen[b.player?.puuid] || 0) - (seen[a.player?.puuid] || 0));
    let shown = 0;
    ordered.forEach(({ card, player }, index) => {
      // Sorting uses CSS order, so the client's own list stays as it built it.
      card.style.order = sort === "client" ? "" : String(index);
      if (player) decorateCard(card, player);
      renderConfirm(card);
      const visible = matches(card, player);
      card.classList.toggle("bl-hidden", !visible);
      if (visible) shown += 1;
    });
    const total = cards.length;
    // Text is only written when it changes: writing it adds a node, which would wake the watcher.
    const placeholder = `Search ${total} blocked players by name, tag or note`;
    const input = toolbar.querySelector("input");
    if (input.placeholder !== placeholder) input.placeholder = placeholder;
    const count = query || settings.get("notesOnly") ? `${shown} of ${total}` : `${total} blocked`;
    const countEl = toolbar.querySelector(".bl-count");
    if (countEl.textContent !== count) countEl.textContent = count;
    toolbar.querySelector(".bl-search").classList.toggle("has-text", Boolean(query));
    toolbar.classList.toggle("is-empty", total > 0 && shown === 0);
    toolbar.querySelectorAll("[data-bl-sort]").forEach((button) => button.setAttribute("aria-pressed", String(button.getAttribute("data-bl-sort") === sort)));
    toolbar.querySelector("[data-bl-notes]").setAttribute("aria-pressed", String(Boolean(settings.get("notesOnly"))));
  }

  function requestDecorate() {
    if (!decorateFrame) decorateFrame = requestAnimationFrame(decorate);
  }

  // Clicks on a card unblock in the client. This runs first (capture), so it can ask before that
  // happens and keep clicks on the note controls from reaching the card at all.
  function onClickCapture(event) {
    const card = event.target.closest?.(`${ROOT} ${CARD}`);
    if (!card) return;
    if (event.target.closest(".bl-note-button")) {
      event.stopPropagation();
      event.preventDefault();
      editing = editing === card.dataset.blPuuid ? "" : card.dataset.blPuuid;
      confirming = null;
      requestDecorate();
      return;
    }
    if (event.target.closest(".bl-note-editor")) {
      event.stopPropagation();
      return;
    }
    if (event.target.closest("[data-bl-no]")) {
      event.stopPropagation();
      confirming = null;
      requestDecorate();
      return;
    }
    if (event.target.closest("[data-bl-yes]")) {
      event.stopPropagation();
      confirming = null;
      requestDecorate();
      // Let the client do the unblock, as if the card had been clicked.
      bypassClick = true;
      card.querySelector(CARD_ACTION)?.click();
      bypassClick = false;
      window.setTimeout(refreshBlocked, 800);
      return;
    }
    if (bypassClick || !settings.get("confirmUnblock") || !event.target.closest(CARD_ACTION)) return;
    event.stopPropagation();
    event.preventDefault();
    confirming = card;
    editing = "";
    requestDecorate();
  }

  function watch() {
    if (observer) return;
    observer = new MutationObserver(() => {
      // Only work while the block list is open, and not for this plugin's own changes.
      if (document.querySelector(ROOT)) requestDecorate();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("click", onClickCapture, true);
  }

  // ---- Opening the block list ----

  function waitFor(find, timeout = 4000) {
    return new Promise((resolve) => {
      const start = Date.now();
      const check = () => {
        const found = find();
        if (found || Date.now() - start > timeout) resolve(found);
        else window.setTimeout(check, 100);
      };
      check();
    });
  }

  async function openBlockList() {
    if (!document.querySelector(ROOT)) {
      if (!document.querySelector(".lol-settings-container")) {
        document.querySelector(".app-controls-settings")?.click();
        await waitFor(() => document.querySelector(".lol-settings-container"));
      }
      const tab = [...document.querySelectorAll("lol-uikit-navigation-item.lol-settings-nav")].find((item) => /block list/i.test(item.textContent));
      tab?.click();
      await waitFor(() => document.querySelector(ROOT));
    }
    await refreshBlocked();
    decorate();
    const input = document.querySelector(`#${TOOLBAR_ID} input`);
    if (input) {
      input.focus();
      input.select();
    } else toast("info", "Couldn't open the block list. Open Settings → Block List in the client.");
  }

  // ---- Settings and commands ----

  function renderPage(container) {
    const noted = Object.keys(notes).filter((puuid) => blocked.some((player) => player.puuid === puuid)).length;
    const dated = blocked.filter((player) => seen[player.puuid]).length;
    container.innerHTML = `
      <p class="muted">${blocked.length} players blocked · ${noted} with notes · ${dated} blocked since Block List was installed.</p>
      <div class="field"><span class="copy"><strong>Open your block list</strong><small>Settings → Block List in the client, with the search box ready.</small></span><button class="action" type="button" data-bl-open>Open</button></div>`;
    container.querySelector("[data-bl-open]").addEventListener("click", () => {
      window.PluginSettings?.close?.();
      openBlockList();
    });
  }

  function defineSettings() {
    if (typeof window.PluginSettings?.define === "function") {
      return window.PluginSettings.define({
        id: pluginName,
        title: "Block List",
        description: "Search your block list, sort it, keep notes, and confirm before unblocking.",
        icon: `https://plugins/${pluginRoot}/assets/icon.svg`,
        storageKey: settingsKey,
        fields: [
          {
            key: "confirmUnblock",
            type: "toggle",
            label: "Ask before unblocking",
            description: "A click on a player in the block list asks first instead of unblocking straight away.",
            default: defaults.confirmUnblock,
          },
          { type: "note", text: "Notes and block dates are kept on this PC. The client keeps no dates, so players blocked before you installed Block List have none." },
        ],
        page: {
          render(container) {
            renderPage(container);
            refreshBlocked().then(() => container.isConnected && renderPage(container));
          },
        },
      });
    }
    const stored = window.DataStore?.get?.(settingsKey, {});
    const values = { ...defaults, ...(stored && typeof stored === "object" ? stored : {}) };
    return {
      get: (key) => (key ? values[key] : { ...values }),
      set: (key, value) => {
        values[key] = value;
        window.DataStore?.set?.(settingsKey, values);
      },
      onChange: () => () => {},
      open: () => openBlockList(),
    };
  }

  // The toolbar's sort and "With notes" are saved with the settings but aren't fields in the
  // settings window; this reads and writes them next to the fields.
  function wrapExtras(handle) {
    const extra = { sort: defaults.sort, notesOnly: defaults.notesOnly, ...readObject(`${settingsKey}.view`) };
    return {
      ...handle,
      get: (key) => (key === "sort" || key === "notesOnly" ? extra[key] : handle.get(key)),
      set: (key, value) => {
        if (key === "sort" || key === "notesOnly") {
          extra[key] = value;
          window.DataStore?.set?.(`${settingsKey}.view`, extra);
        } else handle.set?.(key, value);
      },
    };
  }

  function bindCommandBar() {
    if (commandBound || typeof window.CommandBar?.addAction !== "function") return;
    commandBound = true;
    window.CommandBar.addAction({
      name: "Search block list",
      legend: () => (blocked.length ? `${blocked.length} blocked` : ""),
      group: "friends",
      tags: ["block", "blocked", "unblock", "ignore", "search", "list"],
      perform: () => openBlockList(),
    });
  }

  exports.init = function init(context) {
    if (context?.meta?.name) pluginRoot = context.meta.name;
    settings = wrapExtras(defineSettings());
    const socket = context?.socket || window.socket;
    // Blocks made anywhere (a profile, the scoreboard, chat) show up here, so their date is kept.
    socket?.observe?.(blockedApi, () => window.setTimeout(refreshBlocked, 300));
  };

  exports.load = function load() {
    bindCommandBar();
    refreshBlocked();
    watch();
  };
})();
