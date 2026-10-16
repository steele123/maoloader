/**
 * @description Toasts when chosen friends come online or finish a game, with a quick invite while you're in a lobby.
 * @author maoloader developers
 * @link https://github.com/steele123/maoloader
 */
(function () {
  const pluginName = "friend-alerts";
  const hostId = "maoloader-friend-alerts";
  const stylesheetId = "maoloader-friend-alerts-styles";
  const settingsKey = "friend-alerts.settings";
  const friendsApi = "/lol-chat/v1/friends";
  const phaseApi = "/lol-gameflow/v1/gameflow-phase";
  const pollMs = 15000;
  // More alerts than this in one check are merged into one toast.
  const maxSeparateToasts = 3;
  const defaults = { scope: "chosen", watched: [], onOnline: true, onGameEnd: true };
  let pluginRoot = pluginName;
  let settings = loadSettings();
  let previous;
  let friends = [];
  let pollTimer = 0;
  let commandBound = false;

  function loadSettings() {
    const stored = window.DataStore?.get?.(settingsKey, {});
    const merged = { ...defaults, ...(stored && typeof stored === "object" ? stored : {}) };
    merged.scope = merged.scope === "all" ? "all" : "chosen";
    merged.watched = Array.isArray(merged.watched) ? merged.watched.map(String) : [];
    merged.onOnline = Boolean(merged.onOnline);
    merged.onGameEnd = Boolean(merged.onGameEnd);
    return merged;
  }

  function saveSettings(patch) {
    settings = { ...settings, ...patch };
    window.DataStore?.set?.(settingsKey, settings);
    window.CommandBar?.update?.();
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
    return settings.scope === "all" || settings.watched.includes(friendKey(friend));
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
        if (settings.onOnline && !isOnline(before) && isOnline(friend)) alerts.push({ kind: "online", friend });
        else if (settings.onGameEnd && inGame(before) && !inGame(friend) && isOnline(friend)) alerts.push({ kind: "game", friend });
      }
      await announce(alerts);
    }
    previous = now;
    renderList();
  }

  // Keep the surface hidden until its stylesheet applies, so it never flashes unstyled.
  function revealWhenStyled(element) {
    const link = element.shadowRoot.getElementById(stylesheetId);
    const show = () => {
      element.style.visibility = "";
      requestAnimationFrame(() => requestAnimationFrame(() => element.setAttribute("data-ready", "")));
    };
    if (!link || link.sheet) return show();
    element.style.visibility = "hidden";
    link.addEventListener("load", show, { once: true });
    link.addEventListener("error", show, { once: true });
  }

  function host() {
    return document.getElementById(hostId);
  }

  function closeSettings() {
    host()?.remove();
  }

  function statusLabel(friend) {
    if (friend.availability === "mobile") return "Mobile";
    if (!isOnline(friend)) return "Offline";
    if (inGame(friend)) return "In game";
    return { chat: "Online", away: "Away", dnd: "Busy" }[friend.availability] || "Online";
  }

  function renderList() {
    const root = host()?.shadowRoot;
    if (!root) return;
    const query = root.querySelector("[data-search]").value.trim().toLowerCase();
    const sorted = [...friends]
      .filter((friend) => !query || friendName(friend).toLowerCase().includes(query))
      .sort(
        (a, b) =>
          Number(settings.watched.includes(friendKey(b))) - Number(settings.watched.includes(friendKey(a))) ||
          Number(isOnline(b)) - Number(isOnline(a)) ||
          friendName(a).localeCompare(friendName(b)),
      );
    root.querySelector("[data-friends]").innerHTML = sorted.length
      ? sorted
          .map(
            (friend) => `
              <label class="friend-row">
                <input type="checkbox" data-friend="${escapeHtml(friendKey(friend))}" ${settings.watched.includes(friendKey(friend)) ? "checked" : ""} />
                <span class="friend-name">${escapeHtml(friendName(friend))}${friend.gameTag ? `<small>#${escapeHtml(friend.gameTag)}</small>` : ""}</span>
                <span class="friend-status ${isOnline(friend) ? "is-online" : ""}">${statusLabel(friend)}</span>
              </label>`,
          )
          .join("")
      : `<p class="field-note">${friends.length ? "No friends match." : "Your friends list hasn't loaded yet."}</p>`;
    root.querySelector("[data-friends]").classList.toggle("is-disabled", settings.scope === "all");
    root.querySelector("[data-count]").textContent = `${settings.watched.length} chosen`;
  }

  function openSettings() {
    let element = host();
    if (!element) {
      element = document.createElement("maoloader-friend-alerts");
      element.id = hostId;
      element.style.cssText = "position:fixed;inset:0;z-index:2147483646;display:flex;pointer-events:none;";
      element.attachShadow({ mode: "open" });
      document.body.appendChild(element);
    }

    const root = element.shadowRoot;
    root.innerHTML = `
      <link id="${stylesheetId}" rel="stylesheet" href="https://plugins/${pluginRoot}/styles.css" />
      <div class="sheet-backdrop">
        <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
          <header class="sheet-header">
            <img src="https://plugins/${pluginRoot}/assets/icon.svg" alt="" width="32" height="32" />
            <div class="sheet-title"><h1 id="sheet-title">Friend alerts</h1><span>Know when your duo is around</span></div>
            <button class="sheet-close" type="button" data-close aria-label="Close">×</button>
          </header>
          <div class="sheet-body">
            <div class="field is-stacked">
              <span class="field-copy"><strong>Alert me about</strong></span>
              <div class="segmented" role="radiogroup" aria-label="Which friends">
                <button type="button" role="radio" data-scope="chosen" aria-checked="${settings.scope === "chosen"}">Chosen friends</button>
                <button type="button" role="radio" data-scope="all" aria-checked="${settings.scope === "all"}">All friends</button>
              </div>
            </div>
            <label class="field">
              <span class="field-copy"><strong>Comes online</strong><small>On the client, not the mobile app.</small></span>
              <span class="switch"><input type="checkbox" data-toggle="onOnline" ${settings.onOnline ? "checked" : ""} /><span></span></span>
            </label>
            <label class="field">
              <span class="field-copy"><strong>Finishes a game</strong></span>
              <span class="switch"><input type="checkbox" data-toggle="onGameEnd" ${settings.onGameEnd ? "checked" : ""} /><span></span></span>
            </label>
            <div class="field is-stacked">
              <span class="field-copy"><strong>Friends</strong><small data-count></small></span>
              <input class="text-input" type="search" data-search placeholder="Search friends" />
              <div class="friend-list" data-friends></div>
            </div>
          </div>
          <footer class="sheet-footer"><span>Checks every 15 seconds</span><span>Invite appears while you're in a lobby</span></footer>
        </section>
      </div>`;

    revealWhenStyled(element);
    renderList();
    root.querySelector("[data-close]").addEventListener("click", closeSettings);
    const backdrop = root.querySelector(".sheet-backdrop");
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) closeSettings();
    });
    backdrop.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeSettings();
    });
    root.querySelectorAll("[data-scope]").forEach((button) => {
      button.addEventListener("click", () => {
        saveSettings({ scope: button.getAttribute("data-scope") });
        root.querySelectorAll("[data-scope]").forEach((other) => other.setAttribute("aria-checked", String(other === button)));
        renderList();
      });
    });
    root.querySelectorAll("[data-toggle]").forEach((input) => {
      input.addEventListener("change", () => saveSettings({ [input.getAttribute("data-toggle")]: input.checked }));
    });
    root.querySelector("[data-search]").addEventListener("input", renderList);
    root.querySelector("[data-friends]").addEventListener("change", (event) => {
      const key = event.target.getAttribute?.("data-friend");
      if (!key) return;
      const watched = settings.watched.filter((entry) => entry !== key);
      if (event.target.checked) watched.push(key);
      saveSettings({ watched });
      root.querySelector("[data-count]").textContent = `${settings.watched.length} chosen`;
    });
    root.querySelector("[data-search]").focus();
  }

  function bindCommandBar() {
    if (commandBound || typeof window.CommandBar?.addAction !== "function") return;
    commandBound = true;
    window.CommandBar.addAction({
      name: "Friend alerts",
      group: "friends",
      tags: ["friends", "online", "alerts", "notifications", "duo"],
      perform: () => {
        openSettings();
        poll();
      },
    });
  }

  exports.init = function init(context) {
    if (context?.meta?.name) pluginRoot = context.meta.name;
  };

  exports.load = function load() {
    bindCommandBar();
    poll();
    if (!pollTimer) pollTimer = window.setInterval(poll, pollMs);
  };
})();
