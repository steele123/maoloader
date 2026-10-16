/**
 * @description Save rune pages as named presets, apply them in one click, and auto-apply them per champion.
 * @author maoloader
 * @link https://github.com/steele123/maoloader
 */
(function () {
  const pluginName = "rune-presets";
  const settingsKey = "rune-presets.settings";
  const perksApi = "/lol-perks/v1";
  const sessionApi = "/lol-champ-select/v1/session";
  // The one client page this plugin writes into, so your own pages are never touched.
  const pagePrefix = "mao · ";
  const maxNameLength = 40;
  const defaults = { autoApply: true };
  let pluginRoot = pluginName;
  let settings;
  let presets = loadPresets();
  let championNames = new Map();
  let styleNames = new Map();
  let autoApplied = "";
  let commandBound = false;
  // The presets page while it's open in the settings window.
  let openPage;

  function storedSettings() {
    const stored = window.DataStore?.get?.(settingsKey, {});
    return stored && typeof stored === "object" ? stored : {};
  }

  function loadPresets() {
    const stored = storedSettings().presets;
    return Array.isArray(stored)
      ? stored.filter(
          (preset) => preset && preset.name && Number(preset.primaryStyleId) && Number(preset.subStyleId) && Array.isArray(preset.selectedPerkIds),
        )
      : [];
  }

  // Presets aren't a settings field, so they're saved by hand next to autoApply in the same object.
  function writePresets() {
    window.DataStore?.set?.(settingsKey, { ...storedSettings(), presets });
  }

  function savePresets(next) {
    presets = next;
    writePresets();
    window.CommandBar?.update?.();
    openPage?.refresh();
  }

  // Settings live in maoloader's shared settings window (Ctrl+K → Plugin settings). On a runtime
  // older than 0.1.7 there is no such window; the plugin then keeps working with what's saved.
  function defineSettings() {
    if (typeof window.PluginSettings?.define === "function") {
      return window.PluginSettings.define({
        id: pluginName,
        title: "Rune Presets",
        description: "Saves rune pages as presets you can apply in one click, or automatically for a champion.",
        icon: `https://plugins/${pluginRoot}/assets/icon.svg`,
        storageKey: settingsKey,
        fields: [
          {
            key: "autoApply",
            type: "toggle",
            label: "Apply in champ select",
            description: "Uses a champion's preset when you lock that champion in.",
            default: defaults.autoApply,
          },
        ],
        page: { render: renderPage, destroy: () => (openPage = undefined) },
      });
    }
    const values = { ...defaults, ...storedSettings() };
    values.autoApply = Boolean(values.autoApply);
    return {
      get: (key) => (key ? values[key] : { ...values }),
      set(key, value) {
        values[key] = value;
        window.DataStore?.set?.(settingsKey, { ...storedSettings(), [key]: value });
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
      const others = presets.filter((existing) => existing.name.toLowerCase() !== presetName.toLowerCase());
      savePresets([...others, preset]);
      toast("success", `Saved "${presetName}".`, { duration: 2500 });
      return true;
    } catch (error) {
      console.error("[rune-presets]", error);
      toast("error", "Could not read your current rune page.");
      return false;
    }
  }

  async function onSession(session) {
    if (!settings.get("autoApply") || !session?.myTeam) return;
    const me = session.myTeam.find((player) => player.cellId === session.localPlayerCellId);
    const locked =
      me?.championId &&
      (session.actions || []).flat().every((action) => action.actorCellId !== session.localPlayerCellId || action.type !== "pick" || action.completed);
    if (!locked) return;
    const key = `${session.gameId}:${me.championId}`;
    if (autoApplied === key) return;
    autoApplied = key;
    const preset = presets.find((entry) => entry.championId === me.championId);
    if (preset) {
      await loadNames();
      if (await applyPreset(preset, { quiet: true })) {
        toast("success", `Runes set to ${preset.name} for ${championNames.get(me.championId) || "your champion"}.`, { duration: 3000 });
      }
    }
  }

  function presetRows() {
    if (!presets.length) return '<p class="muted">No presets yet. Set up a page in the client, then save it here.</p>';
    return presets
      .map((preset) => {
        const styles = [styleNames.get(preset.primaryStyleId), styleNames.get(preset.subStyleId)].filter(Boolean).join(" / ");
        const champion = preset.championId ? championNames.get(preset.championId) || `Champion ${preset.championId}` : "";
        return `
          <div class="preset-row">
            <span class="copy">
              <strong>${escapeHtml(preset.name)}</strong>
              <small>${escapeHtml([styles, champion && `Auto for ${champion}`].filter(Boolean).join(" · "))}</small>
            </span>
            <button class="button" type="button" data-apply="${escapeHtml(preset.id)}">Apply</button>
            <button class="button remove" type="button" data-remove="${escapeHtml(preset.id)}" aria-label="Delete preset ${escapeHtml(preset.name)}">×</button>
          </div>`;
      })
      .join("");
  }

  const pageStyles = `
    .stacked { display: grid; gap: 8px; }
    .save-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; gap: 6px; }
    .save-row .text { width: auto; min-width: 0; }
    .save-note { margin: 0; font-size: 12px; }
    .save-note:empty { display: none; }
    .save-note.error { color: #e0675c; }
    .preset-list { display: grid; gap: 6px; padding: 11px 0; }
    .preset-row { display: flex; align-items: center; gap: 6px; padding: 6px 6px 6px 11px; border: 1px solid rgba(200, 170, 110, 0.14); border-radius: 7px; background: rgba(1, 10, 19, 0.35); }
    .preset-row .copy { flex: 1 1 auto; }
    .preset-row .copy strong, .preset-row .copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .preset-row .remove { width: 32px; padding: 7px 0; font-size: 15px; line-height: 1; }
    .preset-row .remove:hover { color: #e0675c; }
    .footnote { margin: 4px 0 0; font-size: 12px; }
  `;

  // The list of presets, drawn under the fields in the shared settings window.
  function renderPage(container) {
    container.innerHTML = `
      <style>${pageStyles}</style>
      <datalist id="rune-presets-champions"></datalist>
      <p class="heading">Presets</p>
      <div class="field stacked">
        <span class="copy"><strong>Save current page</strong><small>Optionally tag a champion to apply it automatically when you lock them in.</small></span>
        <div class="save-row">
          <input class="text" type="text" data-name maxlength="${maxNameLength}" placeholder="Preset name" aria-label="Preset name" />
          <input class="text" type="text" data-champion list="rune-presets-champions" placeholder="Champion (optional)" aria-label="Champion" spellcheck="false" />
          <button class="button primary" type="button" data-save>Save</button>
        </div>
        <p class="save-note muted" data-save-note></p>
      </div>
      <div class="preset-list" data-presets>${presetRows()}</div>
      <p class="footnote muted">Applies into a rune page named <strong>${escapeHtml(pagePrefix)}…</strong><span data-usage></span></p>`;

    const list = container.querySelector("[data-presets]");
    const page = { refresh: () => (list.innerHTML = presetRows()) };
    openPage = page;

    // Champion and style names arrive a moment later; fill them in if the page is still open.
    Promise.all([
      loadNames(),
      Promise.all([lcu(`${perksApi}/pages`), lcu(`${perksApi}/inventory`)]).catch(() => undefined),
    ]).then(([, usage]) => {
      if (openPage !== page) return;
      const names = [...championNames.values()].sort((a, b) => a.localeCompare(b));
      container.querySelector("#rune-presets-champions").innerHTML = names.map((name) => `<option value="${escapeHtml(name)}"></option>`).join("");
      if (usage) {
        const [pages, inventory] = usage;
        container.querySelector("[data-usage]").textContent = ` · ${pages.filter((entry) => entry.isDeletable).length} of ${inventory.ownedPageCount} rune pages used`;
      }
      page.refresh();
    });

    const nameInput = container.querySelector("[data-name]");
    const championInput = container.querySelector("[data-champion]");
    const note = container.querySelector("[data-save-note]");
    container.querySelector("[data-save]").addEventListener("click", async () => {
      const championId = championIdByName(championInput.value);
      if (championId === undefined) {
        note.textContent = `"${championInput.value}" isn't a champion name.`;
        note.classList.add("error");
        return;
      }
      note.textContent = "";
      note.classList.remove("error");
      if (await saveCurrentPage(nameInput.value, championId)) {
        nameInput.value = "";
        championInput.value = "";
      }
    });

    // Rows are re-rendered, so their clicks are delegated from the list.
    list.addEventListener("click", (event) => {
      const apply = event.target.closest("[data-apply]");
      const remove = event.target.closest("[data-remove]");
      if (apply) {
        const preset = presets.find((entry) => entry.id === apply.getAttribute("data-apply"));
        if (preset) applyPreset(preset);
      } else if (remove) {
        savePresets(presets.filter((entry) => entry.id !== remove.getAttribute("data-remove")));
      }
    });
    nameInput.focus();
  }

  function bindCommandBar() {
    if (commandBound || typeof window.CommandBar?.addAction !== "function") return;
    commandBound = true;
    window.CommandBar.addAction({
      name: "Rune presets",
      group: "runes",
      tags: ["runes", "rune page", "presets", "perks", "settings"],
      perform: () => settings.open(),
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
    settings = defineSettings();
    const socket = context?.socket || window.socket;
    socket?.observe?.(sessionApi, (event) => {
      onSession(event?.eventType === "Delete" ? undefined : event?.data).catch((error) => console.error("[rune-presets]", error));
    });
  };

  exports.load = function load() {
    bindCommandBar();
  };
})();
