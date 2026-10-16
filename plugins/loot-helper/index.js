/**
 * @description Preview and bulk-disenchant champion shards for Blue Essence, with a confirm step.
 * @author maoloader
 * @link https://github.com/steele123/maoloader
 */
(function () {
  const pluginName = "loot-helper";
  const settingsKey = "loot-helper.settings";
  const lootApi = "/lol-loot/v1/player-loot";
  const disenchantRecipe = "CHAMPION_RENTAL_disenchant";
  const confirmMs = 4000;
  const defaults = { ownedOnly: true, keepOne: false };
  let pluginRoot = pluginName;
  let settings;
  let plan = [];
  // "loading", "ready" or "error": what the settings tab shows above the list.
  let planState = "loading";
  let armedUntil = 0;
  let armTimer = 0;
  let working = false;
  let progress = "";
  let commandBound = false;
  // The disenchant section of this plugin's settings tab, while that tab is open.
  let page;

  // Settings live in maoloader's shared settings window (Ctrl+K → Plugin settings). On a runtime
  // older than 0.1.7 there is no such window; the plugin then keeps working with what's saved.
  function defineSettings() {
    if (typeof window.PluginSettings?.define === "function") {
      return window.PluginSettings.define({
        id: pluginName,
        title: "Loot Helper",
        description: "Turns champion shards into Blue Essence in one go, after showing you exactly what will be disenchanted.",
        icon: `https://plugins/${pluginRoot}/assets/icon.svg`,
        storageKey: settingsKey,
        fields: [
          {
            key: "ownedOnly",
            type: "toggle",
            label: "Only champions I own",
            description: "Leaves shards you could still use to unlock a champion.",
            default: defaults.ownedOnly,
          },
          { key: "keepOne", type: "toggle", label: "Keep one of each", description: "Leaves one shard per champion.", default: defaults.keepOne },
        ],
        page: { render: renderPage, destroy: destroyPage },
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

  function formatNumber(value) {
    return Number(value || 0).toLocaleString();
  }

  // Champion shards only: permanent champions, skins and other loot are never included.
  function buildPlan(loot) {
    const ownedOnly = settings.get("ownedOnly");
    const keepOne = settings.get("keepOne");
    return (Array.isArray(loot) ? loot : [])
      .filter((item) => item.type === "CHAMPION_RENTAL" && item.displayCategories === "CHAMPION" && Number(item.count) > 0)
      .filter((item) => !ownedOnly || item.itemStatus === "OWNED")
      .map((item) => {
        const count = Number(item.count) - (keepOne ? 1 : 0);
        return {
          lootId: item.lootId,
          name: item.itemDesc || item.localizedName || item.lootName || item.lootId,
          owned: item.itemStatus === "OWNED",
          count,
          value: Number(item.disenchantValue) || 0,
        };
      })
      .filter((entry) => entry.count > 0)
      .sort((a, b) => b.value * b.count - a.value * a.count || a.name.localeCompare(b.name));
  }

  function totals() {
    return {
      shards: plan.reduce((sum, entry) => sum + entry.count, 0),
      essence: plan.reduce((sum, entry) => sum + entry.count * entry.value, 0),
    };
  }

  async function loadPlan() {
    plan = buildPlan(await lcu(lootApi));
    return plan;
  }

  // Reads the loot again and redraws the tab. Skipped mid-disenchant, which refreshes at the end.
  async function refreshPlan() {
    if (working) return;
    try {
      await loadPlan();
      planState = "ready";
    } catch (error) {
      console.error("[loot-helper]", error);
      plan = [];
      planState = "error";
    }
    renderPlan();
  }

  async function disenchantAll() {
    if (working || !plan.length) return;
    working = true;
    disarm();
    const { essence } = totals();
    let done = 0;
    let failed = 0;
    for (const entry of plan) {
      progress = `Disenchanting ${done + failed + 1} of ${plan.length}…`;
      renderButton();
      try {
        await lcu(`/lol-loot/v1/recipes/${disenchantRecipe}/craft?repeat=${entry.count}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify([entry.lootId]),
        });
        done += 1;
      } catch (error) {
        console.error("[loot-helper]", entry.lootId, error);
        failed += 1;
      }
    }
    working = false;
    progress = "";
    if (failed) {
      toast("warning", `Disenchanted ${done} of ${done + failed} champions. Open the loot tab to check the rest.`, { duration: 5000 });
    } else {
      toast("success", `Disenchanted ${done} champion${done === 1 ? "" : "s"} for ${formatNumber(essence)} Blue Essence.`, { duration: 4000 });
    }
    await refreshPlan();
  }

  function disarm() {
    armedUntil = 0;
    window.clearTimeout(armTimer);
    armTimer = 0;
  }

  // The first click arms the button; only a second click within a few seconds disenchants.
  function onDisenchantClick() {
    if (working || !plan.length) return;
    if (Date.now() < armedUntil) {
      disenchantAll();
      return;
    }
    armedUntil = Date.now() + confirmMs;
    armTimer = window.setTimeout(() => {
      disarm();
      renderButton();
    }, confirmMs);
    renderButton();
  }

  // Only what the shared window doesn't already style: the shard list and the red button.
  const pageStyles = `
    .loot-list { display: grid; gap: 2px; max-height: 300px; margin: 4px 0 0; padding: 0; overflow: auto; list-style: none; }
    .loot-list:empty { display: none; }
    .loot-list li { display: grid; grid-template-columns: minmax(0, 1fr) 44px 80px; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 6px; font-variant-numeric: tabular-nums; }
    .loot-list li:nth-child(odd) { background: rgba(200, 170, 110, 0.06); }
    .loot-name { overflow: hidden; color: #f0e6d2; text-overflow: ellipsis; white-space: nowrap; }
    .loot-count { color: #8a949c; text-align: right; }
    .loot-value { color: #f0e6d2; font-weight: 700; text-align: right; }
    .tag { padding: 0 5px; border-radius: 4px; background: rgba(200, 170, 110, 0.16); color: #c8aa6e; font-size: 11px; font-weight: 700; }
    .button.danger { flex: none; border-color: rgba(224, 96, 90, 0.6); color: #f08a84; }
    .button.danger:hover:not(:disabled) { border-color: #e0605a; color: #ffb3ae; }
    .button.danger.is-armed { border-color: #e0605a; background: #a8332d; color: #ffffff; }
  `;

  function renderPage(container, ctx) {
    container.innerHTML = `
      <style>${pageStyles}</style>
      <p class="heading">Disenchant</p>
      <div class="field">
        <span class="copy"><strong data-summary></strong><small>Skins, permanent champions and other loot are never touched. This can't be undone.</small></span>
        <button class="button danger" type="button" data-disenchant></button>
      </div>
      <ul class="loot-list" data-list></ul>`;
    // Changing a setting cancels a half-made confirm and rebuilds the list.
    const unsubscribe = ctx.settings.onChange(() => {
      disarm();
      refreshPlan();
    });
    page = { container, unsubscribe };
    container.querySelector("[data-disenchant]").addEventListener("click", onDisenchantClick);
    if (!working) planState = "loading";
    renderPlan();
    refreshPlan();
  }

  function destroyPage() {
    disarm();
    page?.unsubscribe();
    page = undefined;
  }

  function renderButton() {
    const button = page?.container.querySelector("[data-disenchant]");
    if (!button) return;
    const { shards, essence } = totals();
    const armed = Date.now() < armedUntil;
    button.disabled = working || !plan.length;
    button.classList.toggle("is-armed", armed);
    button.textContent =
      progress ||
      (planState === "loading"
        ? "Reading your loot…"
        : !plan.length
          ? "Nothing to disenchant"
          : armed
            ? `Click again to disenchant ${formatNumber(shards)} shards`
            : `Disenchant ${formatNumber(shards)} shard${shards === 1 ? "" : "s"} for ${formatNumber(essence)} BE`);
  }

  function renderPlan() {
    const container = page?.container;
    if (!container) return;
    const { shards, essence } = totals();
    container.querySelector("[data-summary]").textContent =
      planState === "loading"
        ? "Reading your loot…"
        : planState === "error"
          ? "Could not read your loot. Open the loot tab once and try again."
          : plan.length
            ? `${formatNumber(shards)} shards from ${plan.length} champion${plan.length === 1 ? "" : "s"} · ${formatNumber(essence)} Blue Essence`
            : "No champion shards match these settings.";
    container.querySelector("[data-list]").innerHTML = plan
      .map(
        (entry) => `
          <li>
            <span class="loot-name">${escapeHtml(entry.name)}${entry.owned ? "" : ' <span class="tag">Not owned</span>'}</span>
            <span class="loot-count">×${entry.count}</span>
            <span class="loot-value">${formatNumber(entry.count * entry.value)} BE</span>
          </li>`,
      )
      .join("");
    renderButton();
  }

  function bindCommandBar() {
    if (commandBound || typeof window.CommandBar?.addAction !== "function") return;
    commandBound = true;
    window.CommandBar.addAction({
      name: "Disenchant champion shards",
      group: "loot",
      tags: ["loot", "hextech", "blue essence", "shards", "disenchant", "crafting", "settings"],
      perform: () => settings.open(),
    });
  }

  exports.init = function init(context) {
    if (context?.meta?.name) pluginRoot = context.meta.name;
    settings = defineSettings();
  };

  exports.load = function load() {
    bindCommandBar();
  };
})();
