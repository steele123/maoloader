// Home: replace the client's home tab with a dashboard, or trim it down to the tabs you want.

import {
  registerSection,
  registerTab,
  getSettings,
  updateSettings,
  onSettingsChange,
  onDomChange,
  setRules,
  readOldSettings,
  pluginUrl,
  toast,
  escapeHtml,
  lcu,
  jsonRequest,
  revealWhenStyled,
  anchor,
  releaseAnchors,
  openSettings,
  gearIcon,
  switchField,
  rangeField,
  segmented,
  bindFormHelpers,
  showSections,
  navScreen,
  windowControls,
} from "./core.js";

const SECTION = "home";
const DASHBOARD_ID = "steeles-ui-home";
const DASHBOARD_STYLE_ID = "steeles-ui-home-styles";
const APP_SELECTOR = ".activity-center-application";
const TAB_SELECTOR = "#activity-center .activity-center__tab";
const TAB_LABEL_SELECTOR = ".activity-center__tab_label_display";
const HIDDEN_TAB_MARKER = "data-steeles-ui-hidden-tab";
const HOME_ART_SELECTORS = [".activity-center__background-component", ".activity-center__tab_content_image"];
const MODES = [
  { id: "custom", label: "Custom home" },
  { id: "trim", label: "Trim tabs" },
  { id: "off", label: "Off" },
];
// Every dashboard card, in default order. wide: full width by default. resizable: can switch
// between half and full width in Customize mode.
const WIDGETS = [
  { id: "greeting", label: "Greeting and clock", wide: true, resizable: false },
  { id: "play", label: "Quick play", wide: false, resizable: true },
  { id: "playing", label: "Friends playing", wide: false, resizable: true },
  { id: "friends", label: "Friends online", wide: false, resizable: true },
  { id: "matches", label: "Recent games", wide: true, resizable: true },
  { id: "rank", label: "Rank", wide: false, resizable: true },
  { id: "cutoffs", label: "Apex cutoffs", wide: false, resizable: true },
  { id: "notes", label: "Notes", wide: false, resizable: true },
  { id: "links", label: "Links", wide: false, resizable: true },
];
const GAME_STATUS_LABELS = {
  inGame: "In game",
  inQueue: "In queue",
  championSelect: "Champ select",
  hosting_Normal: "In lobby",
  hostingNormalGame: "In lobby",
  hostingRankedGame: "In lobby",
  hostingCoopVsAIGame: "In lobby",
};
// LadderEye's ladders, by Riot platform id.
const REGIONS = [
  { id: "NA1", label: "NA" },
  { id: "EUW1", label: "EUW" },
  { id: "KR", label: "KR" },
  { id: "EUN1", label: "EUNE" },
  { id: "BR1", label: "BR" },
  { id: "LA1", label: "LAN" },
  { id: "LA2", label: "LAS" },
  { id: "OC1", label: "OCE" },
  { id: "TR1", label: "TR" },
  { id: "JP1", label: "JP" },
  { id: "RU", label: "RU" },
  { id: "SG2", label: "SEA" },
  { id: "TW2", label: "TW" },
  { id: "VN2", label: "VN" },
];
// The client's region names, mapped to platform ids where they differ.
const CLIENT_REGION_TO_PLATFORM = { NA: "NA1", EUW: "EUW1", EUNE: "EUN1", BR: "BR1", TR: "TR1", JP: "JP1", OCE: "OC1", LAN: "LA1", LAS: "LA2" };
const CUTOFFS_URL = "https://maoloader.com/api/cutoffs";
const QUEUE_NAMES = {
  0: "Custom",
  400: "Draft",
  420: "Ranked Solo",
  430: "Blind",
  440: "Ranked Flex",
  450: "ARAM",
  480: "Swiftplay",
  490: "Quickplay",
  700: "Clash",
  830: "Co-op vs AI",
  840: "Co-op vs AI",
  850: "Co-op vs AI",
  870: "Co-op vs AI",
  880: "Co-op vs AI",
  890: "Co-op vs AI",
  900: "ARURF",
  1700: "Arena",
  1710: "Arena",
  1900: "URF",
};
const QUEUE_TYPE_NAMES = {
  RANKED_SOLO_5x5: "Ranked Solo",
  RANKED_FLEX_SR: "Ranked Flex",
  NORMAL: "Normal",
  DRAFT: "Draft",
  ARAM_UNRANKED_5x5: "ARAM",
  CHERRY: "Arena",
  BOT: "Co-op vs AI",
  URF: "URF",
};
// Friends doing something in League right now, most committed first.
const ACTIVITY_ORDER = ["inGame", "championSelect", "inQueue", "lobby"];
const ACTIVITY_LABELS = { inGame: "In game", championSelect: "Champ select", inQueue: "In queue", lobby: "In lobby" };
const REMAKE_SECONDS = 300;
const FRIENDS_REFRESH_MS = 20000;
const MATCHES_REFRESH_MS = 120000;
const CUTOFFS_REFRESH_MS = 300000;
const defaultLayout = () => ({
  order: WIDGETS.map((widget) => widget.id),
  wide: WIDGETS.filter((widget) => widget.wide).map((widget) => widget.id),
});
const DEFAULTS = {
  mode: "custom",
  widgets: Object.fromEntries(WIDGETS.map((widget) => [widget.id, true])),
  layout: defaultLayout(),
  cutoffRegion: "",
  name: "",
  cardOpacity: 70,
  queues: [],
  links: [{ label: "Patch notes", url: "https://www.leagueoflegends.com/en-us/news/tags/patch-notes/" }],
  notes: "",
  hiddenTabs: [],
  hideTabIcons: true,
  hideHomeArt: true,
};

const data = {
  summoner: undefined,
  queues: [],
  friends: [],
  ranked: undefined,
  champions: new Map(),
  matches: undefined,
  clientRegion: "",
  cutoffs: undefined,
  cutoffsError: "",
};
let seenTabs = [];
let clockTimer = 0;
let friendsTimer = 0;
let tickTimer = 0;
let matchesTimer = 0;
let cutoffsTimer = 0;
let notesTimer = 0;
let lastAutoSwitch = 0;
let customizing = false;

