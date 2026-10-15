/**
 * @description Track today's wins, losses, streak and LP change in a small card, with a summary after each game.
 * @author steel
 * @link https://github.com/steele123/maoloader
 */
(function () {
  const pluginName = "session-tracker";
  const hostId = "maoloader-session-tracker";
  const stylesheetId = "maoloader-session-tracker-styles";
  const settingsKey = "session-tracker.settings";
  const phaseApi = "/lol-gameflow/v1/gameflow-phase";
  const historyApi = "/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=29";
  const rankedApi = "/lol-ranked/v1/current-ranked-stats";
  // Games shorter than this are remakes and don't count.
  const remakeSeconds = 300;
  const queues = { RANKED_SOLO_5x5: "Solo/Duo", RANKED_FLEX_SR: "Flex" };
  const tiers = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND"];
  const divisions = { IV: 0, III: 1, II: 2, I: 3 };
  const defaults = {
    visible: true,
    position: null,
    autoDaily: true,
    rankedOnly: false,
    toastAfterGame: true,
    sessionStart: 0,
    startRanks: null,
    knownGameIds: [],
  };
  let pluginRoot = pluginName;
  let settings = loadSettings();
  let championNames = new Map();
  let summary;
  let refreshing = false;
  let commandBound = false;

  function loadSettings() {
    const stored = window.DataStore?.get?.(settingsKey, {});
    const merged = { ...defaults, ...(stored && typeof stored === "object" ? stored : {}) };
    merged.visible = Boolean(merged.visible);
    const position = merged.position;
    merged.position = position && Number.isFinite(position.x) && Number.isFinite(position.y) ? position : null;
    merged.autoDaily = Boolean(merged.autoDaily);
    merged.rankedOnly = Boolean(merged.rankedOnly);
    merged.toastAfterGame = Boolean(merged.toastAfterGame);
    merged.sessionStart = Number(merged.sessionStart) || 0;
    merged.startRanks = merged.startRanks && typeof merged.startRanks === "object" ? merged.startRanks : null;
    merged.knownGameIds = Array.isArray(merged.knownGameIds) ? merged.knownGameIds.slice(-60) : [];
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

  async function lcu(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`GET ${path} failed with ${response.status}`);
    return response.json();
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
    if (!settings.sessionStart || (settings.autoDaily && settings.sessionStart < todayStart())) {
      saveSettings({ sessionStart: settings.autoDaily ? todayStart() : Date.now(), startRanks: null });
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
    const counted = games.filter((game) => !game.remake && (!settings.rankedOnly || game.ranked));
    const wins = counted.filter((game) => game.win).length;
    let streak = 0;
    for (const game of counted) {
      if (counted[0].win !== game.win) break;
      streak += 1;
    }
    const lp = Object.keys(queues)
      .map((queue) => {
        const start = rankValue(settings.startRanks?.[queue]);
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
      if (!settings.startRanks && rankedStats) saveSettings({ startRanks: ranks });

      const games = (history?.games?.games || [])
        .map(gameResult)
        .filter((game) => game.at >= settings.sessionStart)
        .sort((a, b) => b.at - a.at);
      const previous = new Set(settings.knownGameIds);
      const fresh = games.filter((game) => !previous.has(game.id));
      saveSettings({ knownGameIds: [...previous, ...fresh.map((game) => game.id)].slice(-60) });
      summary = summarize(games, ranks);
      render();

      if (afterGame && settings.toastAfterGame && fresh.length) announce(fresh[0]);
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
    if (settings.position) {
      const x = Math.min(Math.max(0, settings.position.x), Math.max(0, window.innerWidth - 120));
      const y = Math.min(Math.max(0, settings.position.y), Math.max(0, window.innerHeight - 48));
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
        settings.position = { x: moveEvent.clientX - offsetX, y: moveEvent.clientY - offsetY };
        placeHost(element);
      };
      const end = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", end);
        handle.removeEventListener("pointercancel", end);
        saveSettings({ position: settings.position });
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", end);
      handle.addEventListener("pointercancel", end);
    });
    handle.addEventListener("dblclick", () => {
      saveSettings({ position: null });
      placeHost(element);
    });
  }

  function mount() {
    let element = host();
    if (element) return element;
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
    if (!settings.visible) {
      host()?.remove();
      return;
    }
    const root = mount().shadowRoot;
    root.querySelector("[data-title]").textContent = settings.autoDaily ? "Today" : "This session";
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

    body.innerHTML = total
      ? `
        <div class="record"><strong>${summary.wins}W ${summary.losses}L</strong><span>${rate}%</span>${streak}</div>
        <div class="dots" aria-label="Recent results, oldest first">${dots}</div>
        ${lp}`
      : `<p class="card-empty">No games yet${settings.rankedOnly ? " in ranked" : ""}.</p>${lp}`;
  }

  function setVisible(visible) {
    saveSettings({ visible });
    if (visible) {
      render();
      refresh();
    } else {
      host()?.remove();
      toast("info", "Session tracker hidden. Run Show session tracker from Ctrl+K to bring it back.", { duration: 3500 });
    }
  }

  function bindCommandBar() {
    if (commandBound || typeof window.CommandBar?.addAction !== "function") return;
    commandBound = true;
    window.CommandBar.addAction({
      name: () => (settings.visible ? "Hide session tracker" : "Show session tracker"),
      group: "session",
      tags: ["session", "lp", "wins", "losses", "tracker", "stats"],
      perform: () => setVisible(!settings.visible),
    });
    window.CommandBar.addAction({
      name: "Start a new session",
      group: "session",
      tags: ["session", "reset", "lp"],
      perform: () => {
        saveSettings({ sessionStart: Date.now(), startRanks: null, autoDaily: false });
        summary = undefined;
        refresh();
        toast("success", "New session started. Daily reset is off until you turn it back on.", { duration: 3500 });
      },
    });
    window.CommandBar.addAction({
      name: () => (settings.autoDaily ? "Session tracker: stop resetting daily" : "Session tracker: reset daily at midnight"),
      group: "session",
      tags: ["session", "daily", "reset"],
      perform: () => {
        saveSettings({ autoDaily: !settings.autoDaily });
        if (settings.autoDaily) saveSettings({ sessionStart: todayStart(), startRanks: null });
        refresh();
      },
    });
    window.CommandBar.addAction({
      name: () => (settings.rankedOnly ? "Session tracker: count all games" : "Session tracker: count ranked only"),
      group: "session",
      tags: ["session", "ranked"],
      perform: () => {
        saveSettings({ rankedOnly: !settings.rankedOnly });
        refresh();
      },
    });
  }

  exports.init = function init(context) {
    if (context?.meta?.name) pluginRoot = context.meta.name;
    const socket = context?.socket || window.socket;
    socket?.observe?.(phaseApi, (event) => {
      if (event?.data === "EndOfGame") window.setTimeout(() => refreshAfterGame(), 4000);
    });
  };

  exports.load = function load() {
    bindCommandBar();
    render();
    refresh();
  };
})();
