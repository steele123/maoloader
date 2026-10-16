/**
 * @description One-click fixes for the League client's common stuck states: restart or refresh the client, reconnect to a game, skip stuck post-game stats, clear a stuck queue or failed launch, plus automatic recovery.
 * @author maoloader
 * @link https://github.com/steele123/maoloader
 */
(function () {
  const pluginName = "client-fixes";
  const settingsKey = "client-fixes.settings";
  const phaseApi = "/lol-gameflow/v1/gameflow-phase";
  const defaults = { reconnectPrompt: true, skipStuckStats: true, stuckStatsSeconds: 60, refreshAfterGame: false };
  let pluginRoot = pluginName;
  let settings;
  let phase = "";
  let statsTimer = 0;
  let cameFromGame = false;
  let commandBound = false;

  // Each fix is one request (or a reload), runs from Ctrl+K and from the settings tab, and says
  // what happened in a toast. None of them leave a champ select or decline anything, so none can
  // cost a dodge or leaver penalty.
  const FIXES = [
    {
      id: "restart",
      name: "Restart the client",
      button: "Restart",
      description: "Black or frozen screen, missing buttons, or a client that has slowed down. The client closes and reopens in a few seconds; you stay logged in and keep your lobby.",
      tags: ["restart", "black screen", "frozen", "stuck", "lag", "slow", "ux"],
      run: restartClient,
    },
    {
      id: "refresh",
      name: "Refresh the client view",
      button: "Refresh",
      description: "A lighter fix for a screen that won't update or a button that does nothing. Redraws the client without closing it.",
      tags: ["refresh", "reload", "stuck", "screen"],
      run: refreshView,
    },
    {
      id: "reconnect",
      name: "Reconnect to your game",
      button: "Reconnect",
      description: "Your game is still running but the client shows no Reconnect button, or it does nothing.",
      tags: ["reconnect", "game", "crash", "rejoin"],
      run: reconnect,
    },
    {
      id: "stats",
      name: "Skip stuck post-game stats",
      button: "Skip",
      description: "Stuck on \"Waiting for stats\" or a post-game screen that won't load after a game.",
      tags: ["post game", "stats", "end of game", "waiting", "stuck"],
      run: skipStats,
    },
    {
      id: "queue",
      name: "Clear a stuck queue",
      button: "Clear",
      description: "The client says you're in queue, or won't let you queue, when you aren't searching.",
      tags: ["queue", "matchmaking", "search", "stuck", "ghost"],
      run: clearQueue,
    },
    {
      id: "launch",
      name: "Clear a failed game launch",
      button: "Clear",
      description: "The game didn't start after champ select and the client is stuck waiting for it.",
      tags: ["launch", "failed", "game", "start", "stuck"],
      run: clearFailedLaunch,
    },
  ];

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

  function post(path) {
    return lcu(path, { method: "POST" });
  }

  async function currentPhase() {
    try {
      return (await lcu(phaseApi)) || "";
    } catch {
      return phase;
    }
  }

  // ---- Fixes ----

  async function restartClient() {
    toast("info", "Restarting the client…", { duration: 4000 });
    try {
      await post("/riotclient/kill-and-restart-ux");
    } catch (error) {
      // The request usually doesn't get an answer, because the page making it is closing.
      console.warn("[client-fixes]", error);
    }
  }

  function refreshView() {
    toast("info", "Refreshing the client…", { duration: 1500 });
    window.setTimeout(() => window.location.reload(), 300);
  }

  async function reconnect() {
    const now = await currentPhase();
    if (now !== "Reconnect" && now !== "InProgress") {
      toast("info", "You're not in a game right now.");
      return;
    }
    try {
      await post("/lol-gameflow/v1/reconnect");
      toast("success", "Reconnecting to your game…");
    } catch (error) {
      console.error("[client-fixes]", error);
      toast("error", "Couldn't reconnect. Try Restart the client, then reconnect.");
    }
  }

  // The client accepts these requests even when there's nothing to fix, so the phase decides what
  // to tell you.
  const POST_GAME_PHASES = ["WaitingForStats", "PreEndOfGame", "EndOfGame"];
  const QUEUE_PHASES = ["Matchmaking", "ReadyCheck"];
  const LAUNCH_PHASES = ["GameStart", "FailedToLaunch"];

  async function skipStats({ automatic = false } = {}) {
    if (!automatic && !POST_GAME_PHASES.includes(await currentPhase())) {
      toast("info", "You're not on a post-game screen.");
      return;
    }
    try {
      await post("/lol-end-of-game/v1/state/dismiss-stats");
      toast(
        "success",
        automatic ? { title: "Post-game stats were stuck", description: "They were skipped so you can play again." } : "Post-game stats skipped.",
        { duration: 5000 },
      );
    } catch (error) {
      console.error("[client-fixes]", error);
      if (!automatic) toast("error", "There were no post-game stats to skip.");
    }
  }

  async function clearQueue() {
    // A ghost queue is one the client shows while the game state says otherwise, so both searches are
    // reset whatever the phase. The lobby's search and matchmaking's search are separate records.
    const wasQueued = QUEUE_PHASES.includes(await currentPhase());
    await Promise.allSettled([
      lcu("/lol-lobby/v2/lobby/matchmaking/search", { method: "DELETE" }),
      lcu("/lol-matchmaking/v1/search", { method: "DELETE" }),
    ]);
    toast(
      "success",
      wasQueued
        ? "Queue stopped and reset."
        : { title: "Queue reset", description: "If the client still says you're in queue, try Restart the client." },
    );
  }

  async function clearFailedLaunch() {
    if (!LAUNCH_PHASES.includes(await currentPhase())) {
      toast("info", "No game is waiting to launch.");
      return;
    }
    try {
      await post("/lol-gameflow/v1/ack-failed-to-launch");
      toast("success", "Failed launch cleared.");
    } catch (error) {
      console.error("[client-fixes]", error);
      toast("info", "There was no failed launch to clear.");
    }
  }

  // ---- Automatic recovery ----

  function cancelStatsTimer() {
    window.clearTimeout(statsTimer);
    statsTimer = 0;
  }

  function onPhase(next) {
    const previous = phase;
    phase = next || "";
    if (phase === "InProgress" || phase === "EndOfGame" || phase === "WaitingForStats" || phase === "PreEndOfGame") cameFromGame = true;

    if (phase === "Reconnect" && previous !== "Reconnect" && settings.get("reconnectPrompt")) {
      toast("warning", {
        title: "Your game is still running",
        description: "Jump back in.",
        duration: 20000,
        action: { label: "Reconnect", onClick: reconnect },
      });
    }

    cancelStatsTimer();
    if (phase === "WaitingForStats" && settings.get("skipStuckStats")) {
      statsTimer = window.setTimeout(async () => {
        statsTimer = 0;
        if ((await currentPhase()) === "WaitingForStats") skipStats({ automatic: true });
      }, settings.get("stuckStatsSeconds") * 1000);
    }

    // The client builds up lag over long sessions; a refresh once you're back in the lobby or on
    // home after a game clears it, at a moment when nothing is lost.
    if (cameFromGame && (phase === "Lobby" || phase === "None") && settings.get("refreshAfterGame")) {
      cameFromGame = false;
      toast("info", "Refreshing the client after your game…", { duration: 1500 });
      window.setTimeout(() => window.location.reload(), 1200);
    } else if (phase === "Lobby" || phase === "None") {
      cameFromGame = false;
    }
  }

  // ---- Settings and commands ----

  // Settings live in maoloader's shared settings window (Ctrl+K → Plugin settings). On a runtime
  // older than 0.1.7 there is no such window; the fixes still run from Ctrl+K.
  function defineSettings() {
    if (typeof window.PluginSettings?.define === "function") {
      return window.PluginSettings.define({
        id: pluginName,
        title: "Client Fixes",
        description: "One-click fixes for the client's common stuck states, and recovery that runs on its own. None of them can cost you a dodge or leaver penalty.",
        icon: `https://plugins/${pluginRoot}/assets/icon.svg`,
        storageKey: settingsKey,
        fields: [
          { type: "heading", label: "Fix it now" },
          ...FIXES.map((fix) => ({ type: "button", label: fix.name, description: fix.description, buttonLabel: fix.button, action: () => fix.run() })),
          { type: "heading", label: "Automatic" },
          {
            key: "reconnectPrompt",
            type: "toggle",
            label: "Offer to reconnect",
            description: "A toast with a Reconnect button when the client notices your game is still running.",
            default: defaults.reconnectPrompt,
          },
          {
            key: "skipStuckStats",
            type: "toggle",
            label: "Skip stuck post-game stats",
            description: "When \"Waiting for stats\" doesn't finish, skips it so you can play again.",
            default: defaults.skipStuckStats,
          },
          {
            key: "stuckStatsSeconds",
            type: "range",
            label: "Wait before skipping",
            min: 30,
            max: 180,
            step: 10,
            unit: "s",
            default: defaults.stuckStatsSeconds,
            showIf: (values) => values.skipStuckStats,
          },
          {
            key: "refreshAfterGame",
            type: "toggle",
            label: "Refresh after each game",
            description: "Redraws the client once you're back in the lobby or on home, clearing the lag it builds up over long sessions.",
            default: defaults.refreshAfterGame,
          },
          { type: "note", text: "Every fix is also in Ctrl+K: type \"fix\" or the problem, like \"black screen\"." },
        ],
      });
    }
    const stored = window.DataStore?.get?.(settingsKey, {});
    const values = { ...defaults, ...(stored && typeof stored === "object" ? stored : {}) };
    return {
      get: (key) => (key ? values[key] : { ...values }),
      onChange: () => () => {},
      open: () => toast("info", "Update maoloader to 0.1.7 or newer to change plugin settings."),
    };
  }

  function bindCommandBar() {
    if (commandBound || typeof window.CommandBar?.addAction !== "function") return;
    commandBound = true;
    for (const fix of FIXES) {
      window.CommandBar.addAction({ name: `Fix: ${fix.name.toLowerCase()}`, group: "client fixes", tags: ["fix", "bug", ...fix.tags], perform: () => fix.run() });
    }
    window.CommandBar.addAction({ name: "Client fixes settings", group: "client fixes", tags: ["fix", "bug", "settings"], perform: () => settings.open() });
  }

  exports.init = function init(context) {
    if (context?.meta?.name) pluginRoot = context.meta.name;
    const socket = context?.socket || window.socket;
    settings = defineSettings();
    settings.onChange((values) => {
      if (!values.skipStuckStats) cancelStatsTimer();
    });
    socket?.observe?.(phaseApi, (event) => onPhase(event?.data));
  };

  exports.load = async function load() {
    bindCommandBar();
    // Catch a state the client was already in when it loaded, like a game waiting to reconnect.
    onPhase(await currentPhase());
  };
})();