registerSection(SECTION, {
  defaults: DEFAULTS,
  migrate: () => readOldSettings("clean-home.settings"),
  normalize: (raw) => {
    const widgets = raw.widgets && typeof raw.widgets === "object" ? raw.widgets : {};
    return {
      mode: MODES.some((mode) => mode.id === raw.mode) ? raw.mode : "custom",
      // Cards added in a later version show by default, since old settings have no entry for them.
      widgets: Object.fromEntries(WIDGETS.map((widget) => [widget.id, widgets[widget.id] !== false])),
      layout: normalizeLayout(raw.layout),
      cutoffRegion: REGIONS.some((region) => region.id === raw.cutoffRegion) ? raw.cutoffRegion : "",
      name: String(raw.name || "").slice(0, 32),
      cardOpacity: Math.min(100, Math.max(0, Number(raw.cardOpacity) || 0)),
      queues: Array.isArray(raw.queues) ? raw.queues.map(Number).filter((id) => id > 0) : [],
      links: Array.isArray(raw.links)
        ? raw.links
            .filter((link) => link && /^https:\/\//i.test(String(link.url)))
            .map((link) => ({ label: String(link.label || link.url).slice(0, 40), url: String(link.url) }))
        : [],
      notes: String(raw.notes || "").slice(0, 2000),
      hiddenTabs: Array.isArray(raw.hiddenTabs) ? raw.hiddenTabs.map(String) : [],
      hideTabIcons: Boolean(raw.hideTabIcons),
      hideHomeArt: Boolean(raw.hideHomeArt),
    };
  },
});

function isWidget(id) {
  return WIDGETS.some((widget) => widget.id === id);
}

function normalizeLayout(raw) {
  const fallback = defaultLayout();
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.order)) return fallback;
  const order = [...new Set(raw.order.filter(isWidget))];
  // Cards added in a later version join at the end.
  for (const widget of WIDGETS) if (!order.includes(widget.id)) order.push(widget.id);
  const wide = Array.isArray(raw.wide) ? raw.wide.filter(isWidget) : fallback.wide;
  // Cards that can't be resized keep their fixed width.
  for (const widget of WIDGETS) {
    if (widget.resizable) continue;
    if (widget.wide && !wide.includes(widget.id)) wide.push(widget.id);
    if (!widget.wide && wide.includes(widget.id)) wide.splice(wide.indexOf(widget.id), 1);
  }
  return { order, wide };
}

function settings() {
  return getSettings(SECTION);
}

// ---- Hiding the client's home content ----

function applyRules() {
  const current = settings();
  const rules = [];
  if (current.mode === "custom") {
    // Only the client's own children are hidden, so its page keeps working underneath.
    rules.push(`${APP_SELECTOR} > :not(#${DASHBOARD_ID}) { display: none !important; }`);
    rules.push(`${APP_SELECTOR} { background: transparent !important; }`);
  } else if (current.mode === "trim") {
    rules.push(`[${HIDDEN_TAB_MARKER}] { display: none !important; }`);
    if (current.hideTabIcons) rules.push(".activity-center__tab_label_icon { display: none !important; }");
    if (current.hideHomeArt) rules.push(`${HOME_ART_SELECTORS.join(", ")} { display: none !important; }`);
  }
  setRules(SECTION, rules);
}

function tabLabel(tab) {
  return (tab.querySelector(TAB_LABEL_SELECTOR)?.textContent || "").trim();
}

function looksSelected(tab) {
  return Boolean(
    /selected|active/i.test(tab.className) ||
      tab.querySelector('[class*="--selected"], [class*="selected"], [aria-selected="true"], [aria-current="true"]'),
  );
}

function trimTabs() {
  const current = settings();
  const tabs = [...document.querySelectorAll(TAB_SELECTOR)];
  const hidden = new Set(current.hiddenTabs.map((label) => label.toLowerCase()));
  const labels = [];
  for (const tab of tabs) {
    const label = tabLabel(tab);
    if (label) labels.push(label);
    const hide = current.mode === "trim" && hidden.has(label.toLowerCase());
    if (hide && !tab.hasAttribute(HIDDEN_TAB_MARKER)) tab.setAttribute(HIDDEN_TAB_MARKER, "");
    if (!hide && tab.hasAttribute(HIDDEN_TAB_MARKER)) tab.removeAttribute(HIDDEN_TAB_MARKER);
  }
  if (labels.length) seenTabs = [...new Set([...labels, ...seenTabs])];

  // If the open tab is one you hid, open the first visible one instead (at most every few seconds).
  if (current.mode === "trim" && Date.now() - lastAutoSwitch > 3000) {
    const selectedHidden = tabs.find((tab) => tab.hasAttribute(HIDDEN_TAB_MARKER) && looksSelected(tab));
    const firstVisible = tabs.find((tab) => !tab.hasAttribute(HIDDEN_TAB_MARKER));
    if (selectedHidden && firstVisible) {
      lastAutoSwitch = Date.now();
      (firstVisible.querySelector("button") || firstVisible).click();
    }
  }
}

function syncDashboard() {
  const app = document.querySelector(APP_SELECTOR);
  let dashboard = document.getElementById(DASHBOARD_ID);
  if (settings().mode !== "custom" || !app) {
    if (settings().mode !== "custom") {
      dashboard?.remove();
      releaseAnchors("home");
    }
    return;
  }
  if (!dashboard || dashboard.parentNode !== app) {
    releaseAnchors("home", app);
    anchor(app, "home");
    dashboard?.remove();
    dashboard = createDashboard();
    app.appendChild(dashboard);
    renderDashboard();
    refreshData();
  }
  updateDashboardOffset(app);
}

// The home area can start underneath the top bar. The dashboard starts below the bar instead,
// so the two never overlap however the client layers them.
function updateDashboardOffset(app) {
  const dashboard = document.getElementById(DASHBOARD_ID);
  if (!dashboard) return;
  const appTop = app.getBoundingClientRect().top;
  let bottom = 0;
  if (getSettings("topBar")?.mode === "hidden") {
    // Only the window controls are left up there.
    bottom = Math.max(0, ...windowControls().map((element) => element.getBoundingClientRect().bottom));
  } else {
    bottom = navScreen()?.getBoundingClientRect().bottom || 0;
  }
  const top = `${Math.max(0, Math.round(bottom - appTop))}px`;
  if (dashboard.style.top !== top) dashboard.style.top = top;
}

function sync() {
  trimTabs();
  syncDashboard();
}

// ---- Data ----

