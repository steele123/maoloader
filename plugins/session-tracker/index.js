/**
 * @description Track today's wins, losses, streak and LP change in a small card, with a summary after each game and an optional tilt guard.
 * @author maoloader
 * @link https://github.com/steele123/maoloader
 */
(function () {
  const pluginName = "session-tracker";
  const hostId = "maoloader-session-tracker";
  const stylesheetId = "maoloader-session-tracker-styles";
  const settingsKey = "session-tracker.settings";
  const phaseApi = "/lol-gameflow/v1/gameflow-phase";
  const searchApi = "/lol-lobby/v2/lobby/matchmaking/search";
  const historyApi = "/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=29";
  const rankedApi = "/lol-ranked/v1/current-ranked-stats";
  // Games shorter than this are remakes and don't count.
  const remakeSeconds = 300;
  const queues = { RANKED_SOLO_5x5: "Solo/Duo", RANKED_FLEX_SR: "Flex" };
  const tiers = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND"];
  const divisions = { IV: 0, III: 1, II: 2, I: 3 };
  // Options the user changes in the settings window.
  const defaults = { visible: true, autoDaily: true, rankedOnly: false, toastAfterGame: true, tiltGuard: false, tiltLosses: 3, tiltBreakMinutes: 10 };
  let pluginRoot = pluginName;
  let settings;
  // Tracker state, saved under the same key next to the options.
  let state = loadState();
  let championNames = new Map();
  let summary;
  let refreshing = false;
  let commandBound = false;
  let breakTimer = 0;

  function storedObject() {
    const stored = window.DataStore?.get?.(settingsKey, {});
    return stored && typeof stored === "object" ? stored : {};
  }

  function loadState() {
    const stored = storedObject();
    const position = stored.position;
    return {
      position: position && Number.isFinite(position.x) && Number.isFinite(position.y) ? position : null,
      sessionStart: Number(stored.sessionStart) || 0,
      startRanks: stored.startRanks && typeof stored.startRanks === "object" ? stored.startRanks : null,
      knownGameIds: Array.isArray(stored.knownGameIds) ? stored.knownGameIds.slice(-60) : [],
      // Tilt guard: when the current break ends, and the loss that started it (so it starts once per loss).
      breakUntil: Number(stored.breakUntil) || 0,
      breakGameId: stored.breakGameId ?? null,
    };
  }

  // Merges into what's stored, so the options next to the state stay as they are.
  function saveState(patch) {
    state = { ...state, ...patch };
    window.DataStore?.set?.(settingsKey, { ...storedObject(), ...state });
  }

  // Settings live in maoloader's shared settings window (Ctrl+K → Plugin settings). On a runtime
  // older than 0.1.7 there is no such window; the plugin then keeps working with what's saved.
  function defineSettings() {
    if (typeof window.PluginSettings?.define === "function") {
      return window.PluginSettings.define({
        id: pluginName,
        title: "Session Tracker",
        description: "A small card with today's wins, losses, streak and LP change, and a summary after each game.",
        icon: `https://plugins/${pluginRoot}/assets/icon.svg`,
        storageKey: settingsKey,
        fields: [
          { key: "visible", type: "toggle", label: "Show the card", description: "The tracker card in the client. Drag it by its header to move it.", default: defaults.visible },
          {
            key: "toastAfterGame",
            type: "toggle",
            label: "Summary after each game",
            description: "A toast with the result, your K/D/A and today's record.",
            default: defaults.toastAfterGame,
          },
          { type: "heading", label: "What counts" },
          {
            key: "autoDaily",
            type: "toggle",
            label: "Reset daily at midnight",
            description: "Counts games from midnight each day. Off keeps counting from when the session started.",
            default: defaults.autoDaily,
          },
          { key: "rankedOnly", type: "toggle", label: "Ranked games only", description: "Leaves out normals, ARAM and other queues.", default: defaults.rankedOnly },
          { type: "heading", label: "Tilt guard" },
          {
            key: "tiltGuard",
            type: "toggle",
            label: "Suggest a break after a losing streak",
            description: "Counts the same games as the card, so remakes never count.",
            default: defaults.tiltGuard,
          },
          {
            key: "tiltLosses",
            type: "range",
            label: "Losses in a row",
            min: 2,
            max: 6,
            step: 1,
            default: defaults.tiltLosses,
            showIf: (values) => values.tiltGuard,
          },
          {
            key: "tiltBreakMinutes",
            type: "range",
            label: "Lock Find Match for",
            description: "Any queue you start during the break is cancelled. 0 only suggests the break.",
            min: 0,
            max: 30,
            step: 1,
            unit: " min",
            default: defaults.tiltBreakMinutes,
            showIf: (values) => values.tiltGuard,
          },
          {
            type: "button",
            label: "Start a new session",
            description: "Counts from now instead of midnight, and turns off the daily reset.",
            buttonLabel: "Start now",
            action: () => startNewSession(),
          },
        ],
      });
    }
    const stored = storedObject();
    const values = { ...defaults };
    for (const key of Object.keys(defaults)) {
      if (typeof stored[key] === typeof defaults[key]) values[key] = stored[key];
    }
    const listeners = new Set();
    return {
      get: (key) => (key ? values[key] : { ...values }),
      set(key, value) {
        values[key] = value;
        window.DataStore?.set?.(settingsKey, { ...storedObject(), [key]: value });
        for (const listener of listeners) listener({ ...values }, [key]);
      },
      onChange(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      open: () => toast("info", "Update maoloader to 0.1.7 or newer to change plugin settings."),
    };
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

  async function lcu(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`GET ${path} failed with ${response.status}`);
    return response.json();
  }

  // ---- Tilt guard ----

  function onBreak() {
    return state.breakUntil > Date.now();
  }

  function clockTime(ms) {
    return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  function minutesLeft() {
    return Math.max(1, Math.ceil((state.breakUntil - Date.now()) / 60000));
  }

  // Redraws the card's break line each minute, and once more when the break ends.
  function scheduleBreakTick() {
    window.clearTimeout(breakTimer);
    if (!onBreak()) return;
    breakTimer = window.setTimeout(() => {
      render();
      window.CommandBar?.update?.();
      scheduleBreakTick();
    }, Math.min(60000, state.breakUntil - Date.now() + 50));
  }

  function endBreak({ quiet = false } = {}) {
    if (!onBreak()) return;
    saveState({ breakUntil: 0 });
    scheduleBreakTick();
    render();
    window.CommandBar?.update?.();
    if (!quiet) toast("info", "Break over. Find Match is unlocked.", { duration: 3000 });
  }

  // After each new game: a loss that makes the streak long enough starts a break, once per loss.
  function checkTilt(game) {
    if (!settings.get("tiltGuard") || !game || game.win || game.remake || state.breakGameId === game.id) return;
    if (!summary.games.some((counted) => counted.id === game.id)) return;
    if (summary.streakWin !== false || summary.streak < settings.get("tiltLosses")) return;
    const minutes = settings.get("tiltBreakMinutes");
    saveState({ breakGameId: game.id, breakUntil: minutes ? Date.now() + minutes * 60000 : 0 });
    scheduleBreakTick();
    render();
    window.CommandBar?.update?.();
    toast("warning", {
      title: `${summary.streak} losses in a row`,
      description: minutes
        ? `Take a breather. Find Match is locked until ${clockTime(state.breakUntil)}.`
        : "Good moment for a break: stretch, get some water, come back fresh.",
      duration: 12000,
      action: minutes ? { label: "Play anyway", onClick: () => endBreak() } : undefined,
    });
  }

  // During a break, a queue that starts is cancelled straight away.
  async function onPhase(phase) {
    if (phase === "EndOfGame") window.setTimeout(() => refreshAfterGame(), 4000);
    if (phase !== "Matchmaking" || !onBreak()) return;
    try {
      await fetch(searchApi, { method: "DELETE" });
    } catch (error) {
      console.warn("[session-tracker] Could not cancel the queue.", error);
    }
    toast("info", {
      title: "You're on a break",
      description: `Find Match unlocks at ${clockTime(state.breakUntil)} (${minutesLeft()} min).`,
      duration: 6000,
      action: { label: "End break", onClick: () => endBreak() },
    });
  }

  function todayStart() {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }

  // One number per rank so LP across divisions and tiers can be subtracted.
  function rankValue(entry) {
    if (!entry?.tier || entry.tier === "NONE" || entry.tier === "UNRANKED") return undefined;
    const lp = Number(entry.leaguePoints) || 0;
    const tierIndex = tiers.indexOf(entry.tier);
    if (tierIndex === -1) return tiers.length * 400 + lp;
    return tierIndex * 400 + (divisions[entry.division] ?? 0) * 100 + lp;
  }

  function rankLabel(entry) {
    if (!entry?.tier || entry.tier === "NONE" || entry.tier === "UNRANKED") return "Unranked";
    const tier = entry.tier.charAt(0) + entry.tier.slice(1).toLowerCase();
    const division = tiers.includes(entry.tier) ? ` ${entry.division}` : "";
    return `${tier}${division} · ${entry.leaguePoints} LP`;
  }

  function pickRanks(stats) {
    const map = stats?.queueMap || {};
    return Object.fromEntries(
      Object.keys(queues).map((queue) => [
        queue,
        map[queue] ? { tier: map[queue].tier, division: map[queue].division, leaguePoints: map[queue].leaguePoints } : null,
      ]),
    );
  }

  function ensureSessionStart() {
    const autoDaily = settings.get("autoDaily");
    if (!state.sessionStart || (autoDaily && state.sessionStart < todayStart())) {
      saveState({ sessionStart: autoDaily ? todayStart() : Date.now(), startRanks: null });
    }
  }

  function gameResult(game) {
    const participant = game.participants?.[0];
    const stats = participant?.stats || {};
    const seconds = Number(game.gameDuration) > 10000 ? Number(game.gameDuration) / 1000 : Number(game.gameDuration);
    return {
      id: game.gameId,
      at: Number(game.gameCreation) || 0,
      queueId: game.queueId,
      ranked: game.queueId === 420 || game.queueId === 440,
      remake: seconds > 0 && seconds < remakeSeconds,
      win: Boolean(stats.win),
      championId: participant?.championId || 0,
      kda: `${stats.kills ?? 0}/${stats.deaths ?? 0}/${stats.assists ?? 0}`,
    };
  }

  function summarize(games, ranks) {
    const rankedOnly = settings.get("rankedOnly");
    const counted = games.filter((game) => !game.remake && (!rankedOnly || game.ranked));
    const wins = counted.filter((game) => game.win).length;
    let streak = 0;
    for (const game of counted) {
      if (counted[0].win !== game.win) break;
      streak += 1;
    }
    const lp = Object.keys(queues)
      .map((queue) => {
        const start = rankValue(state.startRanks?.[queue]);
        const now = rankValue(ranks?.[queue]);
        return { queue, label: queues[queue], now: ranks?.[queue], delta: start !== undefined && now !== undefined ? now - start : undefined };
      })
      .filter((entry) => rankValue(entry.now) !== undefined);
    return { games: counted, wins, losses: counted.length - wins, streak, streakWin: counted[0]?.win, lp };
  }

  async function refresh({ afterGame = false } = {}) {
    if (refreshing) return;
    refreshing = true;
    try {
      ensureSessionStart();
      if (!championNames.size) {
        try {
          const champions = await lcu("/lol-game-data/assets/v1/champion-summary.json");
          championNames = new Map(champions.filter((champion) => champion.id > 0).map((champion) => [champion.id, champion.name]));
        } catch {
          // Names are cosmetic; results still show without them.
        }
      }
      const [history, rankedStats] = await Promise.all([lcu(historyApi), lcu(rankedApi).catch(() => undefined)]);
      const ranks = pickRanks(rankedStats);
      if (!state.startRanks && rankedStats) saveState({ startRanks: ranks });

      const games = (history?.games?.games || [])
        .map(gameResult)
        .filter((game) => game.at >= state.sessionStart)
        .sort((a, b) => b.at - a.at);
      const previous = new Set(state.knownGameIds);
      const fresh = games.filter((game) => !previous.has(game.id));
      saveState({ knownGameIds: [...previous, ...fresh.map((game) => game.id)].slice(-60) });
      summary = summarize(games, ranks);
      render();

      if (afterGame && settings.get("toastAfterGame") && fresh.length) announce(fresh[0]);
      if (afterGame && fresh.length) checkTilt(fresh[0]);
      return fresh.length;
    } catch (error) {
      console.warn("[session-tracker] Refresh failed.", error);
      return 0;
    } finally {
      refreshing = false;
    }
  }

  function lpText(entry) {
    if (entry.delta === undefined) return "";
    if (entry.delta === 0) return "±0";
    return `${entry.delta > 0 ? "+" : ""}${entry.delta} LP`;
  }

  function announce(game) {
    const lp = game.ranked ? summary.lp.find((entry) => entry.queue === (game.queueId === 420 ? "RANKED_SOLO_5x5" : "RANKED_FLEX_SR")) : undefined;
    const parts = [game.kda, `Today ${summary.wins}–${summary.losses}`];
    if (lp?.delta !== undefined) parts.push(`${lpText(lp)} today`);
    toast(game.win ? "success" : "info", {
      title: game.remake ? "Remake" : game.win ? `Victory with ${championNames.get(game.championId) || "your champion"}` : `Defeat with ${championNames.get(game.championId) || "your champion"}`,
      description: parts.join(" · "),
      duration: 6000,
    });
  }

  // Match history lags behind the end of the game, so look again until the new game shows up.
  async function refreshAfterGame(attempt = 0) {
    const found = await refresh({ afterGame: true });
    if (!found && attempt < 4) window.setTimeout(() => refreshAfterGame(attempt + 1), 8000);
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

  function placeHost(element) {
    if (state.position) {
      const x = Math.min(Math.max(0, state.position.x), Math.max(0, window.innerWidth - 120));
      const y = Math.min(Math.max(0, state.position.y), Math.max(0, window.innerHeight - 48));
      Object.assign(element.style, { left: `${x}px`, top: `${y}px`, right: "auto", bottom: "auto" });
    } else {
      Object.assign(element.style, { left: "16px", top: "auto", right: "auto", bottom: "16px" });
    }
  }

  function bindDrag(element, handle) {
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest("button")) return;
      const rect = element.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      const offsetY = event.clientY - rect.top;
      handle.setPointerCapture(event.pointerId);
      const move = (moveEvent) => {
        state.position = { x: moveEvent.clientX - offsetX, y: moveEvent.clientY - offsetY };
        placeHost(element);
      };
      const end = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", end);
        handle.removeEventListener("pointercancel", end);
        saveState({ position: state.position });
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", end);
      handle.addEventListener("pointercancel", end);
    });
    handle.addEventListener("dblclick", () => {
      saveState({ position: null });
      placeHost(element);
    });
  }

  function mount() {
    let element = host();
    if (element?.shadowRoot) return element;
    // While the client starts up it can replace the card with a copy, and copies lose their shadow
    // root (so the card shows nothing); build it again.
    element?.remove();
    element = document.createElement("maoloader-session-tracker");
    element.id = hostId;
    element.style.cssText = "position:fixed;z-index:2147483639;display:block;width:236px;";
    placeHost(element);
    const root = element.attachShadow({ mode: "open" });
    root.innerHTML = `
      <link id="${stylesheetId}" rel="stylesheet" href="https://plugins/${pluginRoot}/styles.css" />
      <section class="card" aria-label="Session tracker">
        <header class="card-header" data-handle title="Drag to move. Double-click to reset.">
          <span class="card-title" data-title>Today</span>
          <button class="card-icon" type="button" data-refresh aria-label="Refresh" title="Refresh">↻</button>
          <button class="card-icon" type="button" data-hide aria-label="Hide" title="Hide (Ctrl+K to show again)">×</button>
        </header>
        <div class="card-body" data-body></div>
      </section>`;
    revealWhenStyled(element);
    document.body.appendChild(element);
    bindDrag(element, root.querySelector("[data-handle]"));
    root.querySelector("[data-refresh]").addEventListener("click", () => refresh());
    root.querySelector("[data-hide]").addEventListener("click", () => setVisible(false));
    return element;
  }

  function render() {
    if (!settings.get("visible")) {
      host()?.remove();
      return;
    }
    const root = mount().shadowRoot;
    root.querySelector("[data-title]").textContent = settings.get("autoDaily") ? "Today" : "This session";
    const body = root.querySelector("[data-body]");
    if (!summary) {
      body.innerHTML = '<p class="card-empty">Loading…</p>';
      return;
    }
    const total = summary.wins + summary.losses;
    const rate = total ? Math.round((summary.wins / total) * 100) : 0;
    const streak = summary.streak > 1 ? `<span class="streak ${summary.streakWin ? "is-win" : "is-loss"}">${summary.streakWin ? "W" : "L"}${summary.streak}</span>` : "";
    const dots = summary.games
      .slice(0, 12)
      .reverse()
      .map(
        (game) =>
          `<span class="dot ${game.win ? "is-win" : "is-loss"}" title="${escapeHtml(
            `${game.win ? "Win" : "Loss"} · ${championNames.get(game.championId) || "Unknown"} · ${game.kda}`,
          )}"></span>`,
      )
      .join("");
    const lp = summary.lp
      .map(
        (entry) => `
          <div class="lp-row">
            <span>${entry.label}</span>
            <span class="lp-rank">${escapeHtml(rankLabel(entry.now))}</span>
            <span class="lp-delta ${entry.delta > 0 ? "is-up" : entry.delta < 0 ? "is-down" : ""}">${lpText(entry)}</span>
          </div>`,
      )
      .join("");

    const pause = onBreak()
      ? `<div class="break-row"><span>On a break · ${minutesLeft()} min left</span><button type="button" data-end-break>End</button></div>`
      : "";
    body.innerHTML = total
      ? `
        ${pause}
        <div class="record"><strong>${summary.wins}W ${summary.losses}L</strong><span>${rate}%</span>${streak}</div>
        <div class="dots" aria-label="Recent results, oldest first">${dots}</div>
        ${lp}`
      : `${pause}<p class="card-empty">No games yet${settings.get("rankedOnly") ? " in ranked" : ""}.</p>${lp}`;
    body.querySelector("[data-end-break]")?.addEventListener("click", () => endBreak());
  }

  // The card itself is shown or removed in onSettingsChange.
  function setVisible(visible) {
    settings.set("visible", visible);
    if (!visible) toast("info", "Session tracker hidden. Run Show session tracker from Ctrl+K to bring it back.", { duration: 3500 });
  }

  function startNewSession() {
    saveState({ sessionStart: Date.now(), startRanks: null });
    summary = undefined;
    settings.set("autoDaily", false);
    refresh();
    toast("success", "New session started. Daily reset is off until you turn it back on.", { duration: 3500 });
  }

  function onSettingsChange(values, changed) {
    if (changed.includes("tiltGuard") && !values.tiltGuard) endBreak({ quiet: true });
    if (changed.includes("autoDaily") && values.autoDaily) saveState({ sessionStart: todayStart(), startRanks: null });
    if (changed.some((key) => key === "visible" || key === "autoDaily" || key === "rankedOnly")) {
      render();
      if (values.visible) refresh();
    }
    window.CommandBar?.update?.();
  }

  function bindCommandBar() {
    if (commandBound || typeof window.CommandBar?.addAction !== "function") return;
    commandBound = true;
    window.CommandBar.addAction({
      name: () => (settings.get("visible") ? "Hide session tracker" : "Show session tracker"),
      group: "session",
      tags: ["session", "lp", "wins", "losses", "tracker", "stats"],
      perform: () => setVisible(!settings.get("visible")),
    });
    window.CommandBar.addAction({
      name: "Start a new session",
      group: "session",
      tags: ["session", "reset", "lp"],
      perform: startNewSession,
    });
    window.CommandBar.addAction({
      name: () => (settings.get("autoDaily") ? "Session tracker: stop resetting daily" : "Session tracker: reset daily at midnight"),
      group: "session",
      tags: ["session", "daily", "reset"],
      perform: () => settings.set("autoDaily", !settings.get("autoDaily")),
    });
    window.CommandBar.addAction({
      name: () => (settings.get("rankedOnly") ? "Session tracker: count all games" : "Session tracker: count ranked only"),
      group: "session",
      tags: ["session", "ranked"],
      perform: () => settings.set("rankedOnly", !settings.get("rankedOnly")),
    });
    window.CommandBar.addAction({
      name: () => (settings.get("tiltGuard") ? "Turn off tilt guard" : "Turn on tilt guard"),
      group: "session",
      tags: ["tilt", "break", "losing streak", "session"],
      perform: () => {
        settings.set("tiltGuard", !settings.get("tiltGuard"));
        toast("info", settings.get("tiltGuard") ? "Tilt guard is on." : "Tilt guard is off.", { duration: 2500 });
      },
    });
    window.CommandBar.addAction({
      name: "End tilt break",
      group: "session",
      tags: ["tilt", "break", "unlock", "queue"],
      perform: () => (onBreak() ? endBreak() : toast("info", "You're not on a break.")),
    });
    window.CommandBar.addAction({
      name: "Session tracker settings",
      group: "session",
      tags: ["session", "tracker", "settings"],
      perform: () => settings.open(),
    });
  }

  exports.init = function init(context) {
    if (context?.meta?.name) pluginRoot = context.meta.name;
    const socket = context?.socket || window.socket;
    settings = defineSettings();
    settings.onChange(onSettingsChange);
    socket?.observe?.(phaseApi, (event) => onPhase(event?.data));
  };

  exports.load = function load() {
    bindCommandBar();
    render();
    refresh();
    scheduleBreakTick();
    // Check again once the client has finished starting, in case it replaced the card meanwhile.
    window.setTimeout(render, 8000);
  };
})();
