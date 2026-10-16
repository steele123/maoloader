/**
 * @description Create any available queue's lobby from the command bar, start or stop queue, and play again or re-queue after games.
 * @author maoloader
 * @link https://github.com/steele123/maoloader
 */
(function () {
  const pluginName = "lobby-tools";
  const settingsKey = "lobby-tools.settings";
  const phaseApi = "/lol-gameflow/v1/gameflow-phase";
  const lobbyApi = "/lol-lobby/v2/lobby";
  const searchApi = "/lol-lobby/v2/lobby/matchmaking/search";
  const queuesApi = "/lol-game-queues/v1/queues";
  const defaults = { playAgainToast: true, autoRequeue: false, requeueDelaySeconds: 8 };
  let pluginRoot = pluginName;
  let settings;
  let queuesAdded = false;
  let requeueTimer = 0;
  let commandBound = false;

  // Settings live in maoloader's shared settings window (Ctrl+K → Plugin settings). On a runtime
  // older than 0.1.7 there is no such window; the plugin then keeps working with what's saved.
  function defineSettings() {
    if (typeof window.PluginSettings?.define === "function") {
      return window.PluginSettings.define({
        id: pluginName,
        title: "Lobby Tools",
        description: "Lobby and queue shortcuts in Ctrl+K, plus what happens after each game.",
        icon: `https://plugins/${pluginRoot}/assets/icon.svg`,
        storageKey: settingsKey,
        fields: [
          { type: "heading", label: "After each game" },
          {
            key: "playAgainToast",
            type: "toggle",
            label: "Play again button",
            description: "A toast after each game that takes you back to the lobby.",
            default: defaults.playAgainToast,
          },
          {
            key: "autoRequeue",
            type: "toggle",
            label: "Auto re-queue",
            description: "Goes back to the lobby and starts the same queue, after a delay you can cancel.",
            default: defaults.autoRequeue,
          },
          {
            key: "requeueDelaySeconds",
            type: "range",
            label: "Re-queue delay",
            description: "Time to cancel before it queues again.",
            min: 3,
            max: 30,
            step: 1,
            unit: "s",
            default: defaults.requeueDelaySeconds,
            showIf: (values) => values.autoRequeue,
          },
          { type: "note", text: "Lobbies, start and stop queue, and leave lobby are in Ctrl+K." },
        ],
      });
    }
    const stored = window.DataStore?.get?.(settingsKey, {});
    const values = { ...defaults, ...(stored && typeof stored === "object" ? stored : {}) };
    return {
      get: (key) => (key ? values[key] : { ...values }),
      set(key, value) {
        values[key] = value;
        window.DataStore?.set?.(settingsKey, values);
      },
      onChange: () => () => {},
      open: () => toast("info", "Update maoloader to 0.1.7 or newer to change plugin settings."),
    };
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
    if (settings.get("autoRequeue")) {
      cancelRequeue();
      const delaySeconds = settings.get("requeueDelaySeconds");
      const delay = delaySeconds * 1000;
      requeueTimer = window.setTimeout(() => {
        requeueTimer = 0;
        playAgain({ requeue: true });
      }, delay);
      toast("info", {
        title: "Re-queueing",
        description: `Back in queue in ${delaySeconds}s.`,
        duration: delay,
        action: { label: "Don't re-queue", onClick: cancelRequeue },
      });
    } else if (settings.get("playAgainToast")) {
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

  function bindCommandBar() {
    if (commandBound || typeof window.CommandBar?.addAction !== "function") return;
    commandBound = true;
    const actions = [
      { name: "Start queue", tags: ["queue", "find match", "search"], perform: () => startQueue() },
      { name: "Stop queue", tags: ["queue", "cancel", "search"], perform: stopQueue },
      { name: "Leave lobby", tags: ["lobby", "leave", "quit"], perform: leaveLobby },
      { name: "Play again", tags: ["post game", "lobby", "again"], perform: () => playAgain() },
      {
        name: () => (settings.get("autoRequeue") ? "Turn off auto re-queue" : "Turn on auto re-queue"),
        tags: ["queue", "requeue", "auto"],
        perform: () => {
          settings.set("autoRequeue", !settings.get("autoRequeue"));
          toast("info", settings.get("autoRequeue") ? "Auto re-queue is on." : "Auto re-queue is off.", { duration: 2500 });
        },
      },
      { name: "Lobby tools settings", tags: ["lobby", "settings", "play again"], perform: () => settings.open() },
    ];
    for (const action of actions) window.CommandBar.addAction({ group: "lobby", ...action });
  }

  exports.init = function init(context) {
    if (context?.meta?.name) pluginRoot = context.meta.name;
    const socket = context?.socket || window.socket;
    settings = defineSettings();
    // Turning auto re-queue off cancels a re-queue that's already counting down.
    settings.onChange((values) => {
      if (!values.autoRequeue) cancelRequeue();
      window.CommandBar?.update?.();
    });
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