async function refreshData() {
  const jobs = [];
  if (!data.summoner) jobs.push(lcu("/lol-summoner/v1/current-summoner").then((value) => (data.summoner = value)));
  if (!data.queues.length) {
    jobs.push(
      lcu("/lol-game-queues/v1/queues").then((queues) => {
        const seen = new Set();
        data.queues = (Array.isArray(queues) ? queues : [])
          .filter((queue) => queue.queueAvailability === "Available" && queue.category !== "Custom" && queue.id > 0)
          .map((queue) => ({ id: queue.id, label: String(queue.description || queue.name || `Queue ${queue.id}`).trim(), ranked: Boolean(queue.isRanked) }))
          .filter((queue) => !seen.has(queue.label) && seen.add(queue.label))
          .sort((a, b) => Number(b.ranked) - Number(a.ranked) || a.label.localeCompare(b.label));
      }),
    );
  }
  jobs.push(lcu("/lol-ranked/v1/current-ranked-stats").then((value) => (data.ranked = value)));
  jobs.push(refreshFriends({ render: false }));
  jobs.push(refreshMatches({ render: false }));
  jobs.push(refreshCutoffs({ render: false }));
  await Promise.allSettled(jobs);
  renderDashboard();
}

// One fetch feeds both friends cards.
async function refreshFriends({ render = true } = {}) {
  try {
    const friends = await lcu("/lol-chat/v1/friends");
    data.friends = Array.isArray(friends) ? friends : [];
  } catch {
    // Chat may still be connecting.
  }
  if (render) {
    renderWidget("friends");
    renderWidget("playing");
  }
}

async function loadChampions() {
  if (data.champions.size) return;
  try {
    const champions = await lcu("/lol-game-data/assets/v1/champion-summary.json");
    data.champions = new Map(champions.filter((champion) => champion.id > 0).map((champion) => [champion.id, champion.name]));
  } catch {
    // Games still show without names.
  }
}

