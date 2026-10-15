/**
 * @description Preview and bulk-disenchant champion shards for Blue Essence, with a confirm step.
 * @author steel
 * @link https://github.com/steele123/maoloader
 */
(function () {
  const pluginName = "loot-helper";
  const hostId = "maoloader-loot-helper";
  const stylesheetId = "maoloader-loot-helper-styles";
  const settingsKey = "loot-helper.settings";
  const lootApi = "/lol-loot/v1/player-loot";
  const disenchantRecipe = "CHAMPION_RENTAL_disenchant";
  const confirmMs = 4000;
  const defaults = { ownedOnly: true, keepOne: false };
  let pluginRoot = pluginName;
  let settings = loadSettings();
  let plan = [];
  let armedUntil = 0;
  let armTimer = 0;
  let working = false;
  let commandBound = false;

  function loadSettings() {
    const stored = window.DataStore?.get?.(settingsKey, {});
    const merged = { ...defaults, ...(stored && typeof stored === "object" ? stored : {}) };
    merged.ownedOnly = Boolean(merged.ownedOnly);
    merged.keepOne = Boolean(merged.keepOne);
    return merged;
  }

  function saveSettings(patch) {
    settings = { ...settings, ...patch };
    window.DataStore?.set?.(settingsKey, settings);
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
    return (Array.isArray(loot) ? loot : [])
      .filter((item) => item.type === "CHAMPION_RENTAL" && item.displayCategories === "CHAMPION" && Number(item.count) > 0)
      .filter((item) => !settings.ownedOnly || item.itemStatus === "OWNED")
      .map((item) => {
        const count = Number(item.count) - (settings.keepOne ? 1 : 0);
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

  async function disenchantAll() {
    if (working || !plan.length) return;
    working = true;
    disarm();
    const { essence } = totals();
    let done = 0;
    let failed = 0;
    for (const entry of plan) {
      renderButton(`Disenchanting ${done + 1} of ${plan.length}…`);
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
    if (failed) {
      toast("warning", `Disenchanted ${done} of ${done + failed} champions. Open the loot tab to check the rest.`, { duration: 5000 });
    } else {
      toast("success", `Disenchanted ${done} champion${done === 1 ? "" : "s"} for ${formatNumber(essence)} Blue Essence.`, { duration: 4000 });
    }
    try {
      await loadPlan();
    } catch {
      plan = [];
    }
    renderSheet();
  }

  function disarm() {
    armedUntil = 0;
    window.clearTimeout(armTimer);
    armTimer = 0;
  }

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

  function closeSheet() {
    disarm();
    host()?.remove();
  }

  function renderButton(label) {
    const button = host()?.shadowRoot?.querySelector("[data-disenchant]");
    if (!button) return;
    const { shards, essence } = totals();
    const armed = Date.now() < armedUntil;
    button.disabled = working || !plan.length;
    button.classList.toggle("is-armed", armed);
    button.textContent =
      label ||
      (!plan.length
        ? "Nothing to disenchant"
        : armed
          ? `Click again to disenchant ${formatNumber(shards)} shards`
          : `Disenchant ${formatNumber(shards)} shard${shards === 1 ? "" : "s"} for ${formatNumber(essence)} BE`);
  }

  function renderSheet() {
    const root = host()?.shadowRoot;
    if (!root) return;
    const { shards, essence } = totals();
    root.querySelector("[data-summary]").textContent = plan.length
      ? `${formatNumber(shards)} shards from ${plan.length} champion${plan.length === 1 ? "" : "s"} · ${formatNumber(essence)} Blue Essence`
      : "No champion shards match these settings.";
    root.querySelector("[data-list]").innerHTML = plan
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

  async function openSheet() {
    try {
      await loadPlan();
    } catch (error) {
      console.error("[loot-helper]", error);
      toast("error", "Could not read your loot. Open the loot tab once and try again.");
      return;
    }

    let element = host();
    if (!element) {
      element = document.createElement("maoloader-loot-helper");
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
            <div class="sheet-title"><h1 id="sheet-title">Disenchant shards</h1><span>Champion shards to Blue Essence</span></div>
            <button class="sheet-close" type="button" data-close aria-label="Close">×</button>
          </header>
          <div class="sheet-body">
            <label class="field">
              <span class="field-copy"><strong>Only champions I own</strong><small>Leaves shards you could still use to unlock a champion.</small></span>
              <span class="switch"><input type="checkbox" data-owned ${settings.ownedOnly ? "checked" : ""} /><span></span></span>
            </label>
            <label class="field">
              <span class="field-copy"><strong>Keep one of each</strong><small>Leaves one shard per champion.</small></span>
              <span class="switch"><input type="checkbox" data-keep ${settings.keepOne ? "checked" : ""} /><span></span></span>
            </label>
            <div class="field is-stacked">
              <span class="field-copy"><strong data-summary></strong><small>Skins, permanent champions and other loot are never touched.</small></span>
              <ul class="loot-list" data-list></ul>
            </div>
          </div>
          <footer class="sheet-footer">
            <span>This can't be undone</span>
            <button class="button is-danger" type="button" data-disenchant></button>
          </footer>
        </section>
      </div>`;

    revealWhenStyled(element);
    renderSheet();
    root.querySelector("[data-close]").addEventListener("click", closeSheet);
    const backdrop = root.querySelector(".sheet-backdrop");
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop && !working) closeSheet();
    });
    backdrop.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !working) closeSheet();
    });
    for (const [selector, key] of [
      ["[data-owned]", "ownedOnly"],
      ["[data-keep]", "keepOne"],
    ]) {
      root.querySelector(selector).addEventListener("change", async (event) => {
        saveSettings({ [key]: event.target.checked });
        disarm();
        await loadPlan().catch(() => {});
        renderSheet();
      });
    }
    root.querySelector("[data-disenchant]").addEventListener("click", onDisenchantClick);
    root.querySelector("[data-owned]").focus();
  }

  function bindCommandBar() {
    if (commandBound || typeof window.CommandBar?.addAction !== "function") return;
    commandBound = true;
    window.CommandBar.addAction({
      name: "Disenchant champion shards",
      group: "loot",
      tags: ["loot", "hextech", "blue essence", "shards", "disenchant", "crafting"],
      perform: openSheet,
    });
  }

  exports.init = function init(context) {
    if (context?.meta?.name) pluginRoot = context.meta.name;
  };

  exports.load = function load() {
    bindCommandBar();
  };
})();
