/**
 * @description Create any available queue's lobby from the command bar, start or stop queue, and play again or re-queue after games.
 * @author maoloader developers
 * @link https://github.com/steele123/maoloader
 */
(function () {
  const pluginName = "lobby-tools";
  const hostId = "maoloader-lobby-tools";
  const stylesheetId = "maoloader-lobby-tools-styles";
  const settingsKey = "lobby-tools.settings";
  const phaseApi = "/lol-gameflow/v1/gameflow-phase";
  const lobbyApi = "/lol-lobby/v2/lobby";
  const searchApi = "/lol-lobby/v2/lobby/matchmaking/search";
  const queuesApi = "/lol-game-queues/v1/queues";
  const defaults = { playAgainToast: true, autoRequeue: false, requeueDelaySeconds: 8 };
  let pluginRoot = pluginName;
  let settings = loadSettings();
  let queuesAdded = false;
  let requeueTimer = 0;
  let commandBound = false;

  function loadSettings() {
    const stored = window.DataStore?.get?.(settingsKey, {});
    const merged = { ...defaults, ...(stored && typeof stored === "object" ? stored : {}) };
    merged.playAgainToast = Boolean(merged.playAgainToast);
    merged.autoRequeue = Boolean(merged.autoRequeue);
    merged.requeueDelaySeconds = Math.min(30, Math.max(3, Number(merged.requeueDelaySeconds) || 8));
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

  async function lcu(path, options) {
    const response = await fetch(path, options);
    if (!response.ok) throw new Error(`${options?.method || "GET"} ${path} failed with ${response.status}`);
    const text = await response.text();
    return text ? JSON.parse(text) : undefined;
  }

  function post(path, body) {
    return lcu(path, body === undefined ? { method: "POST" } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  }

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  async function createLobby(queue) {
    try {
      await post(lobbyApi, { queueId: queue.id });
      toast("success", `Lobby: ${queue.label}`, { duration: 2000 });
    } catch (error) {
      console.error("[lobby-tools]", error);
      toast("error", `Could not create a ${queue.label} lobby.`);
    }
  }

  async function startQueue({ quiet = false } = {}) {
    // Right after play-again the lobby isn't ready for a moment, so retry briefly.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        await post(searchApi);
        if (!quiet) toast("success", "Queue started.", { duration: 2000 });
        return true;
      } catch (error) {
        if (attempt === 3) {
          console.error("[lobby-tools]", error);
          toast("error", "Could not start the queue. Check your lobby (roles, party).");
        } else {
          await sleep(1500);
        }
      }
    }
    return false;
  }

  async function stopQueue() {
    try {
      await lcu(searchApi, { method: "DELETE" });
      toast("info", "Queue stopped.", { duration: 2000 });
    } catch (error) {
      console.error("[lobby-tools]", error);
      toast("error", "You're not in queue.");
    }
  }

  async function leaveLobby() {
    try {
      await lcu(lobbyApi, { method: "DELETE" });
      toast("info", "Left the lobby.", { duration: 2000 });
    } catch (error) {
      console.error("[lobby-tools]", error);
      toast("error", "You're not in a lobby.");
    }
  }

  async function playAgain({ requeue = false } = {}) {
    try {
      await post("/lol-lobby/v2/play-again");
      if (requeue) await startQueue({ quiet: true });
      toast("success", requeue ? "Back in queue." : "Back in the lobby.", { duration: 2500 });
    } catch (error) {
      console.error("[lobby-tools]", error);
      toast("error", "Could not go back to the lobby.");
    }
  }

  function cancelRequeue() {
    window.clearTimeout(requeueTimer);
    requeueTimer = 0;
  }

  function onEndOfGame() {
    if (settings.autoRequeue) {
      cancelRequeue();
      const delay = settings.requeueDelaySeconds * 1000;
      requeueTimer = window.setTimeout(() => {
        requeueTimer = 0;
        playAgain({ requeue: true });
      }, delay);
      toast("info", {
        title: "Re-queueing",
        description: `Back in queue in ${settings.requeueDelaySeconds}s.`,
        duration: delay,
        action: { label: "Don't re-queue", onClick: cancelRequeue },
      });
    } else if (settings.playAgainToast) {
      toast("info", {
        title: "Game over",
        description: "Head back to the lobby?",
        duration: 15000,
        action: { label: "Play again", onClick: () => playAgain() },
      });
    }
  }

  function queueLabel(queue) {
    return String(queue.description || queue.name || queue.shortName || `Queue ${queue.id}`).trim();
  }

  // Queues change between patches and events, so the list comes from the client, not a fixed table.
  async function addQueueActions(attempt = 0) {
    if (queuesAdded || typeof window.CommandBar?.addAction !== "function") return;
    let queues;
    try {
      queues = await lcu(queuesApi);
    } catch {
      if (attempt < 12) window.setTimeout(() => addQueueActions(attempt + 1), 5000);
      return;
    }
    const seen = new Set();
    const available = (Array.isArray(queues) ? queues : [])
      .filter((queue) => queue.queueAvailability === "Available" && queue.category !== "Custom" && queue.id > 0)
      .map((queue) => ({ id: queue.id, label: queueLabel(queue), ranked: Boolean(queue.isRanked), category: queue.category }))
      .filter((queue) => !seen.has(queue.label) && seen.add(queue.label))
      .sort((a, b) => Number(b.ranked) - Number(a.ranked) || a.label.localeCompare(b.label));
    if (!available.length) {
      if (attempt < 12) window.setTimeout(() => addQueueActions(attempt + 1), 5000);
      return;
    }
    queuesAdded = true;
    for (const queue of available) {
      window.CommandBar.addAction({
        name: `Lobby: ${queue.label}`,
        legend: queue.category === "VersusAi" ? "vs AI" : queue.ranked ? "Ranked" : "",
        group: "lobby",
        tags: ["lobby", "queue", "create", String(queue.id)],
        perform: () => createLobby(queue),
      });
    }
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

  function openSettings() {
    let element = host();
    if (!element) {
      element = document.createElement("maoloader-lobby-tools");
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
            <div class="sheet-title"><h1 id="sheet-title">Lobby tools</h1><span>After-game options</span></div>
            <button class="sheet-close" type="button" data-close aria-label="Close">×</button>
          </header>
          <div class="sheet-body">
            <label class="field">
              <span class="field-copy"><strong>Play again button</strong><small>A toast after each game that takes you back to the lobby.</small></span>
              <span class="switch"><input type="checkbox" data-toggle="playAgainToast" ${settings.playAgainToast ? "checked" : ""} /><span></span></span>
            </label>
            <label class="field">
              <span class="field-copy"><strong>Auto re-queue</strong><small>Goes back to the lobby and starts the same queue, after a delay you can cancel.</small></span>
              <span class="switch"><input type="checkbox" data-toggle="autoRequeue" ${settings.autoRequeue ? "checked" : ""} /><span></span></span>
            </label>
            <div class="field">
              <span class="field-copy"><strong>Re-queue delay</strong></span>
              <span class="range-row">
                <input type="range" min="3" max="30" step="1" value="${settings.requeueDelaySeconds}" data-delay aria-label="Re-queue delay in seconds" />
                <span class="field-value" data-delay-value>${settings.requeueDelaySeconds}s</span>
              </span>
            </div>
          </div>
          <footer class="sheet-footer"><span>Lobbies, queue and leave are in <kbd>Ctrl</kbd> + <kbd>K</kbd></span><span>Saved automatically</span></footer>
        </section>
      </div>`;

    revealWhenStyled(element);
    root.querySelector("[data-close]").addEventListener("click", closeSettings);
    const backdrop = root.querySelector(".sheet-backdrop");
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) closeSettings();
    });
    backdrop.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeSettings();
    });
    root.querySelectorAll("[data-toggle]").forEach((input) => {
      input.addEventListener("change", () => {
        saveSettings({ [input.getAttribute("data-toggle")]: input.checked });
        if (!settings.autoRequeue) cancelRequeue();
      });
    });
    const delay = root.querySelector("[data-delay]");
    delay.addEventListener("input", () => {
      root.querySelector("[data-delay-value]").textContent = `${delay.value}s`;
    });
    delay.addEventListener("change", () => saveSettings({ requeueDelaySeconds: Number(delay.value) }));
    root.querySelector("[data-toggle]").focus();
  }

  function bindCommandBar() {
    if (commandBound || typeof window.CommandBar?.addAction !== "function") return;
    commandBound = true;
    const actions = [
      { name: "Start queue", tags: ["queue", "find match", "search"], perform: () => startQueue() },
      { name: "Stop queue", tags: ["queue", "cancel", "search"], perform: stopQueue },
      { name: "Leave lobby", tags: ["lobby", "leave", "quit"], perform: leaveLobby },
      { name: "Play again", tags: ["post game", "lobby", "again"], perform: () => playAgain() },
      {
        name: () => (settings.autoRequeue ? "Turn off auto re-queue" : "Turn on auto re-queue"),
        tags: ["queue", "requeue", "auto"],
        perform: () => {
          saveSettings({ autoRequeue: !settings.autoRequeue });
          if (!settings.autoRequeue) cancelRequeue();
          toast("info", settings.autoRequeue ? "Auto re-queue is on." : "Auto re-queue is off.", { duration: 2500 });
        },
      },
      { name: "Lobby tools settings", tags: ["lobby", "settings", "play again"], perform: openSettings },
    ];
    for (const action of actions) window.CommandBar.addAction({ group: "lobby", ...action });
  }

  exports.init = function init(context) {
    if (context?.meta?.name) pluginRoot = context.meta.name;
    const socket = context?.socket || window.socket;
    socket?.observe?.(phaseApi, (event) => {
      if (event?.data === "EndOfGame") onEndOfGame();
      else if (event?.data === "Lobby" || event?.data === "Matchmaking") cancelRequeue();
    });
  };

  exports.load = function load() {
    bindCommandBar();
    addQueueActions();
  };
})();