async function refreshMatches({ render = true } = {}) {
  try {
    await loadChampions();
    const history = await lcu("/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=7");
    data.matches = (history?.games?.games || [])
      .map((game) => {
        const participant = game.participants?.[0] || {};
        const stats = participant.stats || {};
        const seconds = Number(game.gameDuration) > 10000 ? Math.round(Number(game.gameDuration) / 1000) : Number(game.gameDuration) || 0;
        return {
          id: game.gameId,
          championId: participant.championId || 0,
          win: Boolean(stats.win),
          remake: seconds > 0 && seconds < REMAKE_SECONDS,
          kills: stats.kills ?? 0,
          deaths: stats.deaths ?? 0,
          assists: stats.assists ?? 0,
          cs: (stats.totalMinionsKilled ?? 0) + (stats.neutralMinionsKilled ?? 0),
          queueId: game.queueId,
          mode: game.gameMode || "",
          seconds,
          createdAt: Number(game.gameCreation) || 0,
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    data.matches = data.matches || [];
  }
  if (render) renderWidget("matches");
}

async function cutoffRegion() {
  if (settings().cutoffRegion) return settings().cutoffRegion;
  if (!data.clientRegion) {
    try {
      const locale = await lcu("/riotclient/region-locale");
      const region = String(locale?.region || "").toUpperCase();
      data.clientRegion = CLIENT_REGION_TO_PLATFORM[region] || region;
    } catch {
      data.clientRegion = "";
    }
  }
  return REGIONS.some((region) => region.id === data.clientRegion) ? data.clientRegion : "NA1";
}

async function refreshCutoffs({ render = true } = {}) {
  const region = await cutoffRegion();
  try {
    const response = await fetch(`${CUTOFFS_URL}?region=${encodeURIComponent(region)}`);
    if (!response.ok) throw new Error(`Cutoffs request failed with ${response.status}`);
    const body = await response.json();
    const entries = Array.isArray(body?.leagueRankEntryInfos) ? body.leagueRankEntryInfos : [];
    const pick = (queueType) => {
      const entry = entries.find((item) => item.queueType === queueType);
      return entry && {
        challenger: Number(entry.challengerCutoffLp) || 0,
        grandmaster: Number(entry.grandmasterCutoffLp) || 0,
        highest: Number(entry.highestChallengerLp) || 0,
        masters: Number(entry.totalMasters) || 0,
        updated: entry.lastUpdated,
      };
    };
    const solo = pick("RANKED_SOLO_5x5");
    if (!solo) throw new Error("No Solo/Duo cutoffs in the response");
    data.cutoffs = { region, solo, flex: pick("RANKED_FLEX_SR") };
    data.cutoffsError = "";
  } catch (error) {
    console.warn("[steeles-ui] Cutoffs unavailable.", error);
    data.cutoffs = undefined;
    data.cutoffsError = "Cutoffs unavailable right now.";
  }
  if (render) renderWidget("cutoffs");
}

// ---- Dashboard ----

function createDashboard() {
  const element = document.createElement("steeles-ui-home");
  element.id = DASHBOARD_ID;
  // The dashboard scrolls inside its shadow root, where home.css can style the scrollbar.
  element.style.cssText = "position:absolute;inset:0;z-index:1;display:block;overflow:hidden;";
  const root = element.attachShadow({ mode: "open" });
  root.innerHTML = `
    <link id="${DASHBOARD_STYLE_ID}" rel="stylesheet" href="${pluginUrl("home.css")}" />
    <div class="home" data-home></div>`;
  revealWhenStyled(element, DASHBOARD_STYLE_ID);
  root.addEventListener("click", onDashboardClick);
  root.addEventListener("input", onDashboardInput);
  root.addEventListener("change", onDashboardChange);
  root.addEventListener("keydown", onDashboardKeydown);
  root.addEventListener("pointerdown", onDashboardPointerDown);
  // Champion icons that fail to load are hidden. Image errors don't bubble, so this listens on the way down.
  root.addEventListener(
    "error",
    (event) => {
      if (event.target?.tagName === "IMG") event.target.style.visibility = "hidden";
    },
    true,
  );
  return element;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 5) return "Up late";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

// Availability wins over game status: a friend on mobile still reports "outOfGame".
function friendStatus(friend) {
  if (friend.availability === "mobile") return "Mobile";
  const game = friend.lol?.gameStatus;
  if (game && game !== "outOfGame" && GAME_STATUS_LABELS[game]) return GAME_STATUS_LABELS[game];
  if (friend.availability === "away") return "Away";
  if (friend.availability === "dnd") return "Busy";
  return "Online";
}

function friendPresence(friend) {
  if (friend.availability === "mobile") return "mobile";
  if (friend.lol?.gameStatus === "inGame") return "game";
  return friend.availability;
}

function chosenQueues() {
  const chosen = settings().queues;
  if (chosen.length) return chosen.map((id) => data.queues.find((queue) => queue.id === id)).filter(Boolean);
  return data.queues.slice(0, 4);
}

function rankText(entry) {
  if (!entry?.tier || entry.tier === "NONE" || entry.tier === "UNRANKED") return "Unranked";
  const tier = entry.tier.charAt(0) + entry.tier.slice(1).toLowerCase();
  const division = ["MASTER", "GRANDMASTER", "CHALLENGER"].includes(entry.tier) ? "" : ` ${entry.division}`;
  return `${tier}${division} · ${entry.leaguePoints} LP`;
}

function titleCase(value) {
  return String(value)
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function queueName(queueId, mode) {
  return QUEUE_NAMES[queueId] ?? titleCase(mode || "Game");
}

function queueTypeName(queueType) {
  if (!queueType) return "";
  return QUEUE_TYPE_NAMES[queueType] ?? titleCase(queueType.replace(/_5x5$|_SR$/i, ""));
}

function friendActivity(friend) {
  const status = friend.lol?.gameStatus || "";
  if (status === "inGame" || status === "championSelect" || status === "inQueue") return status;
  if (status.startsWith("hosting")) return "lobby";
  return "";
}

// Friends in a game, champ select, queue or lobby; most committed first, then longest going.
function playingFriends() {
  return data.friends
    .map((friend) => ({ friend, activity: friendActivity(friend), since: Number(friend.lol?.timeStamp) || 0 }))
    .filter((entry) => entry.activity)
    .sort((a, b) => ACTIVITY_ORDER.indexOf(a.activity) - ACTIVITY_ORDER.indexOf(b.activity) || (a.since || Infinity) - (b.since || Infinity));
}

// "4:05" for a running clock, "1h 12m" once it's long.
function elapsed(since, now = Date.now()) {
  if (!since) return "";
  const seconds = Math.max(0, Math.floor((now - since) / 1000));
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function timeAgo(time, now = Date.now()) {
  const at = typeof time === "string" ? Date.parse(time) : Number(time);
  if (!at) return "";
  const minutes = Math.max(0, Math.round((now - at) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function gameLength(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function lp(value) {
  return Number(value || 0).toLocaleString();
}

function isWide(id) {
  return settings().layout.wide.includes(id);
}

function playingHtml() {
  const playing = playingFriends();
  return `
    <section class="card" data-widget="playing">
      <header class="card-head"><h2>Friends playing</h2><span class="count">${playing.length}</span></header>
      ${
        playing.length
          ? `<ul class="activity-list">
              ${playing
                .map(
                  ({ friend, activity, since }) => `
                    <li>
                      <span class="activity-dot is-${activity}" aria-hidden="true"></span>
                      <span class="row-copy">
                        <strong>${escapeHtml(friend.gameName || friend.name || "Friend")}</strong>
                        <small>${ACTIVITY_LABELS[activity]}${friend.lol?.gameQueueType ? ` · ${escapeHtml(queueTypeName(friend.lol.gameQueueType))}` : ""}</small>
                      </span>
                      ${activity !== "lobby" && since ? `<span class="row-time" data-since="${since}">${elapsed(since)}</span>` : ""}
                    </li>`,
                )
                .join("")}
            </ul>`
          : `<p class="card-empty">Nobody's in a game or queue right now.</p>`
      }
    </section>`;
}

function matchesHtml() {
  const wide = isWide("matches");
  const shown = (data.matches || []).slice(0, wide ? 8 : 5);
  const counted = (data.matches || []).filter((game) => !game.remake);
  const wins = counted.filter((game) => game.win).length;
  return `
    <section class="card" data-widget="matches">
      <header class="card-head">
        <h2>Recent games</h2>
        ${counted.length ? `<span class="record"><b class="is-win">${wins}W</b> <b class="is-loss">${counted.length - wins}L</b></span>` : ""}
      </header>
      ${
        data.matches === undefined
          ? '<p class="card-empty">Loading games…</p>'
          : shown.length
            ? `<ul class="match-list${wide ? " is-wide" : ""}">
                ${shown
                  .map(
                    (game) => `
                      <li class="${game.remake ? "" : game.win ? "is-win" : "is-loss"}">
                        <img src="/lol-game-data/assets/v1/champion-icons/${game.championId}.png" alt="" loading="lazy" />
                        <span class="row-copy">
                          <strong>${escapeHtml(data.champions.get(game.championId) || "Unknown")}</strong>
                          <small>${escapeHtml(queueName(game.queueId, game.mode))} · ${gameLength(game.seconds)}</small>
                        </span>
                        <span class="match-kda">
                          <strong>${game.kills}/${game.deaths}/${game.assists}</strong>
                          <small>${game.remake ? "Remake" : `${game.cs} CS`}</small>
                        </span>
                        <span class="match-when">${timeAgo(game.createdAt)}</span>
                      </li>`,
                  )
                  .join("")}
              </ul>`
            : '<p class="card-empty">No recent games yet.</p>'
      }
    </section>`;
}

function cutoffsHtml() {
  const current = settings().cutoffRegion || data.cutoffs?.region || data.clientRegion || "NA1";
  const cutoffs = data.cutoffs;
  return `
    <section class="card" data-widget="cutoffs">
      <header class="card-head">
        <h2>Apex cutoffs</h2>
        <select class="region-select" data-region aria-label="Region">
          ${REGIONS.map((region) => `<option value="${region.id}" ${region.id === current ? "selected" : ""}>${region.label}</option>`).join("")}
        </select>
      </header>
      ${
        cutoffs?.solo
          ? `<div class="cutoff-grid">
              <div class="cutoff is-challenger"><span>Challenger</span><strong>${lp(cutoffs.solo.challenger)}<small>&nbsp;LP</small></strong></div>
              <div class="cutoff is-grandmaster"><span>Grandmaster</span><strong>${lp(cutoffs.solo.grandmaster)}<small>&nbsp;LP</small></strong></div>
            </div>
            <p class="cutoff-note">
              Solo/Duo · top ${lp(cutoffs.solo.highest)} LP · ${lp(cutoffs.solo.masters)} Master+
              ${cutoffs.flex ? `<br />Flex: Challenger ${lp(cutoffs.flex.challenger)} · GM ${lp(cutoffs.flex.grandmaster)}` : ""}
            </p>
            <footer class="card-foot"><span>${cutoffs.solo.updated ? `Updated ${timeAgo(cutoffs.solo.updated)}` : ""}</span><span>LadderEye</span></footer>`
          : `<p class="card-empty">${data.cutoffsError ? escapeHtml(data.cutoffsError) : "Loading cutoffs…"}</p>`
      }
    </section>`;
}

function widgetHtml(id) {
  const current = settings();
  if (id === "playing") return playingHtml();
  if (id === "matches") return matchesHtml();
  if (id === "cutoffs") return cutoffsHtml();
  if (id === "greeting") {
    const name = current.name || data.summoner?.gameName || data.summoner?.displayName || "Summoner";
    const icon = data.summoner?.profileIconId !== undefined ? `/lol-game-data/assets/v1/profile-icons/${data.summoner.profileIconId}.jpg` : "";
    const now = new Date();
    return `
      <section class="card greeting" data-widget="greeting">
        ${icon ? `<img class="avatar" src="${icon}" alt="" />` : ""}
        <div class="greeting-copy">
          <h1>${escapeHtml(greeting())}, ${escapeHtml(name)}</h1>
          <span>${data.summoner?.summonerLevel ? `Level ${data.summoner.summonerLevel}` : ""}</span>
        </div>
        <div class="clock">
          <strong>${now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</strong>
          <span>${now.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}</span>
        </div>
        <button class="customize" type="button" data-open-settings aria-label="Customize home" title="Customize home">${gearIcon}</button>
      </section>`;
  }
  if (id === "play") {
    const queues = chosenQueues();
    return `
      <section class="card" data-widget="play">
        <h2>Quick play</h2>
        <div class="play-grid">
          ${
            queues.length
              ? queues.map((queue) => `<button class="play-button" type="button" data-queue="${queue.id}">${escapeHtml(queue.label)}</button>`).join("")
              : '<p class="muted">Loading queues…</p>'
          }
        </div>
      </section>`;
  }
  if (id === "friends") {
    const byName = (a, b) => String(a.gameName || a.name).localeCompare(String(b.gameName || b.name));
    const around = data.friends.filter((friend) => friend.availability && friend.availability !== "offline");
    // Mobile friends can chat but not play, so they're listed after everyone on the client and not counted.
    const onClient = around.filter((friend) => friend.availability !== "mobile").sort(byName);
    const onMobile = around.filter((friend) => friend.availability === "mobile").sort(byName);
    return `
      <section class="card" data-widget="friends">
        <h2>Friends online <span class="count">${onClient.length}</span></h2>
        <ul class="friends">
          ${
            around.length
              ? [...onClient, ...onMobile]
                  .map(
                    (friend) => `
                      <li>
                        <span class="presence is-${escapeHtml(friendPresence(friend))}"></span>
                        <span class="friend-name">${escapeHtml(friend.gameName || friend.name || "Friend")}</span>
                        <span class="muted">${escapeHtml(friendStatus(friend))}</span>
                      </li>`,
                  )
                  .join("")
              : '<li class="muted">Nobody online right now.</li>'
          }
        </ul>
      </section>`;
  }
  if (id === "rank") {
    const map = data.ranked?.queueMap || {};
    const row = (label, entry) => `
      <div class="rank-row">
        <span class="muted">${label}</span>
        <strong>${escapeHtml(rankText(entry))}</strong>
        <span class="muted">${entry?.wins || entry?.losses ? `${entry.wins}W ${entry.losses}L` : ""}</span>
      </div>`;
    return `
      <section class="card" data-widget="rank">
        <h2>Rank</h2>
        ${row("Solo/Duo", map.RANKED_SOLO_5x5)}
        ${row("Flex", map.RANKED_FLEX_SR)}
      </section>`;
  }
  if (id === "notes") {
    return `
      <section class="card" data-widget="notes">
        <h2>Notes</h2>
        <textarea data-notes placeholder="Matchups to practise, builds to try…" spellcheck="false">${escapeHtml(current.notes)}</textarea>
      </section>`;
  }
  if (id === "links") {
    return `
      <section class="card" data-widget="links">
        <h2>Links</h2>
        <div class="links">
          ${
            current.links.length
              ? current.links.map((link, index) => `<button class="link-button" type="button" data-link="${index}">${escapeHtml(link.label)}</button>`).join("")
              : '<p class="muted">Add links in the Home settings.</p>'
          }
        </div>
      </section>`;
  }
  return "";
}

// Small line icons for the Customize tools.
const icon = (paths) =>
  `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
const ICONS = {
  grip: icon('<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>'),
  eye: icon('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: icon('<path d="M3 3l18 18"/><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.1 4.1M6.6 6.6C3.9 8.3 2 12 2 12s3.5 7 10 7a9.8 9.8 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
  half: icon('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/>'),
  full: icon('<rect x="3" y="6" width="18" height="12" rx="2"/>'),
  layout: icon('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="18" height="7" rx="1"/>'),
  reset: icon('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
  check: icon('<path d="M5 12l5 5L20 7"/>'),
};

function widgetLabel(id) {
  return WIDGETS.find((widget) => widget.id === id)?.label || id;
}

function cellHtml(id) {
  const current = settings();
  const widget = WIDGETS.find((entry) => entry.id === id);
  const hidden = !current.widgets[id];
  const wide = current.layout.wide.includes(id);
  const tools = customizing
    ? `<div class="card-tools">
        <button class="card-tool grip" type="button" data-grip="${id}" aria-label="Move ${widgetLabel(id)}" title="Drag to move, or use the arrow keys">${ICONS.grip}</button>
        <span class="card-tool-title">${widgetLabel(id)}</span>
        ${
          widget?.resizable
            ? `<button class="card-tool" type="button" data-toggle-wide="${id}" aria-label="${wide ? `Make ${widgetLabel(id)} half width` : `Make ${widgetLabel(id)} full width`}" title="${wide ? "Half width" : "Full width"}">${wide ? ICONS.half : ICONS.full}</button>`
            : ""
        }
        <button class="card-tool" type="button" data-toggle-hidden="${id}" aria-label="${hidden ? `Show ${widgetLabel(id)}` : `Hide ${widgetLabel(id)}`}" title="${hidden ? "Show" : "Hide"}">${hidden ? ICONS.eye : ICONS.eyeOff}</button>
      </div>`
    : "";
  return `
    <div class="home-cell${wide ? " is-wide" : ""}${hidden ? " is-hidden" : ""}" data-card="${id}">
      ${tools}
      <div class="card-body"${customizing ? " inert" : ""}>${widgetHtml(id)}</div>
    </div>`;
}

function renderDashboard() {
  const home = document.getElementById(DASHBOARD_ID)?.shadowRoot?.querySelector("[data-home]");
  if (!home) return;
  const current = settings();
  home.style.setProperty("--card-alpha", String(current.cardOpacity / 100));
  // Customize mode shows every card, hidden ones dimmed, so they can be brought back.
  const ids = customizing ? current.layout.order : current.layout.order.filter((id) => current.widgets[id]);
  const scroll = home.scrollTop;
  home.innerHTML = `
    <div class="home-bar">
      ${
        customizing
          ? `<span class="muted">Drag cards by their handle, or use the arrow keys on it.</span>
            <span class="bar-tools">
              <button class="text-button" type="button" data-layout-reset>${ICONS.reset}Reset</button>
              <button class="text-button is-primary" type="button" data-customize-done>${ICONS.check}Done</button>
            </span>`
          : `<span></span>
            <span class="bar-tools">
              <button class="text-button" type="button" data-customize>${ICONS.layout}Customize</button>
              ${current.widgets.greeting ? "" : `<button class="text-button" type="button" data-open-settings>${gearIcon}Settings</button>`}
            </span>`
      }
    </div>
    <div class="grid${customizing ? " is-customizing" : ""}">${ids.map(cellHtml).join("")}</div>
    ${ids.length ? "" : '<p class="empty">Every card is hidden. Use Customize to bring some back.</p>'}`;
  home.scrollTop = scroll;
  startTimers();
}

function renderWidget(id) {
  const card = document.getElementById(DASHBOARD_ID)?.shadowRoot?.querySelector(`[data-widget="${id}"]`);
  if (!card) return;
  const next = document.createElement("template");
  next.innerHTML = widgetHtml(id).trim();
  card.replaceWith(next.content.firstElementChild);
}

function dashboardShown() {
  return Boolean(document.getElementById(DASHBOARD_ID));
}

function shows(id) {
  return dashboardShown() && settings().widgets[id];
}

// Each refresh only runs while the card it feeds is on screen.
function startTimers() {
  if (!clockTimer) {
    clockTimer = window.setInterval(() => {
      if (shows("greeting")) renderWidget("greeting");
    }, 15000);
  }
  if (!friendsTimer) {
    friendsTimer = window.setInterval(() => {
      if (shows("friends") || shows("playing")) refreshFriends();
    }, FRIENDS_REFRESH_MS);
  }
  if (!tickTimer) {
    // The "in game for 12:34" clocks; only their text changes.
    tickTimer = window.setInterval(() => {
      const root = document.getElementById(DASHBOARD_ID)?.shadowRoot;
      if (!root) return;
      const now = Date.now();
      root.querySelectorAll("[data-since]").forEach((element) => {
        element.textContent = elapsed(Number(element.getAttribute("data-since")), now);
      });
    }, 1000);
  }
  if (!matchesTimer) {
    matchesTimer = window.setInterval(() => {
      if (shows("matches")) refreshMatches();
    }, MATCHES_REFRESH_MS);
  }
  if (!cutoffsTimer) {
    cutoffsTimer = window.setInterval(() => {
      if (shows("cutoffs")) refreshCutoffs();
    }, CUTOFFS_REFRESH_MS);
  }
}

// ---- Customize mode ----

function saveLayout(patch, options) {
  updateSettings(SECTION, { layout: { ...settings().layout, ...patch } }, options);
}

// Puts `id` where `target` is, shifting the others along.
function movedOrder(order, id, target) {
  if (id === target) return order;
  const next = order.filter((entry) => entry !== id);
  const from = order.indexOf(id);
  const to = order.indexOf(target);
  next.splice(from < to ? next.indexOf(target) + 1 : next.indexOf(target), 0, id);
  return next;
}

// Moves the card elements to match the order, without re-rendering, so a drag keeps its handle.
function arrangeCells(order) {
  const grid = document.getElementById(DASHBOARD_ID)?.shadowRoot?.querySelector(".grid");
  if (!grid) return;
  for (const id of order) {
    const cell = grid.querySelector(`[data-card="${id}"]`);
    if (cell) grid.appendChild(cell);
  }
}

function startDrag(event, handle) {
  const id = handle.getAttribute("data-grip");
  const root = handle.getRootNode();
  const scroller = root.querySelector("[data-home]");
  const cell = handle.closest("[data-card]");
  let order = [...settings().layout.order];
  let pointer = { x: event.clientX, y: event.clientY };
  let frame = 0;
  // The scroll loop also checks this, so it stops even if a scheduled frame slips past the cancel.
  let active = true;
  event.preventDefault();
  cell.classList.add("is-dragging");
  try {
    handle.setPointerCapture(event.pointerId);
  } catch {
    // Capture only keeps moves flowing outside the handle; dragging works without it.
  }

  const reorder = () => {
    const over = root
      .elementsFromPoint(pointer.x, pointer.y)
      .map((element) => element.closest?.("[data-card]"))
      .find((element) => element && element.getAttribute("data-card") !== id);
    const target = over?.getAttribute("data-card");
    if (!target) return;
    const next = movedOrder(order, id, target);
    if (next.join() === order.join()) return;
    order = next;
    arrangeCells(order);
  };
  // Holding a card near the top or bottom edge scrolls, so cards off screen can be reached.
  const autoScroll = () => {
    if (!active) return;
    const bounds = scroller.getBoundingClientRect();
    const edge = 56;
    const step =
      pointer.y > bounds.bottom - edge
        ? Math.ceil((pointer.y - (bounds.bottom - edge)) / 4)
        : pointer.y < bounds.top + edge
          ? -Math.ceil((bounds.top + edge - pointer.y) / 4)
          : 0;
    if (step) {
      scroller.scrollTop += step;
      reorder();
    }
    frame = requestAnimationFrame(autoScroll);
  };
  frame = requestAnimationFrame(autoScroll);

  const move = (moveEvent) => {
    pointer = { x: moveEvent.clientX, y: moveEvent.clientY };
    reorder();
  };
  const end = () => {
    active = false;
    cancelAnimationFrame(frame);
    cell.classList.remove("is-dragging");
    handle.removeEventListener("pointermove", move);
    handle.removeEventListener("pointerup", end);
    handle.removeEventListener("pointercancel", end);
    // Saved once, when the card is let go.
    if (order.join() !== settings().layout.order.join()) saveLayout({ order }, { quiet: true });
    handle.focus();
  };
  handle.addEventListener("pointermove", move);
  handle.addEventListener("pointerup", end);
  handle.addEventListener("pointercancel", end);
}

function onDashboardPointerDown(event) {
  const handle = event.target.closest?.("[data-grip]");
  if (handle && event.button === 0) startDrag(event, handle);
}

// Arrow keys on a card's handle move it one place.
function onDashboardKeydown(event) {
  const handle = event.target.closest?.("[data-grip]");
  if (!handle) return;
  const step = event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : 0;
  if (!step) return;
  event.preventDefault();
  const id = handle.getAttribute("data-grip");
  const order = settings().layout.order;
  const target = order[order.indexOf(id) + step];
  if (!target) return;
  const next = movedOrder(order, id, target);
  arrangeCells(next);
  saveLayout({ order: next }, { quiet: true });
  handle.focus();
}

function setCustomizing(value) {
  customizing = value;
  renderDashboard();
  const root = document.getElementById(DASHBOARD_ID)?.shadowRoot;
  root?.querySelector(value ? "[data-customize-done]" : "[data-customize]")?.focus();
}

function resetLayout() {
  updateSettings(SECTION, {
    layout: defaultLayout(),
    widgets: Object.fromEntries(WIDGETS.map((widget) => [widget.id, true])),
  });
}

async function createLobby(queueId) {
  const queue = data.queues.find((entry) => entry.id === queueId);
  try {
    await lcu("/lol-lobby/v2/lobby", jsonRequest("POST", { queueId }));
    toast("success", `Lobby: ${queue?.label || queueId}`, { duration: 2000 });
  } catch (error) {
    console.error("[steeles-ui]", error);
    toast("error", queue ? `Could not create a ${queue.label} lobby.` : "Could not create that lobby.");
  }
}

function onDashboardClick(event) {
  const target = event.target;
  const queue = target.closest("[data-queue]");
  const link = target.closest("[data-link]");
  const hide = target.closest("[data-toggle-hidden]");
  const wide = target.closest("[data-toggle-wide]");
  if (queue) createLobby(Number(queue.getAttribute("data-queue")));
  else if (link) window.open(settings().links[Number(link.getAttribute("data-link"))]?.url, "_blank");
  else if (target.closest("[data-open-settings]")) openSettings("home");
  else if (target.closest("[data-customize]")) setCustomizing(true);
  else if (target.closest("[data-customize-done]")) setCustomizing(false);
  else if (target.closest("[data-layout-reset]")) resetLayout();
  else if (hide) {
    const id = hide.getAttribute("data-toggle-hidden");
    // The same switches as the Home settings tab, so the two always agree.
    updateSettings(SECTION, { widgets: { ...settings().widgets, [id]: !settings().widgets[id] } });
    document.getElementById(DASHBOARD_ID)?.shadowRoot?.querySelector(`[data-toggle-hidden="${id}"]`)?.focus();
  } else if (wide) {
    const id = wide.getAttribute("data-toggle-wide");
    const current = settings().layout.wide;
    saveLayout({ wide: current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id] });
    document.getElementById(DASHBOARD_ID)?.shadowRoot?.querySelector(`[data-toggle-wide="${id}"]`)?.focus();
  }
}

function onDashboardChange(event) {
  if (!event.target.matches?.("[data-region]")) return;
  updateSettings(SECTION, { cutoffRegion: event.target.value }, { quiet: true });
  data.cutoffs = undefined;
  data.cutoffsError = "";
  renderWidget("cutoffs");
  refreshCutoffs();
}

function onDashboardInput(event) {
  if (!event.target.matches("[data-notes]")) return;
  window.clearTimeout(notesTimer);
  const value = event.target.value;
  // Saved without re-rendering, so typing isn't interrupted.
  notesTimer = window.setTimeout(() => updateSettings(SECTION, { notes: value }, { quiet: true }), 400);
}

// ---- Settings tab ----

function linkRow(link, index) {
  return `
    <div class="link-row">
      <input class="text-input" type="text" data-hm-link-label value="${escapeHtml(link?.label || "")}" maxlength="40" placeholder="Name" aria-label="Link name" />
      <input class="text-input" type="url" data-hm-link-url value="${escapeHtml(link?.url || "")}" placeholder="https://" aria-label="Link address" />
      <button class="icon-button" type="button" data-hm-link-remove="${index}" aria-label="Remove link">×</button>
    </div>`;
}

function renderTab() {
  const current = settings();
  const tabs = [...new Set([...seenTabs, ...current.hiddenTabs])];
  return `
    <div class="field is-stacked">
      <span class="field-copy"><strong>Home tab</strong></span>
      ${segmented("data-hm-mode", MODES, current.mode, "Home mode")}
    </div>

    <div class="mode-section" data-hm-section="custom" ${current.mode === "custom" ? "" : "hidden"}>
      <div class="field is-stacked">
        <span class="field-copy"><strong>Cards</strong><small>Move and resize them with Customize on the dashboard itself.</small></span>
        <div class="check-grid">
          ${WIDGETS.map(
            (widget) => `<label class="check"><input type="checkbox" data-hm-widget="${widget.id}" ${current.widgets[widget.id] ? "checked" : ""} /> ${widget.label}</label>`,
          ).join("")}
        </div>
        <button class="button add-link" type="button" data-hm-reset-layout>Reset layout</button>
      </div>
      <div class="field">
        <span class="field-copy"><strong>Greeting name</strong><small>Leave blank to use your Riot ID.</small></span>
        <input class="text-input name-input" type="text" data-hm-name maxlength="32" value="${escapeHtml(current.name)}" placeholder="${escapeHtml(data.summoner?.gameName || "")}" />
      </div>
      ${rangeField("data-hm-opacity", current.cardOpacity, "Card darkness", "Lower lets your backdrop show through.", { step: 5, unit: "%" })}
      <div class="field is-stacked">
        <span class="field-copy"><strong>Quick play queues</strong><small>None ticked shows the first four available.</small></span>
        <div class="check-grid">
          ${
            data.queues.length
              ? data.queues
                  .map(
                    (queue) =>
                      `<label class="check"><input type="checkbox" data-hm-queue="${queue.id}" ${current.queues.includes(queue.id) ? "checked" : ""} /> ${escapeHtml(queue.label)}</label>`,
                  )
                  .join("")
              : '<p class="field-note">Queues haven\'t loaded yet.</p>'
          }
        </div>
      </div>
      <div class="field is-stacked">
        <span class="field-copy"><strong>Links</strong><small>https links open in your browser.</small></span>
        <div class="link-list" data-hm-links>${current.links.map(linkRow).join("")}</div>
        <button class="button add-link" type="button" data-hm-link-add>Add link</button>
      </div>
    </div>

    <div class="mode-section" data-hm-section="trim" ${current.mode === "trim" ? "" : "hidden"}>
      <div class="field is-stacked">
        <span class="field-copy"><strong>Hide these tabs</strong><small>Tabs appear here after you've opened the home tab once.</small></span>
        <div class="check-grid">
          ${
            tabs.length
              ? tabs
                  .map(
                    (label) =>
                      `<label class="check"><input type="checkbox" data-hm-tab="${escapeHtml(label)}" ${
                        current.hiddenTabs.some((hidden) => hidden.toLowerCase() === label.toLowerCase()) ? "checked" : ""
                      } /> ${escapeHtml(label)}</label>`,
                  )
                  .join("")
              : '<p class="field-note">Open the home tab, then come back here.</p>'
          }
        </div>
      </div>
      ${switchField("data-hm-hide-icons", current.hideTabIcons, "Hide tab icons")}
      ${switchField("data-hm-hide-art", current.hideHomeArt, "Hide promo art", "Background art and tab images.")}
    </div>

    <div class="mode-section" data-hm-section="off" ${current.mode === "off" ? "" : "hidden"}>
      <div class="field is-stacked"><p class="field-note">The home tab is left exactly as Riot ships it.</p></div>
    </div>`;
}

// Links are saved from whatever rows are in the editor; incomplete rows stay in the editor only.
function saveLinks(container) {
  const links = [];
  for (const row of container.querySelectorAll(".link-row")) {
    const label = row.querySelector("[data-hm-link-label]").value.trim();
    const urlInput = row.querySelector("[data-hm-link-url]");
    const url = urlInput.value.trim();
    const valid = /^https:\/\/\S+$/i.test(url);
    urlInput.classList.toggle("is-invalid", Boolean(url) && !valid);
    if (valid) links.push({ label: label || url.replace(/^https:\/\//i, "").split("/")[0], url });
  }
  updateSettings(SECTION, { links });
}

function bindTab(container) {
  bindFormHelpers(container);
  const save = (patch, options) => updateSettings(SECTION, patch, options);

  container.querySelectorAll("[data-hm-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.getAttribute("data-hm-mode");
      save({ mode });
      container.querySelectorAll("[data-hm-mode]").forEach((other) => other.setAttribute("aria-checked", String(other === button)));
      showSections(container, "data-hm-section", mode);
    });
  });

  container.addEventListener("change", (event) => {
    const target = event.target;
    const current = settings();
    if (target.matches("[data-hm-widget]")) {
      save({ widgets: { ...current.widgets, [target.getAttribute("data-hm-widget")]: target.checked } });
    } else if (target.matches("[data-hm-queue]")) {
      const id = Number(target.getAttribute("data-hm-queue"));
      const queues = current.queues.filter((queue) => queue !== id);
      if (target.checked) queues.push(id);
      save({ queues });
    } else if (target.matches("[data-hm-tab]")) {
      const label = target.getAttribute("data-hm-tab");
      const hiddenTabs = current.hiddenTabs.filter((hidden) => hidden.toLowerCase() !== label.toLowerCase());
      if (target.checked) hiddenTabs.push(label);
      save({ hiddenTabs });
    } else if (target.matches("[data-hm-hide-icons]")) {
      save({ hideTabIcons: target.checked });
    } else if (target.matches("[data-hm-hide-art]")) {
      save({ hideHomeArt: target.checked });
    } else if (target.matches("[data-hm-name]")) {
      save({ name: target.value.trim() });
    } else if (target.matches("[data-hm-opacity]")) {
      save({ cardOpacity: Number(target.value) });
    } else if (target.matches("[data-hm-link-label], [data-hm-link-url]")) {
      saveLinks(container);
    }
  });

  // Card darkness previews while dragging, without re-rendering the dashboard.
  const opacity = container.querySelector("[data-hm-opacity]");
  opacity.addEventListener("input", () => {
    document.getElementById(DASHBOARD_ID)?.shadowRoot?.querySelector("[data-home]")?.style.setProperty("--card-alpha", String(opacity.value / 100));
  });

  container.querySelector("[data-hm-reset-layout]").addEventListener("click", () => {
    resetLayout();
    container.querySelectorAll("[data-hm-widget]").forEach((input) => (input.checked = true));
  });

  container.querySelector("[data-hm-link-add]").addEventListener("click", () => {
    const list = container.querySelector("[data-hm-links]");
    list.insertAdjacentHTML("beforeend", linkRow(undefined, list.children.length));
    list.lastElementChild.querySelector("input").focus();
  });
  container.querySelector("[data-hm-links]").addEventListener("click", (event) => {
    const remove = event.target.closest("[data-hm-link-remove]");
    if (!remove) return;
    remove.closest(".link-row").remove();
    saveLinks(container);
  });
}

registerTab({ id: "home", label: "Home", prepare: refreshData, render: renderTab, bind: bindTab });

export function startHome() {
  onSettingsChange((name, options) => {
    if (name === SECTION) {
      applyRules();
      sync();
      if (!options?.quiet) renderDashboard();
    }
    // The top bar mode changes where the dashboard starts.
    if (name === "topBar") {
      const app = document.querySelector(APP_SELECTOR);
      if (app) updateDashboardOffset(app);
    }
  });
  onDomChange(sync);
  applyRules();
  sync();
  window.CommandBar?.addAction?.({
    name: () => (settings().mode === "off" ? "Turn on clean home" : "Show Riot's home tab"),
    group: "steele's ui",
    tags: ["home", "activity center", "dashboard"],
    perform: () => updateSettings(SECTION, { mode: settings().mode === "off" ? "custom" : "off" }),
  });
}
