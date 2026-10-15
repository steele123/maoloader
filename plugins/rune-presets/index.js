/**
 * @description Save rune pages as named presets, apply them in one click, and auto-apply them per champion.
 * @author steel
 * @link https://github.com/steele123/maoloader
 */
(function () {
  const pluginName = "rune-presets";
  const hostId = "maoloader-rune-presets";
  const stylesheetId = "maoloader-rune-presets-styles";
  const settingsKey = "rune-presets.settings";
  const perksApi = "/lol-perks/v1";
  const sessionApi = "/lol-champ-select/v1/session";
  // The one client page this plugin writes into, so your own pages are never touched.
  const pagePrefix = "mao · ";
  const maxNameLength = 40;
  const defaults = { presets: [], autoApply: true };
  let pluginRoot = pluginName;
  let settings = loadSettings();
  let championNames = new Map();
  let styleNames = new Map();
  let autoApplied = "";
  let commandBound = false;

  function loadSettings() {
    const stored = window.DataStore?.get?.(settingsKey, {});
    const merged = { ...defaults, ...(stored && typeof stored === "object" ? stored : {}) };
    merged.autoApply = Boolean(merged.autoApply);
    merged.presets = Array.isArray(merged.presets)
      ? merged.presets.filter(
          (preset) => preset && preset.name && Number(preset.primaryStyleId) && Number(preset.subStyleId) && Array.isArray(preset.selectedPerkIds),
        )
      : [];
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

  async function lcu(path, options) {
    const response = await fetch(path, options);
    if (!response.ok) throw new Error(`${options?.method || "GET"} ${path} failed with ${response.status}`);
    const text = await response.text();
    return text ? JSON.parse(text) : undefined;
  }

  function json(method, body) {
    return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
  }

  async function loadNames() {
    if (!championNames.size) {
      try {
        const champions = await lcu("/lol-game-data/assets/v1/champion-summary.json");
        championNames = new Map(champions.filter((champion) => champion.id > 0).map((champion) => [champion.id, champion.name]));
      } catch {
        // Champion tags still work by id.
      }
    }
    if (!styleNames.size) {
      try {
        const styles = await lcu(`${perksApi}/styles`);
        styleNames = new Map(styles.map((style) => [style.id, style.name]));
      } catch {
        // Style names are cosmetic.
      }
    }
  }

  function championIdByName(name) {
    const wanted = String(name || "").trim().toLowerCase();
    if (!wanted) return 0;
    for (const [id, championName] of championNames) {
      if (championName.toLowerCase() === wanted) return id;
    }
    return undefined;
  }

  function pageBody(preset, name) {
    return {
      name,
      primaryStyleId: preset.primaryStyleId,
      subStyleId: preset.subStyleId,
      selectedPerkIds: preset.selectedPerkIds,
      current: true,
    };
  }

  async function writePage(page, preset) {
    await lcu(`${perksApi}/pages/${page.id}`, json("PUT", { ...page, ...pageBody(preset, `${pagePrefix}${preset.name}`.slice(0, 25)) }));
    await lcu(`${perksApi}/currentpage`, json("PUT", page.id));
  }

  // Applies into the plugin's own page, a free slot, or (only when asked) the current page.
  async function applyPreset(preset, { overwriteCurrent = false, quiet = false } = {}) {
    try {
      const [pages, inventory, current] = await Promise.all([
        lcu(`${perksApi}/pages`),
        lcu(`${perksApi}/inventory`).catch(() => undefined),
        lcu(`${perksApi}/currentpage`).catch(() => undefined),
      ]);
      const editable = (pages || []).filter((page) => page.isEditable);
      const ownPage = editable.find((page) => String(page.name).startsWith(pagePrefix));

      if (ownPage) {
        await writePage(ownPage, preset);
      } else if (overwriteCurrent && current?.isEditable) {
        await writePage(current, preset);
      } else if (!inventory || editable.filter((page) => page.isDeletable).length < Number(inventory.ownedPageCount || 0)) {
        await lcu(`${perksApi}/pages`, json("POST", pageBody(preset, `${pagePrefix}${preset.name}`.slice(0, 25))));
      } else {
        toast("warning", {
          title: "No free rune page",
          description: current?.isEditable ? `Overwrite "${current.name}" with ${preset.name}?` : "Delete a rune page, or rename one to start with \"mao · \".",
          duration: 10000,
          action: current?.isEditable ? { label: "Overwrite", onClick: () => applyPreset(preset, { overwriteCurrent: true }) } : undefined,
        });
        return false;
      }
      if (!quiet) toast("success", `Runes: ${preset.name}`, { duration: 2500 });
      return true;
    } catch (error) {
      console.error("[rune-presets]", error);
      toast("error", `Could not apply ${preset.name}.`);
      return false;
    }
  }

  async function saveCurrentPage(name, championId) {
    try {
      const page = await lcu(`${perksApi}/currentpage`);
      if (!page?.selectedPerkIds?.length) throw new Error("No current rune page");
      const presetName = (name || String(page.name).replace(pagePrefix, "")).trim().slice(0, maxNameLength);
      const preset = {
        id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        name: presetName,
        primaryStyleId: page.primaryStyleId,
        subStyleId: page.subStyleId,
        selectedPerkIds: page.selectedPerkIds,
        championId: championId || 0,
      };
      const others = settings.presets.filter((existing) => existing.name.toLowerCase() !== presetName.toLowerCase());
      saveSettings({ presets: [...others, preset] });
      toast("success", `Saved "${presetName}".`, { duration: 2500 });
      return true;
    } catch (error) {
      console.error("[rune-presets]", error);
      toast("error", "Could not read your current rune page.");
      return false;
    }
  }

  async function onSession(session) {
    if (!settings.autoApply || !session?.myTeam) return;
    const me = session.myTeam.find((player) => player.cellId === session.localPlayerCellId);
    const locked =
      me?.championId &&
      (session.actions || []).flat().every((action) => action.actorCellId !== session.localPlayerCellId || action.type !== "pick" || action.completed);
    if (!locked) return;
    const key = `${session.gameId}:${me.championId}`;
    if (autoApplied === key) return;
    autoApplied = key;
    const preset = settings.presets.find((entry) => entry.championId === me.championId);
    if (preset) {
      await loadNames();
      if (await applyPreset(preset, { quiet: true })) {
        toast("success", `Runes set to ${preset.name} for ${championNames.get(me.championId) || "your champion"}.`, { duration: 3000 });
      }
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

  function presetRows() {
    if (!settings.presets.length) return '<p class="field-note">No presets yet. Set up a page in the client, then save it here.</p>';
    return settings.presets
      .map((preset) => {
        const styles = [styleNames.get(preset.primaryStyleId), styleNames.get(preset.subStyleId)].filter(Boolean).join(" / ");
        const champion = preset.championId ? championNames.get(preset.championId) || `Champion ${preset.championId}` : "";
        return `
          <div class="preset-row">
            <span class="preset-copy">
              <strong>${escapeHtml(preset.name)}</strong>
              <small>${escapeHtml([styles, champion && `Auto for ${champion}`].filter(Boolean).join(" · "))}</small>
            </span>
            <button class="button" type="button" data-apply="${escapeHtml(preset.id)}">Apply</button>
            <button class="icon-button" type="button" data-remove="${escapeHtml(preset.id)}" aria-label="Delete preset ${escapeHtml(preset.name)}">×</button>
          </div>`;
      })
      .join("");
  }

  async function openSettings() {
    await loadNames();
    let usage = "";
    try {
      const [pages, inventory] = await Promise.all([lcu(`${perksApi}/pages`), lcu(`${perksApi}/inventory`)]);
      usage = `${pages.filter((page) => page.isDeletable).length} of ${inventory.ownedPageCount} rune pages used`;
    } catch {
      usage = "";
    }

    let element = host();
    if (!element) {
      element = document.createElement("maoloader-rune-presets");
      element.id = hostId;
      element.style.cssText = "position:fixed;inset:0;z-index:2147483646;display:flex;pointer-events:none;";
      element.attachShadow({ mode: "open" });
      document.body.appendChild(element);
    }

    const root = element.shadowRoot;
    const names = [...championNames.values()].sort((a, b) => a.localeCompare(b));
    root.innerHTML = `
      <link id="${stylesheetId}" rel="stylesheet" href="https://plugins/${pluginRoot}/styles.css" />
      <datalist id="champion-names">${names.map((name) => `<option value="${escapeHtml(name)}"></option>`).join("")}</datalist>
      <div class="sheet-backdrop">
        <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
          <header class="sheet-header">
            <img src="https://plugins/${pluginRoot}/assets/icon.svg" alt="" width="32" height="32" />
            <div class="sheet-title"><h1 id="sheet-title">Rune presets</h1><span>Saved rune pages</span></div>
            <button class="sheet-close" type="button" data-close aria-label="Close">×</button>
          </header>
          <div class="sheet-body">
            <div class="field is-stacked">
              <span class="field-copy"><strong>Save current page</strong><small>Optionally tag a champion to apply it automatically when you lock them in.</small></span>
              <div class="save-row">
                <input class="text-input" type="text" data-name maxlength="${maxNameLength}" placeholder="Preset name" />
                <input class="text-input" type="text" data-champion list="champion-names" placeholder="Champion (optional)" spellcheck="false" />
                <button class="button is-primary" type="button" data-save>Save</button>
              </div>
              <p class="field-note" data-save-note></p>
            </div>
            <div class="field is-stacked">
              <span class="field-copy"><strong>Presets</strong></span>
              <div class="preset-list" data-presets>${presetRows()}</div>
            </div>
            <label class="field">
              <span class="field-copy"><strong>Apply in champ select</strong><small>Uses a champion's preset when you lock that champion in.</small></span>
              <span class="switch"><input type="checkbox" data-auto ${settings.autoApply ? "checked" : ""} /><span></span></span>
            </label>
          </div>
          <footer class="sheet-footer"><span>Applies into a page named <code>${escapeHtml(pagePrefix)}…</code></span><span>${escapeHtml(usage)}</span></footer>
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
    root.querySelector("[data-auto]").addEventListener("change", (event) => saveSettings({ autoApply: event.target.checked }));

    const note = root.querySelector("[data-save-note]");
    root.querySelector("[data-save]").addEventListener("click", async () => {
      const championInput = root.querySelector("[data-champion]");
      const championId = championIdByName(championInput.value);
      if (championId === undefined) {
        note.textContent = `"${championInput.value}" isn't a champion name.`;
        note.classList.add("is-error");
        return;
      }
      note.textContent = "";
      note.classList.remove("is-error");
      if (await saveCurrentPage(root.querySelector("[data-name]").value, championId)) {
        root.querySelector("[data-name]").value = "";
        championInput.value = "";
        root.querySelector("[data-presets]").innerHTML = presetRows();
      }
    });

    // Rows are re-rendered, so their clicks are delegated from the list.
    root.querySelector("[data-presets]").addEventListener("click", (event) => {
      const apply = event.target.closest("[data-apply]");
      const remove = event.target.closest("[data-remove]");
      if (apply) {
        const preset = settings.presets.find((entry) => entry.id === apply.getAttribute("data-apply"));
        if (preset) applyPreset(preset);
      } else if (remove) {
        saveSettings({ presets: settings.presets.filter((entry) => entry.id !== remove.getAttribute("data-remove")) });
        root.querySelector("[data-presets]").innerHTML = presetRows();
      }
    });
    root.querySelector("[data-name]").focus();
  }

  function bindCommandBar() {
    if (commandBound || typeof window.CommandBar?.addAction !== "function") return;
    commandBound = true;
    window.CommandBar.addAction({
      name: "Rune presets",
      group: "runes",
      tags: ["runes", "rune page", "presets", "perks"],
      perform: openSettings,
    });
    window.CommandBar.addAction({
      name: "Save current rune page as preset",
      group: "runes",
      tags: ["runes", "save", "preset"],
      perform: () => saveCurrentPage("", 0),
    });
  }

  exports.init = function init(context) {
    if (context?.meta?.name) pluginRoot = context.meta.name;
    const socket = context?.socket || window.socket;
    socket?.observe?.(sessionApi, (event) => {
      onSession(event?.eventType === "Delete" ? undefined : event?.data).catch((error) => console.error("[rune-presets]", error));
    });
  };

  exports.load = function load() {
    bindCommandBar();
  };
})();
