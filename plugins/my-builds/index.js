/**
 * @description Item sets made from your own games: after each Summoner's Rift game it learns what you build on that champion, and keeps a set in the in-game shop with your core items, boots, starters and options.
 * @author maoloader
 * @link https://github.com/steele123/maoloader
 */
(function () {
  const pluginName = "my-builds";
  const settingsKey = "my-builds.settings";
  const gamesKey = "my-builds.games";
  const phaseApi = "/lol-gameflow/v1/gameflow-phase";
  const historyApi = "/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=99";
  // Summoner's Rift queues: draft, ranked solo and flex, blind, quickplay, swiftplay, Clash.
  const RIFT_QUEUES = new Set([400, 420, 430, 440, 480, 490, 700]);
  const UID_PREFIX = "maoloader-my-builds-";
  const GAMES_PER_CHAMPION = 30;
  const REMAKE_SECONDS = 300;
  const HEALTH_POTION = 2003;
  const CONTROL_WARD = 2055;
  const defaults = { autoUpdate: true, minGames: 3 };
  let pluginRoot = pluginName;
  let settings;
  let store = loadGames();
  let items;
  let champions = new Map();
  let pageContainer;
  let updating = false;
  let commandBound = false;

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

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // ---- Your games ----

  // The client only shows your latest games, so each one is kept here as it comes in.
  function loadGames() {
    const stored = window.DataStore?.get?.(gamesKey, {});
    return stored && typeof stored === "object" && stored.byChampion ? stored : { byChampion: {} };
  }

  function saveGames() {
    window.DataStore?.set?.(gamesKey, store);
  }

  // Adds new Summoner's Rift games from match history. Returns the champions that got a new game.
  async function collectGames() {
    const history = await lcu(historyApi);
    const changed = new Set();
    for (const game of history?.games?.games || []) {
      const participant = game.participants?.[0];
      const stats = participant?.stats;
      const seconds = Number(game.gameDuration) > 10000 ? Number(game.gameDuration) / 1000 : Number(game.gameDuration);
      if (!stats || !RIFT_QUEUES.has(game.queueId) || seconds < REMAKE_SECONDS) continue;
      const championId = String(participant.championId);
      const list = (store.byChampion[championId] ??= []);
      if (list.some((entry) => entry.id === game.gameId)) continue;
      list.push({
        id: game.gameId,
        at: Number(game.gameCreation) || 0,
        win: Boolean(stats.win),
        // Slots 0-5 in order; 6 is the trinket. Where an item sits is the best hint of when it was bought.
        items: [0, 1, 2, 3, 4, 5].map((slot) => Number(stats[`item${slot}`]) || 0),
      });
      list.sort((a, b) => b.at - a.at);
      list.splice(GAMES_PER_CHAMPION);
      changed.add(championId);
    }
    if (changed.size) saveGames();
    return [...changed];
  }

  // ---- Items ----

  async function loadItems() {
    if (items) return items;
    const list = await lcu("/lol-game-data/assets/v1/items.json");
    items = new Map(list.map((item) => [item.id, item]));
    return items;
  }

  async function loadChampions() {
    if (champions.size) return champions;
    try {
      const list = await lcu("/lol-game-data/assets/v1/champion-summary.json");
      champions = new Map(list.filter((champion) => champion.id > 0).map((champion) => [String(champion.id), champion.name]));
    } catch {
      // Names are cosmetic.
    }
    return champions;
  }

  // What you'd buy in the shop: transformed items (Seraph's Embrace) count as what they came from.
  function shopItem(id) {
    const item = items.get(id);
    if (!item) return undefined;
    if (!item.inStore && item.specialRecipe) return items.get(item.specialRecipe);
    return item.inStore ? item : undefined;
  }

  function kind(item) {
    const categories = item.categories || [];
    if (categories.includes("Trinket")) return "trinket";
    if (categories.includes("Consumable")) return "consumable";
    if (categories.includes("Boots")) return item.from?.length ? "boots" : "component";
    if (!item.to?.length && item.priceTotal >= 2000) return "finished";
    if (categories.includes("Lane") && item.priceTotal <= 500) return "starter";
    return "component";
  }

  // Counts each item across your games, with the average slot it ended up in.
  function tally(games) {
    const counts = new Map();
    for (const game of games) {
      const seen = new Set();
      game.items.forEach((id, slot) => {
        const item = id && shopItem(id);
        if (!item || seen.has(item.id)) return;
        seen.add(item.id);
        const entry = counts.get(item.id) || { item, kind: kind(item), games: 0, slots: 0 };
        entry.games += 1;
        entry.slots += slot;
        counts.set(item.id, entry);
      });
    }
    return [...counts.values()].map((entry) => ({ ...entry, slot: entry.slots / entry.games }));
  }

  function buildFor(championId) {
    const games = store.byChampion[championId] || [];
    const counted = tally(games);
    const byPopularity = (a, b) => b.games - a.games || a.slot - b.slot;
    const finished = counted.filter((entry) => entry.kind === "finished").sort(byPopularity);
    // Your three most-built finished items, in the order they usually sit in your inventory.
    const core = finished.slice(0, 3).sort((a, b) => a.slot - b.slot);
    const options = finished.slice(3, 9);
    const boots = counted.filter((entry) => entry.kind === "boots").sort(byPopularity).slice(0, 2);
    const starter = counted.filter((entry) => entry.kind === "starter").sort(byPopularity)[0];
    const wins = games.filter((game) => game.win).length;
    return { games: games.length, wins, core, options, boots, starter };
  }

  function block(type, entries) {
    return { type, hideIfSummonerSpell: "", showIfSummonerSpell: "", items: entries.map(([id, count]) => ({ id: String(id), count })) };
  }

  function itemSetFor(championId, name, build) {
    const blocks = [];
    blocks.push(block("Start", [...(build.starter ? [[build.starter.item.id, 1]] : []), [HEALTH_POTION, build.starter ? 2 : 1]]));
    if (build.core.length) blocks.push(block(`Core · your most built (${build.games} games)`, build.core.map((entry) => [entry.item.id, 1])));
    if (build.boots.length) blocks.push(block("Boots", build.boots.map((entry) => [entry.item.id, 1])));
    if (build.options.length) blocks.push(block("Also built", build.options.map((entry) => [entry.item.id, 1])));
    blocks.push(block("Vision", [[CONTROL_WARD, 1]]));
    return {
      uid: `${UID_PREFIX}${championId}`,
      title: `My ${name} (${build.games} games)`,
      type: "custom",
      map: "SR",
      mode: "any",
      associatedChampions: [Number(championId)],
      associatedMaps: [11],
      preferredItemSlots: [],
      sortrank: 0,
      startedFrom: "blank",
      blocks,
    };
  }

  // ---- Item sets ----

  async function setsUrl() {
    const me = await lcu("/lol-summoner/v1/current-summoner");
    return `/lol-item-sets/v1/item-sets/${me.summonerId}/sets`;
  }

  // The client saves all item sets at once, so yours are merged in and everyone else's kept as they are.
  async function writeSets() {
    await loadItems();
    const names = await loadChampions();
    const url = await setsUrl();
    const current = await lcu(url);
    const others = (current?.itemSets || []).filter((set) => !String(set.uid || "").startsWith(UID_PREFIX));
    const ours = (current?.itemSets || []).filter((set) => String(set.uid || "").startsWith(UID_PREFIX));
    const made = [];
    const minGames = settings.get("minGames");
    for (const championId of Object.keys(store.byChampion)) {
      const build = buildFor(championId);
      if (build.games < minGames || !build.core.length) continue;
      made.push(itemSetFor(championId, names.get(championId) || "champion", build));
    }
    const madeUids = new Set(made.map((set) => set.uid));
    const kept = ours.filter((set) => !madeUids.has(set.uid));
    await lcu(url, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...current, itemSets: [...others, ...kept, ...made], timestamp: Date.now() }),
    });
    return made;
  }

  async function update({ quiet = false } = {}) {
    if (updating) return;
    updating = true;
    try {
      const changed = await collectGames();
      // Quiet updates (client start, after games) only save item sets when a game was added.
      if (quiet && !changed.length) {
        renderPage();
        return;
      }
      const made = await writeSets();
      renderPage();
      if (!quiet) {
        toast("success", made.length ? `Item sets updated for ${made.length} champion${made.length === 1 ? "" : "s"}.` : "No champion has enough games yet.", { duration: 3500 });
      } else if (changed.length) {
        const names = await loadChampions();
        const updated = made.filter((set) => changed.includes(String(set.associatedChampions[0])));
        if (updated.length) toast("info", `Your ${updated.map((set) => names.get(String(set.associatedChampions[0]))).join(", ")} item set${updated.length === 1 ? " is" : "s are"} up to date.`, { duration: 3500 });
      }
    } catch (error) {
      console.error("[my-builds]", error);
      if (!quiet) toast("error", "Couldn't update your item sets. Try again in a moment.");
    } finally {
      updating = false;
    }
  }

  async function removeSets() {
    try {
      const url = await setsUrl();
      const current = await lcu(url);
      const others = (current?.itemSets || []).filter((set) => !String(set.uid || "").startsWith(UID_PREFIX));
      await lcu(url, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...current, itemSets: others, timestamp: Date.now() }) });
      toast("success", "Removed the item sets My Builds made. Your own sets weren't touched.", { duration: 4000 });
      renderPage();
    } catch (error) {
      console.error("[my-builds]", error);
      toast("error", "Couldn't remove the item sets.");
    }
  }

  // Match history lags behind the end of the game, so look again until the new game shows up.
  async function updateAfterGame(attempt = 0) {
    const before = Object.values(store.byChampion).reduce((total, list) => total + list.length, 0);
    await update({ quiet: true });
    const after = Object.values(store.byChampion).reduce((total, list) => total + list.length, 0);
    if (after === before && attempt < 4) window.setTimeout(() => updateAfterGame(attempt + 1), 10000);
  }

  // ---- Page ----

  const STYLES = `
    .mb { display: grid; gap: 10px; }
    .mb-row { display: grid; grid-template-columns: 150px 70px minmax(0, 1fr); gap: 10px; align-items: center; padding: 7px 2px; border-bottom: 1px solid rgba(200, 170, 110, 0.08); }
    .mb-row strong { color: #f0e6d2; }
    .mb-games { color: #8c96a0; font-variant-numeric: tabular-nums; }
    .mb-items { display: flex; gap: 4px; flex-wrap: wrap; }
    .mb-items img { width: 26px; height: 26px; border-radius: 4px; border: 1px solid rgba(200, 170, 110, 0.3); }
    .mb-wait { color: #8c96a0; font-size: 12px; }
  `;

  let collectedThisSession = false;

  async function renderPage() {
    const container = pageContainer;
    if (!container?.isConnected) return;
    try {
      await loadItems();
      // Reading your games only stores them here; item sets are saved by an update.
      if (!collectedThisSession) {
        collectedThisSession = true;
        await collectGames();
      }
    } catch {
      return;
    }
    const names = await loadChampions();
    const minGames = settings.get("minGames");
    const rows = Object.keys(store.byChampion)
      .map((championId) => ({ championId, name: names.get(championId) || `Champion ${championId}`, build: buildFor(championId) }))
      .sort((a, b) => b.build.games - a.build.games || a.name.localeCompare(b.name));
    const icon = (entry) => `<img src="${escapeHtml(entry.item.iconPath)}" alt="${escapeHtml(entry.item.name)}" title="${escapeHtml(entry.item.name)} · ${entry.games} of your games" />`;
    container.innerHTML = `
      <style>${STYLES}</style>
      <div class="mb">
        ${
          rows.length
            ? rows
                .map(
                  ({ name, build }) => `
                  <div class="mb-row">
                    <strong>${escapeHtml(name)}</strong>
                    <span class="mb-games">${build.games} game${build.games === 1 ? "" : "s"}</span>
                    ${
                      build.games >= minGames && build.core.length
                        ? `<span class="mb-items">${[...build.core, ...build.boots.slice(0, 1)].map(icon).join("")}</span>`
                        : `<span class="mb-wait">${Math.max(0, minGames - build.games)} more game${minGames - build.games === 1 ? "" : "s"} for a set</span>`
                    }
                  </div>`,
                )
                .join("")
            : '<p class="muted">No Summoner\'s Rift games yet. Play one and your first build shows up here.</p>'
        }
        <p class="muted">Sets show in the in-game shop as "My <champion>". The client only shows your latest games, so My Builds keeps each game as it comes in, up to ${GAMES_PER_CHAMPION} per champion.</p>
      </div>`;
  }

  // ---- Settings and commands ----

  function defineSettings() {
    if (typeof window.PluginSettings?.define === "function") {
      return window.PluginSettings.define({
        id: pluginName,
        title: "My Builds",
        description: "Item sets made from your own games, ready in the in-game shop.",
        icon: `https://plugins/${pluginRoot}/assets/icon.svg`,
        storageKey: settingsKey,
        fields: [
          {
            key: "autoUpdate",
            type: "toggle",
            label: "Update after each game",
            description: "Learns from each Summoner's Rift game and refreshes that champion's set.",
            default: defaults.autoUpdate,
          },
          {
            key: "minGames",
            type: "range",
            label: "Games before a set",
            description: "How many games on a champion before My Builds makes its set.",
            min: 1,
            max: 10,
            step: 1,
            default: defaults.minGames,
          },
          { type: "button", label: "Update now", description: "Reads your latest games and rebuilds every set.", buttonLabel: "Update", action: () => update() },
          { type: "button", label: "Remove My Builds' item sets", description: "Deletes only the sets My Builds made; your own stay.", buttonLabel: "Remove", action: () => removeSets() },
        ],
        page: {
          render(container) {
            pageContainer = container;
            renderPage();
          },
          destroy() {
            pageContainer = undefined;
          },
        },
      });
    }
    const stored = window.DataStore?.get?.(settingsKey, {});
    const values = { ...defaults, ...(stored && typeof stored === "object" ? stored : {}) };
    return { get: (key) => (key ? values[key] : { ...values }), onChange: () => () => {}, open: () => toast("info", "Update maoloader to 0.1.7 or newer to change plugin settings.") };
  }

  function bindCommandBar() {
    if (commandBound || typeof window.CommandBar?.addAction !== "function") return;
    commandBound = true;
    window.CommandBar.addAction({ name: "Update my item sets", group: "my builds", tags: ["items", "build", "item set", "shop"], perform: () => update() });
    window.CommandBar.addAction({ name: "My builds", group: "my builds", tags: ["items", "build", "item set", "settings"], perform: () => settings.open() });
  }

  exports.init = function init(context) {
    if (context?.meta?.name) pluginRoot = context.meta.name;
    const socket = context?.socket || window.socket;
    settings = defineSettings();
    socket?.observe?.(phaseApi, (event) => {
      if (event?.data === "EndOfGame" && settings.get("autoUpdate")) window.setTimeout(() => updateAfterGame(), 6000);
    });
  };

  exports.load = function load() {
    bindCommandBar();
    // Catches games played while the plugin wasn't running.
    if (settings.get("autoUpdate")) window.setTimeout(() => update({ quiet: true }), 5000);
  };
})();
