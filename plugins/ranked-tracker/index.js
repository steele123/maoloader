/**
 * @description Your LP history, which the client doesn't keep: a snapshot after every ranked game, an LP graph with tier lines, and how far you are from the Grandmaster and Challenger cutoffs.
 * @author maoloader
 * @link https://github.com/steele123/maoloader
 */
(function () {
  const pluginName = "ranked-tracker";
  const settingsKey = "ranked-tracker.settings";
  const historyKey = "ranked-tracker.history";
  const phaseApi = "/lol-gameflow/v1/gameflow-phase";
  const rankedApi = "/lol-ranked/v1/current-ranked-stats";
  const cutoffsUrl = "https://maoloader.com/api/cutoffs";
  const QUEUES = [
    { id: "RANKED_SOLO_5x5", label: "Solo/Duo" },
    { id: "RANKED_FLEX_SR", label: "Flex" },
  ];
  const TIERS = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND"];
  const APEX = ["MASTER", "GRANDMASTER", "CHALLENGER"];
  const DIVISIONS = ["IV", "III", "II", "I"];
  const APEX_BASE = TIERS.length * 400;
  const MAX_ENTRIES = 1500;
  const CLIENT_REGION_TO_PLATFORM = { NA: "NA1", EUW: "EUW1", EUNE: "EUN1", BR: "BR1", TR: "TR1", JP: "JP1", OCE: "OC1", LAN: "LA1", LAS: "LA2", KR: "KR", RU: "RU" };
  const DAY = 86400000;
  let pluginRoot = pluginName;
  let settings;
  let history = loadHistory();
  let cutoffs;
  let pageQueue = "RANKED_SOLO_5x5";
  let pageContainer;
  let commandBound = false;

  function toast(kind, message, options) {
    const api = window.Toast;
    const show = api?.[kind] || api?.info || api?.show;
    return typeof show === "function" ? show(message, options) : undefined;
  }

  async function lcu(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`GET ${path} failed with ${response.status}`);
    return response.json();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // ---- Ranks as numbers ----

  // One number per rank, so LP across divisions and tiers can be graphed and subtracted. Master and
  // up share one ladder of LP, so they sit on top of Diamond I's 100 LP.
  function rankValue(entry) {
    if (!entry?.tier) return undefined;
    if (APEX.includes(entry.tier)) return APEX_BASE + entry.lp;
    const tier = TIERS.indexOf(entry.tier);
    if (tier === -1) return undefined;
    return tier * 400 + Math.max(0, DIVISIONS.indexOf(entry.division)) * 100 + entry.lp;
  }

  function tierName(tier) {
    return tier.charAt(0) + tier.slice(1).toLowerCase();
  }

  function rankLabel(entry) {
    if (!entry) return "Unranked";
    return APEX.includes(entry.tier) ? `${tierName(entry.tier)} · ${entry.lp} LP` : `${tierName(entry.tier)} ${entry.division} · ${entry.lp} LP`;
  }

  function signed(value) {
    return value > 0 ? `+${value}` : String(value);
  }

  // ---- History ----

  function loadHistory() {
    const stored = window.DataStore?.get?.(historyKey, {});
    const result = {};
    for (const queue of QUEUES) {
      const list = Array.isArray(stored?.[queue.id]) ? stored[queue.id] : [];
      result[queue.id] = list.filter((entry) => entry && typeof entry.t === "number" && typeof entry.tier === "string");
    }
    return result;
  }

  function saveHistory() {
    window.DataStore?.set?.(historyKey, history);
  }

  function pickEntry(stats, queueId) {
    const entry = stats?.queueMap?.[queueId];
    if (!entry?.tier || entry.tier === "NONE" || entry.tier === "UNRANKED") return undefined;
    return {
      t: Date.now(),
      tier: entry.tier,
      division: entry.division || "",
      lp: Number(entry.leaguePoints) || 0,
      wins: Number(entry.wins) || 0,
      losses: Number(entry.losses) || 0,
    };
  }

  function sameRank(a, b) {
    return a && b && a.tier === b.tier && a.division === b.division && a.lp === b.lp && a.wins === b.wins && a.losses === b.losses;
  }

  // Adds a snapshot for each queue whose rank or record changed. Returns the queues that changed.
  function record(stats) {
    const changed = [];
    for (const queue of QUEUES) {
      const entry = pickEntry(stats, queue.id);
      const list = history[queue.id];
      if (!entry || sameRank(entry, list[list.length - 1])) continue;
      list.push(entry);
      if (list.length > MAX_ENTRIES) list.splice(0, list.length - MAX_ENTRIES);
      changed.push(queue.id);
    }
    if (changed.length) saveHistory();
    return changed;
  }

  async function snapshot() {
    try {
      return record(await lcu(rankedApi));
    } catch (error) {
      console.warn("[ranked-tracker] Couldn't read ranked stats.", error);
      return [];
    }
  }

  // LP updates a little after the game ends, so look again until it shows up.
  async function snapshotAfterGame(attempt = 0) {
    const changed = await snapshot();
    if (changed.length) {
      renderPage();
      if (settings.get("toastAfterGame")) announce(changed);
      return;
    }
    if (attempt < 6) window.setTimeout(() => snapshotAfterGame(attempt + 1), 10000);
  }

  function announce(changed) {
    for (const queueId of changed) {
      const list = history[queueId];
      const [before, after] = list.slice(-2);
      if (!before || !after) continue;
      const delta = rankValue(after) - rankValue(before);
      const label = QUEUES.find((queue) => queue.id === queueId).label;
      toast(delta >= 0 ? "success" : "info", {
        title: `${signed(delta)} LP · ${label}`,
        description: rankLabel(after),
        duration: 6000,
        action: { label: "Graph", onClick: () => settings.open({ tab: queueId }) },
      });
    }
  }

  // ---- Cutoffs ----

  async function loadCutoffs() {
    if (cutoffs && Date.now() - cutoffs.at < 15 * 60000) return cutoffs;
    try {
      let region = "NA1";
      try {
        const locale = await lcu("/riotclient/region-locale");
        const clientRegion = String(locale?.region || "").toUpperCase();
        region = CLIENT_REGION_TO_PLATFORM[clientRegion] || clientRegion || region;
      } catch {
        // NA by default.
      }
      const response = await fetch(`${cutoffsUrl}?region=${encodeURIComponent(region)}`);
      if (!response.ok) throw new Error(`Cutoffs request failed with ${response.status}`);
      const body = await response.json();
      const byQueue = {};
      for (const entry of Array.isArray(body?.leagueRankEntryInfos) ? body.leagueRankEntryInfos : []) {
        byQueue[entry.queueType] = { grandmaster: Number(entry.grandmasterCutoffLp) || 0, challenger: Number(entry.challengerCutoffLp) || 0 };
      }
      cutoffs = { at: Date.now(), region, byQueue };
    } catch (error) {
      console.warn("[ranked-tracker] Cutoffs unavailable.", error);
      cutoffs = { at: Date.now(), region: "", byQueue: {} };
    }
    return cutoffs;
  }

  // ---- Page ----

  function netSince(list, since) {
    const current = list[list.length - 1];
    const start = [...list].reverse().find((entry) => entry.t < since) || list.find((entry) => entry.t >= since);
    if (!current || !start) return undefined;
    return rankValue(current) - rankValue(start);
  }

  function graphSvg(list, apexCutoffs) {
    const points = list.slice(-120);
    const values = points.map(rankValue);
    const lines = [];
    let above = "";
    let low = Math.min(...values);
    let high = Math.max(...values);
    // Tier and division lines inside the range, and the apex cutoffs once you're in Master or above.
    for (let tier = 0; tier < TIERS.length; tier += 1) {
      for (let division = 0; division < 4; division += 1) {
        const value = tier * 400 + division * 100;
        lines.push({ value, label: `${tierName(TIERS[tier])} ${DIVISIONS[division]}`, kind: division === 0 ? "tier" : "division" });
      }
    }
    lines.push({ value: APEX_BASE, label: "Master", kind: "tier" });
    if (apexCutoffs && high >= APEX_BASE) {
      if (apexCutoffs.grandmaster) lines.push({ value: APEX_BASE + apexCutoffs.grandmaster, label: `Grandmaster ${apexCutoffs.grandmaster} LP`, kind: "cutoff" });
      if (apexCutoffs.challenger) lines.push({ value: APEX_BASE + apexCutoffs.challenger, label: `Challenger ${apexCutoffs.challenger} LP`, kind: "cutoff" });
      // Stretch up to the next cutoff only when it's close; a far one would flatten your line, so
      // it gets an arrow at the top edge instead.
      const nextCutoff = lines.filter((line) => line.kind === "cutoff" && line.value > high).sort((a, b) => a.value - b.value)[0];
      if (nextCutoff && nextCutoff.value - high <= Math.max(150, high - low)) high = nextCutoff.value;
      else if (nextCutoff) above = `${nextCutoff.label} ↑`;
    }
    const pad = Math.max(20, (high - low) * 0.12);
    low -= pad;
    high += pad;
    const width = 600;
    const height = 200;
    const x = (index) => (points.length === 1 ? width / 2 : 8 + (index / (points.length - 1)) * (width - 16));
    const y = (value) => height - 10 - ((value - low) / (high - low)) * (height - 20);
    const shownLines = lines.filter((line) => line.value > low && line.value < high);
    // Too many division lines crowd the graph; keep only tier lines and cutoffs then.
    const visible = shownLines.length > 8 ? shownLines.filter((line) => line.kind !== "division") : shownLines;
    const path = values.map((value, index) => `${index ? "L" : "M"}${x(index).toFixed(1)} ${y(value).toFixed(1)}`).join(" ");
    const area = `${path} L${x(values.length - 1).toFixed(1)} ${height} L${x(0).toFixed(1)} ${height} Z`;
    const last = values.length - 1;
    return `
      <svg class="rt-graph" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="LP over your last ${points.length} snapshots">
        <defs>
          <linearGradient id="rt-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="var(--rt-accent)" stop-opacity="0.32"/>
            <stop offset="1" stop-color="var(--rt-accent)" stop-opacity="0"/>
          </linearGradient>
        </defs>
        ${visible
          .map(
            (line) =>
              `<line class="rt-line is-${line.kind}" x1="0" x2="${width}" y1="${y(line.value).toFixed(1)}" y2="${y(line.value).toFixed(1)}" vector-effect="non-scaling-stroke"/>`,
          )
          .join("")}
        <path d="${area}" fill="url(#rt-fill)"/>
        <path d="${path}" class="rt-path" vector-effect="non-scaling-stroke"/>
        <circle cx="${x(last).toFixed(1)}" cy="${y(values[last]).toFixed(1)}" r="3.5" class="rt-dot"/>
      </svg>
      <div class="rt-labels">${visible
        .map((line) => `<span class="rt-label is-${line.kind}" style="top:${((y(line.value) / height) * 100).toFixed(2)}%">${escapeHtml(line.label)}</span>`)
        .join("")}${above ? `<span class="rt-label is-cutoff is-above">${escapeHtml(above)}</span>` : ""}</div>`;
  }

  const STYLES = `
    .rt { --rt-accent: #c8aa6e; display: grid; gap: 14px; }
    .rt-head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
    .rt-rank { font-size: 22px; font-weight: 800; color: #f0e6d2; }
    .rt-record { color: #a09b8c; font-weight: 700; }
    .rt-chips { display: flex; gap: 8px; flex-wrap: wrap; }
    .rt-chip { border: 1px solid rgba(200, 170, 110, 0.25); border-radius: 8px; padding: 7px 10px; display: grid; gap: 2px; min-width: 92px; background: rgba(1, 10, 19, 0.5); }
    .rt-chip span { color: #8c96a0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700; }
    .rt-chip strong { font-size: 15px; font-variant-numeric: tabular-nums; }
    .rt-up { color: #62c99a; } .rt-down { color: #f0857a; }
    .rt-graph-wrap { position: relative; border: 1px solid rgba(200, 170, 110, 0.18); border-radius: 10px; background: rgba(1, 10, 19, 0.55); padding: 10px 0; }
    .rt-graph { display: block; width: 100%; height: 200px; overflow: visible; }
    .rt-path { fill: none; stroke: var(--rt-accent); stroke-width: 2.2; stroke-linejoin: round; }
    .rt-dot { fill: var(--rt-accent); }
    .rt-line { stroke: rgba(200, 170, 110, 0.14); stroke-width: 1; }
    .rt-line.is-tier { stroke: rgba(200, 170, 110, 0.3); }
    .rt-line.is-cutoff { stroke: rgba(98, 201, 154, 0.55); stroke-dasharray: 5 4; }
    .rt-labels { position: absolute; inset: 10px 0; pointer-events: none; }
    .rt-label { position: absolute; right: 8px; transform: translateY(-110%); font-size: 10.5px; color: #8c96a0; font-weight: 700; }
    .rt-label.is-cutoff { color: #62c99a; }
    .rt-label.is-above { top: 0; transform: none; }
    .rt-goal { color: #a09b8c; }
    .rt-goal strong { color: #62c99a; }
    .rt-list { display: grid; gap: 2px; margin: 0; padding: 0; list-style: none; }
    .rt-list li { display: grid; grid-template-columns: 110px minmax(0, 1fr) auto; gap: 10px; padding: 5px 2px; border-bottom: 1px solid rgba(200, 170, 110, 0.08); font-variant-numeric: tabular-nums; }
    .rt-list time { color: #8c96a0; }
    .rt-empty { color: #a09b8c; }
  `;

  async function renderPage() {
    const container = pageContainer;
    if (!container?.isConnected) return;
    const list = history[pageQueue];
    const current = list[list.length - 1];
    const tabs = QUEUES.map(
      (queue) => `<button type="button" data-rt-queue="${queue.id}" aria-selected="${queue.id === pageQueue}">${queue.label}</button>`,
    ).join("");
    if (!current) {
      container.innerHTML = `<style>${STYLES}</style><div class="rt"><nav class="subtabs">${tabs}</nav><p class="rt-empty">No ${
        QUEUES.find((queue) => queue.id === pageQueue).label
      } rank yet. Play a ranked game and your history starts here.</p></div>`;
      bindTabs(container);
      return;
    }
    const all = await loadCutoffs();
    const apexCutoffs = all.byQueue[pageQueue];
    const now = Date.now();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const chip = (label, value) =>
      `<div class="rt-chip"><span>${label}</span><strong class="${value > 0 ? "rt-up" : value < 0 ? "rt-down" : ""}">${
        value === undefined ? "–" : `${signed(value)} LP`
      }</strong></div>`;
    const peak = list.reduce((best, entry) => (rankValue(entry) > rankValue(best) ? entry : best), list[0]);
    const total = current.wins + current.losses;
    let goal = "";
    if (APEX.includes(current.tier) && apexCutoffs) {
      const next = current.lp < apexCutoffs.grandmaster ? ["Grandmaster", apexCutoffs.grandmaster] : current.lp < apexCutoffs.challenger ? ["Challenger", apexCutoffs.challenger] : null;
      goal = next
        ? `<p class="rt-goal">${next[0]} cutoff in ${escapeHtml(all.region)} is ${next[1].toLocaleString()} LP: <strong>${(next[1] - current.lp).toLocaleString()} LP to go</strong>.</p>`
        : `<p class="rt-goal">You're above the Challenger cutoff (${apexCutoffs.challenger.toLocaleString()} LP) in ${escapeHtml(all.region)}.</p>`;
    }
    const recent = list
      .slice(-12)
      .map((entry, index, slice) => {
        const before = index ? slice[index - 1] : list[list.length - slice.length - 1];
        const delta = before ? rankValue(entry) - rankValue(before) : undefined;
        return { entry, delta };
      })
      .reverse()
      .map(
        ({ entry, delta }) => `
          <li>
            <time>${new Date(entry.t).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time>
            <span>${escapeHtml(rankLabel(entry))}</span>
            <strong class="${delta > 0 ? "rt-up" : delta < 0 ? "rt-down" : ""}">${delta === undefined ? "start" : `${signed(delta)} LP`}</strong>
          </li>`,
      )
      .join("");
    container.innerHTML = `
      <style>${STYLES}</style>
      <div class="rt">
        <nav class="subtabs">${tabs}</nav>
        <div class="rt-head">
          <span class="rt-rank">${escapeHtml(rankLabel(current))}</span>
          <span class="rt-record">${current.wins}W ${current.losses}L${total ? ` · ${Math.round((current.wins / total) * 100)}%` : ""}</span>
        </div>
        <div class="rt-chips">
          ${chip("Today", netSince(list, today.getTime()))}
          ${chip("7 days", netSince(list, now - 7 * DAY))}
          ${chip("30 days", netSince(list, now - 30 * DAY))}
          <div class="rt-chip"><span>Peak</span><strong>${escapeHtml(rankLabel(peak))}</strong></div>
        </div>
        ${goal}
        ${
          list.length > 1
            ? `<div class="rt-graph-wrap">${graphSvg(list, apexCutoffs)}</div>`
            : '<p class="rt-empty">Your graph starts after your next ranked game.</p>'
        }
        <ul class="rt-list">${recent}</ul>
        <p class="muted">Tracked since ${new Date(list[0].t).toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" })}. The client keeps no LP history, so games before you installed Ranked Tracker aren't here.</p>
      </div>`;
    bindTabs(container);
  }

  function bindTabs(container) {
    container.querySelectorAll("[data-rt-queue]").forEach((button) =>
      button.addEventListener("click", () => {
        pageQueue = button.getAttribute("data-rt-queue");
        renderPage();
      }),
    );
  }

  // ---- Settings and commands ----

  function defineSettings() {
    if (typeof window.PluginSettings?.define === "function") {
      return window.PluginSettings.define({
        id: pluginName,
        title: "Ranked Tracker",
        description: "Your LP history, saved after every ranked game.",
        icon: `https://plugins/${pluginRoot}/assets/icon.svg`,
        storageKey: settingsKey,
        fields: [
          {
            key: "toastAfterGame",
            type: "toggle",
            label: "LP change after each ranked game",
            description: "A toast with the LP you won or lost, and a button to the graph.",
            default: true,
          },
        ],
        page: {
          render(container, context) {
            pageContainer = container;
            if (QUEUES.some((queue) => queue.id === context?.tab)) pageQueue = context.tab;
            renderPage();
          },
          destroy() {
            pageContainer = undefined;
          },
        },
      });
    }
    return {
      get: (key) => (key === "toastAfterGame" ? true : undefined),
      onChange: () => () => {},
      open: () => toast("info", "Update maoloader to 0.1.7 or newer to see your LP graph."),
    };
  }

  function bindCommandBar() {
    if (commandBound || typeof window.CommandBar?.addAction !== "function") return;
    commandBound = true;
    window.CommandBar.addAction({ name: "Ranked tracker", legend: "LP graph", group: "ranked", tags: ["lp", "ranked", "graph", "history", "rank", "cutoff"], perform: () => settings.open() });
  }

  exports.init = function init(context) {
    if (context?.meta?.name) pluginRoot = context.meta.name;
    const socket = context?.socket || window.socket;
    settings = defineSettings();
    socket?.observe?.(phaseApi, (event) => {
      if (event?.data === "EndOfGame") window.setTimeout(() => snapshotAfterGame(), 5000);
    });
  };

  exports.load = function load() {
    bindCommandBar();
    // The first snapshot of each session; also catches games played without the plugin running.
    snapshot();
  };
})();
