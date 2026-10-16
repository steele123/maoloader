/**
 * @description Toasts when chosen friends come online or finish a game, with a quick invite while you're in a lobby.
 * @author maoloader
 * @link https://github.com/steele123/maoloader
 */
(function () {
  const pluginName = "friend-alerts";
  const settingsKey = "friend-alerts.settings";
  const friendsApi = "/lol-chat/v1/friends";
  const phaseApi = "/lol-gameflow/v1/gameflow-phase";
  const pollMs = 15000;
  // More alerts than this in one check are merged into one toast.
  const maxSeparateToasts = 3;
  const defaults = { scope: "chosen", onOnline: true, onGameEnd: true };
  let pluginRoot = pluginName;
  let settings;
  // The chosen friends are saved in the same object as the settings, under "watched".
  let watched = [];
  let previous;
  let friends = [];
  let pollTimer = 0;
  let commandBound = false;
  // The friends list on this plugin's settings tab, while that tab is open.
  let page;

  // Settings live in maoloader's shared settings window (Ctrl+K → Plugin settings). On a runtime
  // older than 0.1.7 there is no such window; the plugin then keeps working with what's saved.
  function defineSettings() {
    if (typeof window.PluginSettings?.define === "function") {
      return window.PluginSettings.define({
        id: pluginName,
        title: "Friend Alerts",
        description: "Toasts when chosen friends come online or finish a game, with a quick invite while you're in a lobby.",
        icon: `https://plugins/${pluginRoot}/assets/icon.svg`,
        storageKey: settingsKey,
        fields: [
          {
            key: "scope",
            type: "choice",
            label: "Alert me about",
            description: "Only the friends you tick below, or everyone on your list.",
            options: [
              { value: "chosen", label: "Chosen friends" },
              { value: "all", label: "All friends" },
            ],
            default: defaults.scope,
          },
          { key: "onOnline", type: "toggle", label: "Comes online", description: "On the client, not the mobile app.", default: defaults.onOnline },
          { key: "onGameEnd", type: "toggle", label: "Finishes a game", default: defaults.onGameEnd },
          { type: "note", text: "Friends are checked every 15 seconds. While you're in a lobby, the toast has an Invite button." },
        ],
        page: { render: renderPage, destroy: destroyPage },
      });
    }
    const values = { ...defaults, ...readStored() };
    return {
      get: (key) => (key ? values[key] : { ...values }),
      set(key, value) {
        values[key] = value;
        window.DataStore?.set?.(settingsKey, { ...readStored(), ...values });
      },
      onChange: () => () => {},
      open: () => toast("info", "Update maoloader to 0.1.7 or newer to change plugin settings."),
    };
  }

  function readStored() {
    const stored = window.DataStore?.get?.(settingsKey, {});
    return stored && typeof stored === "object" ? stored : {};
  }

  function loadWatched() {
    const stored = readStored().watched;
    return Array.isArray(stored) ? stored.map(String) : [];
  }

  // Saves the chosen friends next to the settings, keeping the other saved values.
  function saveWatched() {
    const stored = readStored();
    if (JSON.stringify(stored.watched) === JSON.stringify(watched)) return;
    window.DataStore?.set?.(settingsKey, { ...stored, watched: [...watched] });
  }

  function toast(kind, message, options) {
    const api = window.Toast;
    const show = api?.[kind] || api?.info || api?.show;
    return typeof show === "function" ? show(message, options) : undefined;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function lcu(path, options) {
    const response = await fetch(path, options);
    if (!response.ok) throw new Error(`${options?.method || "GET"} ${path} failed with ${response.status}`);
    const text = await response.text();
    return text ? JSON.parse(text) : undefined;
  }

  function friendKey(friend) {
    return String(friend.puuid || friend.id || friend.name);
  }

  function friendName(friend) {
    return friend.gameName || friend.name || "A friend";
  }

  // On the client: mobile friends can chat but can't play, so they don't count as online here.
  function isOnline(friend) {
    return Boolean(friend.availability) && friend.availability !== "offline" && friend.availability !== "mobile";
  }

  function inGame(friend) {
    return friend.lol?.gameStatus === "inGame";
  }

  function isWatched(friend) {
    return settings.get("scope") === "all" || watched.includes(friendKey(friend));
  }

  async function invite(friend) {
    try {
      await lcu("/lol-lobby/v2/lobby/invitations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify([{ toSummonerId: friend.summonerId }]),
      });
      toast("success", `Invited ${friendName(friend)}.`, { duration: 2500 });
    } catch (error) {
      console.error("[friend-alerts]", error);
      toast("error", `Could not invite ${friendName(friend)}.`);
    }
  }

  async function announce(alerts) {
    if (!alerts.length) return;
    let inLobby = false;
    try {
      inLobby = (await lcu(phaseApi)) === "Lobby";
    } catch {
      inLobby = false;
    }

    if (alerts.length > maxSeparateToasts) {
      toast("info", {
        title: `${alerts.length} friends are around`,
        description: alerts.map((alert) => friendName(alert.friend)).join(", "),
        duration: 6000,
      });
      return;
    }
    for (const alert of alerts) {
      const canInvite = inLobby && alert.friend.summonerId;
      toast("info", {
        title: alert.kind === "online" ? `${friendName(alert.friend)} is online` : `${friendName(alert.friend)} finished a game`,
        description: alert.friend.statusMessage || (alert.kind === "online" ? "Just came online." : "They're out of game now."),
        duration: 6000,
        action: canInvite ? { label: "Invite", onClick: () => invite(alert.friend) } : undefined,
      });
    }
  }

  async function poll() {
    try {
      const list = await lcu(friendsApi);
      friends = Array.isArray(list) ? list : [];
    } catch {
      return;
    }

    const now = new Map(friends.map((friend) => [friendKey(friend), friend]));
    // The first check only records who is around, so loading the client doesn't flood you.
    if (previous) {
      const alerts = [];
      for (const [key, friend] of now) {
        const before = previous.get(key);
        if (!before || !isWatched(friend)) continue;
        if (settings.get("onOnline") && !isOnline(before) && isOnline(friend)) alerts.push({ kind: "online", friend });
        else if (settings.get("onGameEnd") && inGame(before) && !inGame(friend) && isOnline(friend)) alerts.push({ kind: "game", friend });
      }
      await announce(alerts);
    }
    previous = now;
    renderList();
  }

  function statusLabel(friend) {
    if (friend.availability === "mobile") return "Mobile";
    if (!isOnline(friend)) return "Offline";
    if (inGame(friend)) return "In game";
    return { chat: "Online", away: "Away", dnd: "Busy" }[friend.availability] || "Online";
  }

  // Only what the shared window doesn't already style: the friend rows and their checkboxes.
  const pageStyles = `
    .friend-search { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 11px 0 8px; }
    .friend-list { display: grid; gap: 2px; max-height: 300px; overflow: auto; }
    .friend-list.is-disabled { opacity: 0.5; }
    .friend-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 6px 8px; border-radius: 6px; cursor: pointer; }
    .friend-row:hover { background: rgba(200, 170, 110, 0.08); }
    .friend-row input { appearance: none; -webkit-appearance: none; width: 16px; height: 16px; margin: 0; border: 1px solid rgba(200, 170, 110, 0.45); border-radius: 4px; background: #06111c; cursor: pointer; }
    .friend-row input:checked { border-color: #c8aa6e; background: #c8aa6e url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M3.6 8.4l2.9 2.9 5.9-6.6' fill='none' stroke='%23061018' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center / 12px 12px no-repeat; }
    .friend-row input:focus-visible { outline: 2px solid #c8aa6e; outline-offset: 2px; }
    .friend-name { overflow: hidden; color: #f0e6d2; text-overflow: ellipsis; white-space: nowrap; }
    .friend-name small { margin-left: 4px; color: #8a949c; }
    .friend-status { color: #8a949c; font-size: 12px; }
    .friend-status.is-online { color: #5fbf8a; font-weight: 700; }
  `;

  function renderPage(container, ctx) {
    container.innerHTML = `
      <style>${pageStyles}</style>
      <p class="heading">Friends</p>
      <div class="friend-search">
        <span class="copy"><strong>Chosen friends</strong><small data-count></small></span>
        <input class="text" type="search" data-search placeholder="Search friends" aria-label="Search friends" spellcheck="false" />
      </div>
      <div class="friend-list" data-friends></div>`;
    const unsubscribe = ctx.settings.onChange((values, changed) => {
      if (changed.includes("scope")) renderList();
    });
    page = { container, unsubscribe };
    container.querySelector("[data-search]").addEventListener("input", renderList);
    container.querySelector("[data-friends]").addEventListener("change", (event) => {
      const key = event.target.getAttribute?.("data-friend");
      if (!key) return;
      watched = watched.filter((entry) => entry !== key);
      if (event.target.checked) watched.push(key);
      saveWatched();
      renderCount();
    });
    renderList();
  }

  function destroyPage() {
    page?.unsubscribe();
    page = undefined;
  }

  function renderCount() {
    const count = page?.container.querySelector("[data-count]");
    if (!count) return;
    count.textContent =
      settings.get("scope") === "all" ? `${watched.length} ticked. Alerts are on for all friends right now.` : `${watched.length} ticked`;
  }

  function renderList() {
    const container = page?.container;
    if (!container) return;
    const query = container.querySelector("[data-search]").value.trim().toLowerCase();
    const sorted = [...friends]
      .filter((friend) => !query || friendName(friend).toLowerCase().includes(query))
      .sort(
        (a, b) =>
          Number(watched.includes(friendKey(b))) - Number(watched.includes(friendKey(a))) ||
          Number(isOnline(b)) - Number(isOnline(a)) ||
          friendName(a).localeCompare(friendName(b)),
      );
    const list = container.querySelector("[data-friends]");
    list.innerHTML = sorted.length
      ? sorted
          .map(
            (friend) => `
              <label class="friend-row">
                <input type="checkbox" data-friend="${escapeHtml(friendKey(friend))}" ${watched.includes(friendKey(friend)) ? "checked" : ""} />
                <span class="friend-name">${escapeHtml(friendName(friend))}${friend.gameTag ? `<small>#${escapeHtml(friend.gameTag)}</small>` : ""}</span>
                <span class="friend-status ${isOnline(friend) ? "is-online" : ""}">${statusLabel(friend)}</span>
              </label>`,
          )
          .join("")
      : `<p class="muted">${friends.length ? "No friends match." : "Your friends list hasn't loaded yet."}</p>`;
    list.classList.toggle("is-disabled", settings.get("scope") === "all");
    renderCount();
  }

  function bindCommandBar() {
    if (commandBound || typeof window.CommandBar?.addAction !== "function") return;
    commandBound = true;
    window.CommandBar.addAction({
      name: "Friend alerts",
      group: "friends",
      tags: ["friends", "online", "alerts", "notifications", "duo", "settings"],
      perform: () => {
        settings.open();
        poll();
      },
    });
  }

  exports.init = function init(context) {
    if (context?.meta?.name) pluginRoot = context.meta.name;
    watched = loadWatched();
    settings = defineSettings();
    // The shared window saves only its own fields, from a copy read at start-up; put "watched" back after each save.
    settings.onChange(saveWatched);
  };

  exports.load = function load() {
    bindCommandBar();
    poll();
    if (!pollTimer) pollTimer = window.setInterval(poll, pollMs);
  };
})();
