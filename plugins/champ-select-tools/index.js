/**
 * @description A compact champ select HUD with the phase timer, auto pick and ban, random skin, ARAM reroll and a guarded dodge button.
 * @author steel
 * @link https://github.com/steele123/maoloader
 */
(function () {
  const pluginName = "champ-select-tools";
  const hostId = "maoloader-champ-select-tools";
  const settingsHostId = "maoloader-champ-select-settings";
  const stylesheetId = "maoloader-champ-select-tools-styles";
  const settingsKey = "champ-select-tools.settings";
  const sessionApi = "/lol-champ-select/v1/session";
  const dodgeConfirmMs = 3000;
  const banDelayMs = 1500;
  const roles = ["top", "jungle", "middle", "bottom", "utility", "any"];
  const roleLabels = { top: "Top", jungle: "Jungle", middle: "Mid", bottom: "Bot", utility: "Support", any: "Any role" };
  const emptyPicks = () => Object.fromEntries(roles.map((role) => [role, [0, 0]]));
  const emptyBans = () => Object.fromEntries(roles.map((role) => [role, 0]));
  const defaults = {
    hud: true,
    collapsed: false,
    position: null,
    autoEnabled: false,
    autoHover: true,
    autoBan: true,
    autoLock: true,
    lockDelaySeconds: 3,
    picks: emptyPicks(),
    bans: emptyBans(),
  };
  const phaseLabels = {
    PLANNING: "Planning",
    BAN_PICK: "Bans and picks",
    FINALIZATION: "Finalization",
    GAME_STARTING: "Game starting",
  };
  const positionLabels = { top: "Top", jungle: "Jungle", middle: "Mid", bottom: "Bot", utility: "Support" };
  let pluginRoot = pluginName;
  let settings = loadSettings();
  let session;
  let sessionReceivedAt = 0;
  let championNames;
  let tickTimer = 0;
  let dodgeArmedUntil = 0;
  let dodgeTimer = 0;
  let busy = false;
  let commandBound = false;
  // Per champ select: which actions automation already handled, and what is pickable or bannable.
  let auto = freshAutoState();

  function freshAutoState() {
    return {
      gameId: undefined,
      hovered: new Set(),
      banned: new Set(),
      lockScheduled: new Set(),
      lockTimers: new Map(),
      skipped: new Set(),
      pickable: undefined,
      bannable: undefined,
    };
  }

  function championId(value) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : 0;
  }

  function loadSettings() {
    const stored = window.DataStore?.get?.(settingsKey, {});
    const merged = { ...defaults, ...(stored && typeof stored === "object" ? stored : {}) };
    merged.hud = Boolean(merged.hud);
    merged.collapsed = Boolean(merged.collapsed);
    const position = merged.position;
    merged.position = position && Number.isFinite(position.x) && Number.isFinite(position.y) ? position : null;
    merged.autoEnabled = Boolean(merged.autoEnabled);
    merged.autoHover = Boolean(merged.autoHover);
    merged.autoBan = Boolean(merged.autoBan);
    merged.autoLock = Boolean(merged.autoLock);
    merged.lockDelaySeconds = Math.min(10, Math.max(0, Number(merged.lockDelaySeconds) || 0));
    const picks = merged.picks && typeof merged.picks === "object" ? merged.picks : {};
    const bans = merged.bans && typeof merged.bans === "object" ? merged.bans : {};
    merged.picks = Object.fromEntries(roles.map((role) => [role, [0, 1].map((index) => championId(picks[role]?.[index]))]));
    merged.bans = Object.fromEntries(roles.map((role) => [role, championId(bans[role])]));
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

  async function lcu(path, options) {
    const response = await fetch(path, options);
    if (!response.ok) throw new Error(`${options?.method || "GET"} ${path} failed with ${response.status}`);
    const text = await response.text();
    return text ? JSON.parse(text) : undefined;
  }

  async function loadChampionNames() {
    if (championNames?.size) return championNames;
    try {
      const summary = await lcu("/lol-game-data/assets/v1/champion-summary.json");
      championNames = new Map(summary.filter((champion) => champion.id > 0).map((champion) => [champion.id, champion.name]));
    } catch {
      championNames = new Map();
    }
    return championNames;
  }

  function championIdByName(name) {
    const wanted = String(name || "").trim().toLowerCase();
    if (!wanted) return 0;
    for (const [id, championName] of championNames || []) {
      if (championName.toLowerCase() === wanted) return id;
    }
    return undefined;
  }

  function me() {
    return session?.myTeam?.find((player) => player.cellId === session.localPlayerCellId);
  }

  function myActions() {
    const cellId = session?.localPlayerCellId;
    return (session?.actions || []).flat().filter((action) => action.actorCellId === cellId);
  }

  function remainingMs() {
    const timer = session?.timer;
    if (!timer || timer.isInfinite) return undefined;
    return Math.max(0, Number(timer.adjustedTimeLeftInPhase || 0) - (Date.now() - sessionReceivedAt));
  }

  function formatClock(ms) {
    if (ms === undefined) return "--";
    const seconds = Math.ceil(ms / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  }

  function championName(id) {
    return championNames?.get(id) || (id > 0 ? `Champion ${id}` : "");
  }

  function status() {
    const player = me();
    const actions = myActions();
    const active = actions.find((action) => action.isInProgress && !action.completed);
    const pickedId = actions.find((action) => action.type === "pick" && action.completed)?.championId || player?.championId || 0;
    const hoverId = player?.championPickIntent || active?.championId || 0;

    if (active?.type === "ban") return { text: "Your turn to ban", urgent: true };
    if (active?.type === "pick") {
      return { text: hoverId ? `Your turn: ${championName(hoverId)}` : "Your turn to pick", urgent: true };
    }
    if (pickedId) return { text: `Playing ${championName(pickedId)}`, urgent: false };
    if (hoverId) return { text: `Hovering ${championName(hoverId)}`, urgent: false };
    return { text: "Waiting for your turn", urgent: false };
  }

  function canPickSkin() {
    const player = me();
    return Boolean(player?.championId) && myActions().every((action) => action.type !== "pick" || action.completed);
  }

  // Champions nobody can take any more, plus teammates' hovers so we never ban or snipe them.
  function takenChampions() {
    const taken = new Set();
    for (const action of (session?.actions || []).flat()) {
      if (action.completed && action.championId) taken.add(action.championId);
    }
    for (const id of [...(session?.bans?.myTeamBans || []), ...(session?.bans?.theirTeamBans || [])]) taken.add(id);
    for (const player of [...(session?.myTeam || []), ...(session?.theirTeam || [])]) {
      if (player.championId) taken.add(player.championId);
    }
    const teammateHovers = new Set(
      (session?.myTeam || []).filter((player) => player.cellId !== session.localPlayerCellId && player.championPickIntent).map((player) => player.championPickIntent),
    );
    return { taken, teammateHovers };
  }

  function rolePreferences() {
    const role = me()?.assignedPosition || "any";
    const forRole = settings.picks[role] || [0, 0];
    const picks = [...forRole, ...settings.picks.any].filter(Boolean);
    const ban = settings.bans[role] || settings.bans.any;
    return { picks: [...new Set(picks)], ban };
  }

  function firstAvailablePick() {
    const { taken, teammateHovers } = takenChampions();
    return rolePreferences().picks.find(
      (id) => !taken.has(id) && !teammateHovers.has(id) && (!auto.pickable || auto.pickable.has(id)),
    );
  }

  async function loadAvailability() {
    if (auto.pickable && auto.bannable) return;
    try {
      const [pickable, bannable] = await Promise.all([
        lcu(`${sessionApi.replace("/session", "")}/pickable-champion-ids`),
        lcu(`${sessionApi.replace("/session", "")}/bannable-champion-ids`),
      ]);
      auto.pickable = new Set(Array.isArray(pickable) ? pickable : []);
      auto.bannable = new Set(Array.isArray(bannable) ? bannable : []);
    } catch (error) {
      console.warn("[champ-select-tools] Could not read pickable champions.", error);
    }
  }

  async function patchAction(action, championIdValue, complete) {
    await lcu(`${sessionApi}/actions/${action.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ championId: championIdValue }),
    });
    if (complete) await lcu(`${sessionApi}/actions/${action.id}/complete`, { method: "POST" });
  }

  function currentAction(id) {
    return (session?.actions || []).flat().find((action) => action.id === id);
  }

  async function autoHover(action) {
    auto.hovered.add(action.id);
    const pick = firstAvailablePick();
    if (!pick) return;
    try {
      await patchAction(action, pick, false);
    } catch (error) {
      console.warn("[champ-select-tools] Auto hover failed.", error);
    }
  }

  function autoBanAction(action) {
    auto.banned.add(action.id);
    window.setTimeout(async () => {
      const live = currentAction(action.id);
      if (!live || live.completed || !live.isInProgress) return;
      const { ban } = rolePreferences();
      if (!ban) return;
      const { taken, teammateHovers } = takenChampions();
      if (taken.has(ban) || teammateHovers.has(ban) || (auto.bannable && !auto.bannable.has(ban))) {
        toast("info", `${championName(ban)} can't be banned. Ban manually.`, { duration: 3500 });
        return;
      }
      try {
        await patchAction(live, ban, true);
        toast("success", `Banned ${championName(ban)}.`, { duration: 2500 });
      } catch (error) {
        console.error("[champ-select-tools]", error);
        toast("error", "Auto ban failed. Ban manually.");
      }
    }, banDelayMs);
  }

  function scheduleLock(action) {
    const delay = Math.round(settings.lockDelaySeconds * 1000);
    auto.lockScheduled.add(action.id);
    const lockIn = async () => {
      auto.lockTimers.delete(action.id);
      const live = currentAction(action.id);
      if (!live || live.completed || !live.isInProgress || auto.skipped.has(action.id)) return;
      // Lock whatever is hovered now, so a manual change during the delay wins.
      const { taken } = takenChampions();
      const hovered = live.championId && !taken.has(live.championId) ? live.championId : 0;
      const pick = hovered || firstAvailablePick();
      if (!pick) {
        toast("warning", "None of your picks are available. Pick manually.", { duration: 4000 });
        return;
      }
      try {
        await patchAction(live, pick, true);
        toast("success", `Locked in ${championName(pick)}.`, { duration: 2500 });
      } catch (error) {
        console.error("[champ-select-tools]", error);
        toast("error", "Auto lock failed. Lock in manually.");
      }
    };

    const preview = currentAction(action.id)?.championId || firstAvailablePick();
    auto.lockTimers.set(action.id, window.setTimeout(lockIn, delay));
    if (delay > 0) {
      toast("info", {
        title: "Your turn to pick",
        description: preview ? `Locking ${championName(preview)} in ${settings.lockDelaySeconds}s.` : `Locking in ${settings.lockDelaySeconds}s.`,
        duration: delay,
        action: {
          label: "Don't lock",
          onClick: () => {
            window.clearTimeout(auto.lockTimers.get(action.id));
            auto.lockTimers.delete(action.id);
            auto.skipped.add(action.id);
          },
        },
      });
    }
  }

  function resetAutomation(gameId) {
    for (const timer of auto.lockTimers.values()) window.clearTimeout(timer);
    auto = freshAutoState();
    auto.gameId = gameId;
  }

  async function runAutomation() {
    if (!session) {
      resetAutomation(undefined);
      return;
    }
    if (auto.gameId !== session.gameId) resetAutomation(session.gameId);
    if (!settings.autoEnabled) return;

    const actions = myActions().filter((action) => !action.completed);
    if (!actions.length) return;
    await loadAvailability();

    for (const action of actions) {
      if (action.type === "ban" && action.isInProgress && settings.autoBan && !auto.banned.has(action.id)) {
        autoBanAction(action);
      }
      if (action.type === "pick") {
        if (settings.autoHover && !action.championId && !auto.hovered.has(action.id)) await autoHover(action);
        if (action.isInProgress && settings.autoLock && !auto.lockScheduled.has(action.id)) {
          scheduleLock(action);
        }
      }
    }
  }

  // Keep the surface hidden until its stylesheet applies, so it never flashes unstyled.
  function revealWhenStyled(element) {
    const link = element.shadowRoot.getElementById(stylesheetId);
    // data-ready turns on transitions two frames later, so styles arriving don't animate in.
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

  function hud() {
    return host()?.shadowRoot;
  }

  function placeHost(element) {
    if (settings.position) {
      const x = Math.min(Math.max(0, settings.position.x), Math.max(0, window.innerWidth - 120));
      const y = Math.min(Math.max(0, settings.position.y), Math.max(0, window.innerHeight - 48));
      element.style.left = `${x}px`;
      element.style.top = `${y}px`;
      element.style.right = "auto";
    } else {
      element.style.left = "auto";
      element.style.top = "88px";
      element.style.right = "16px";
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

  function mountHud() {
    if (host()) return;
    const element = document.createElement("maoloader-champ-select-tools");
    element.id = hostId;
    element.style.cssText = "position:fixed;z-index:2147483640;display:block;width:248px;";
    placeHost(element);
    const root = element.attachShadow({ mode: "open" });
    root.innerHTML = `
      <link id="${stylesheetId}" rel="stylesheet" href="https://plugins/${pluginRoot}/styles.css" />
      <section class="hud" aria-label="Champ select tools">
        <header class="hud-header" data-handle title="Drag to move. Double-click to reset.">
          <span class="hud-phase" data-phase></span>
          <span class="hud-auto" data-auto title="Auto pick and ban is on">Auto</span>
          <span class="hud-position" data-position></span>
          <button class="hud-icon" type="button" data-settings aria-label="Auto pick and ban settings" title="Auto pick and ban">⚙</button>
          <button class="hud-icon" type="button" data-collapse aria-label="Collapse"></button>
        </header>
        <div class="hud-body">
          <div class="hud-clock" data-clock>--</div>
          <div class="hud-status" data-status></div>
          <div class="hud-actions">
            <button class="hud-button" type="button" data-skin>Random skin</button>
            <button class="hud-button" type="button" data-reroll hidden>Reroll</button>
            <button class="hud-button is-danger" type="button" data-dodge>Dodge</button>
          </div>
        </div>
      </section>`;
    revealWhenStyled(element);
    document.body.appendChild(element);

    bindDrag(element, root.querySelector("[data-handle]"));
    root.querySelector("[data-collapse]").addEventListener("click", () => {
      saveSettings({ collapsed: !settings.collapsed });
      update();
    });
    root.querySelector("[data-settings]").addEventListener("click", openSettings);
    root.querySelector("[data-skin]").addEventListener("click", randomSkin);
    root.querySelector("[data-reroll]").addEventListener("click", reroll);
    root.querySelector("[data-dodge]").addEventListener("click", dodge);
  }

  function unmountHud() {
    host()?.remove();
    window.clearInterval(tickTimer);
    tickTimer = 0;
    disarmDodge();
  }

  function update() {
    if (!session || !settings.hud) {
      unmountHud();
      return;
    }

    mountHud();
    const root = hud();
    const player = me();
    const current = status();
    const remaining = remainingMs();
    const rerolls = Number(session.rerollsRemaining || 0);

    root.querySelector(".hud").classList.toggle("is-collapsed", settings.collapsed);
    root.querySelector(".hud").classList.toggle("is-urgent", current.urgent);
    root.querySelector("[data-collapse]").textContent = settings.collapsed ? "+" : "−";
    root.querySelector("[data-collapse]").setAttribute("aria-label", settings.collapsed ? "Expand" : "Collapse");
    root.querySelector("[data-phase]").textContent = settings.collapsed
      ? `${formatClock(remaining)} · ${phaseLabels[session.timer?.phase] || "Champ select"}`
      : phaseLabels[session.timer?.phase] || "Champ select";
    root.querySelector("[data-position]").textContent = positionLabels[player?.assignedPosition] || "";
    root.querySelector("[data-auto]").hidden = !settings.autoEnabled;
    root.querySelector("[data-clock]").textContent = formatClock(remaining);
    root.querySelector("[data-clock]").classList.toggle("is-low", remaining !== undefined && remaining <= 10000);
    root.querySelector("[data-status]").textContent = current.text;
    root.querySelector("[data-skin]").disabled = busy || !canPickSkin();

    const rerollButton = root.querySelector("[data-reroll]");
    rerollButton.hidden = !session.benchEnabled && rerolls === 0;
    rerollButton.disabled = busy || rerolls === 0;
    rerollButton.textContent = `Reroll (${rerolls})`;

    const dodgeButton = root.querySelector("[data-dodge]");
    const armed = Date.now() < dodgeArmedUntil;
    dodgeButton.textContent = armed ? "Click to confirm" : "Dodge";
    dodgeButton.classList.toggle("is-armed", armed);

    if (!tickTimer) tickTimer = window.setInterval(update, 250);
  }

  function onSession(next) {
    session = next && Array.isArray(next.myTeam) ? next : undefined;
    sessionReceivedAt = Date.now();
    if (session) loadChampionNames().then(() => update());
    update();
    runAutomation().catch((error) => console.error("[champ-select-tools] Automation failed.", error));
  }

  async function runAction(action) {
    if (busy) return;
    busy = true;
    update();
    try {
      await action();
    } finally {
      busy = false;
      update();
    }
  }

  function randomSkin() {
    return runAction(async () => {
      try {
        const skins = await lcu("/lol-champ-select/v1/skin-carousel-skins");
        const current = me()?.selectedSkinId;
        const owned = (Array.isArray(skins) ? skins : []).filter((skin) => skin.unlocked && !skin.disabled);
        const choices = owned.length > 1 ? owned.filter((skin) => skin.id !== current) : owned;
        if (!choices.length) {
          toast("info", "You don't own any other skins for this champion.", { duration: 3000 });
          return;
        }
        const skin = choices[Math.floor(Math.random() * choices.length)];
        await lcu(`${sessionApi}/my-selection`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ selectedSkinId: skin.id }),
        });
        toast("success", `Skin: ${skin.name}`, { duration: 2500 });
      } catch (error) {
        console.error("[champ-select-tools]", error);
        toast("error", "Could not change your skin.");
      }
    });
  }

  function reroll() {
    return runAction(async () => {
      try {
        await lcu(`${sessionApi}/my-selection/reroll`, { method: "POST" });
      } catch (error) {
        console.error("[champ-select-tools]", error);
        toast("error", "Could not reroll.");
      }
    });
  }

  function disarmDodge() {
    dodgeArmedUntil = 0;
    window.clearTimeout(dodgeTimer);
    dodgeTimer = 0;
  }

  function dodge() {
    if (Date.now() >= dodgeArmedUntil) {
      dodgeArmedUntil = Date.now() + dodgeConfirmMs;
      window.clearTimeout(dodgeTimer);
      dodgeTimer = window.setTimeout(() => {
        disarmDodge();
        update();
      }, dodgeConfirmMs);
      update();
      return undefined;
    }

    disarmDodge();
    return runAction(async () => {
      const params = new URLSearchParams({
        destination: "lcdsServiceProxy",
        method: "call",
        args: JSON.stringify(["", "teambuilder-draft", "quitV2", ""]),
      });
      try {
        await lcu(`/lol-login/v1/session/invoke?${params.toString()}`, { method: "POST" });
        toast("warning", "You left champ select.", { duration: 3000 });
      } catch (error) {
        console.error("[champ-select-tools]", error);
        toast("error", "Could not dodge.");
      }
    });
  }

  async function checkCurrentSession() {
    try {
      onSession(await lcu(sessionApi));
    } catch {
      // Not in champ select.
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function closeSettings() {
    document.getElementById(settingsHostId)?.remove();
  }

  function switchField(key, label, description) {
    return `
      <label class="field">
        <span class="field-copy"><strong>${label}</strong><small>${description}</small></span>
        <span class="switch"><input type="checkbox" data-toggle="${key}" ${settings[key] ? "checked" : ""} /><span></span></span>
      </label>`;
  }

  function championInput(role, slot, value, label) {
    return `<input class="text-input champion-input" list="champion-names" data-role="${role}" data-slot="${slot}" value="${escapeHtml(
      value ? championName(value) : "",
    )}" placeholder="${slot === "ban" ? "Ban" : "Pick"}" aria-label="${roleLabels[role]} ${label}" spellcheck="false" />`;
  }

  async function openSettings() {
    await loadChampionNames();
    let element = document.getElementById(settingsHostId);
    if (!element) {
      element = document.createElement("maoloader-champ-select-settings");
      element.id = settingsHostId;
      element.style.cssText = "position:fixed;inset:0;z-index:2147483646;display:flex;pointer-events:none;";
      element.attachShadow({ mode: "open" });
      document.body.appendChild(element);
    }

    const root = element.shadowRoot;
    const names = [...(championNames?.values() || [])].sort((a, b) => a.localeCompare(b));
    root.innerHTML = `
      <link id="${stylesheetId}" rel="stylesheet" href="https://plugins/${pluginRoot}/settings.css" />
      <datalist id="champion-names">${names.map((name) => `<option value="${escapeHtml(name)}"></option>`).join("")}</datalist>
      <div class="sheet-backdrop">
        <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
          <header class="sheet-header">
            <img src="https://plugins/${pluginRoot}/assets/icon.svg" alt="" width="32" height="32" />
            <div class="sheet-title"><h1 id="sheet-title">Auto pick and ban</h1><span>Champ select automation</span></div>
            <button class="sheet-close" type="button" data-close aria-label="Close">×</button>
          </header>
          <div class="sheet-body">
            ${switchField("autoEnabled", "Auto pick and ban", "Master switch for everything below.")}
            ${switchField("autoHover", "Hover my pick", "Shows your first available pick to the team early.")}
            ${switchField("autoBan", "Ban for me", "Bans your role's ban when it's your turn.")}
            ${switchField("autoLock", "Lock in for me", "Locks your hovered champion when it's your turn.")}
            <div class="field">
              <span class="field-copy"><strong>Lock delay</strong><small>Time to change or cancel before it locks.</small></span>
              <span class="range-row">
                <input type="range" min="0" max="10" step="0.5" value="${settings.lockDelaySeconds}" data-delay aria-label="Lock delay in seconds" />
                <span class="field-value" data-delay-value>${settings.lockDelaySeconds}s</span>
              </span>
            </div>
            <div class="field is-stacked">
              <span class="field-copy"><strong>Champions</strong><small>Your assigned role is used first, then Any role. Leave blank to skip.</small></span>
              <div class="role-grid">
                <span></span><span class="grid-head">Pick 1</span><span class="grid-head">Pick 2</span><span class="grid-head">Ban</span>
                ${roles
                  .map(
                    (role) => `
                      <span class="role-label">${roleLabels[role]}</span>
                      ${championInput(role, 0, settings.picks[role][0], "first pick")}
                      ${championInput(role, 1, settings.picks[role][1], "second pick")}
                      ${championInput(role, "ban", settings.bans[role], "ban")}`,
                  )
                  .join("")}
              </div>
              <p class="field-note" data-champion-note></p>
            </div>
          </div>
          <footer class="sheet-footer"><span>Saved automatically</span><span>Picks you don't own are skipped</span></footer>
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
    root.querySelectorAll("[data-toggle]").forEach((input) => {
      input.addEventListener("change", () => {
        saveSettings({ [input.getAttribute("data-toggle")]: input.checked });
        update();
        runAutomation().catch(() => {});
      });
    });
    const delay = root.querySelector("[data-delay]");
    delay.addEventListener("input", () => {
      root.querySelector("[data-delay-value]").textContent = `${delay.value}s`;
    });
    delay.addEventListener("change", () => saveSettings({ lockDelaySeconds: Number(delay.value) }));

    const note = root.querySelector("[data-champion-note]");
    root.querySelectorAll(".champion-input").forEach((input) => {
      input.addEventListener("change", () => {
        const id = championIdByName(input.value);
        input.classList.toggle("is-invalid", id === undefined);
        if (id === undefined) {
          note.textContent = `"${input.value}" isn't a champion name.`;
          note.classList.add("is-error");
          return;
        }
        note.textContent = "";
        note.classList.remove("is-error");
        input.value = id ? championName(id) : "";
        const role = input.getAttribute("data-role");
        const slot = input.getAttribute("data-slot");
        if (slot === "ban") {
          saveSettings({ bans: { ...settings.bans, [role]: id } });
        } else {
          const picks = [...settings.picks[role]];
          picks[Number(slot)] = id;
          saveSettings({ picks: { ...settings.picks, [role]: picks } });
        }
      });
    });
    root.querySelector("[data-toggle]").focus();
  }

  function bindCommandBar() {
    if (commandBound || typeof window.CommandBar?.addAction !== "function") return;
    commandBound = true;
    window.CommandBar.addAction({
      name: "Auto pick and ban settings",
      group: "champ select",
      tags: ["champ select", "pick", "ban", "lock", "auto"],
      perform: openSettings,
    });
    window.CommandBar.addAction({
      name: () => (settings.autoEnabled ? "Turn off auto pick and ban" : "Turn on auto pick and ban"),
      group: "champ select",
      tags: ["champ select", "pick", "ban", "auto"],
      perform: () => {
        saveSettings({ autoEnabled: !settings.autoEnabled });
        update();
        toast("info", settings.autoEnabled ? "Auto pick and ban is on." : "Auto pick and ban is off.", { duration: 2500 });
      },
    });
    window.CommandBar.addAction({
      name: () => (settings.hud ? "Hide champ select HUD" : "Show champ select HUD"),
      group: "champ select",
      tags: ["champ select", "dodge", "skin", "timer", "hud"],
      perform: () => {
        saveSettings({ hud: !settings.hud });
        update();
        if (!session) toast("info", settings.hud ? "The HUD will show in champ select." : "Champ select HUD hidden.", { duration: 2500 });
      },
    });
    window.CommandBar.addAction({
      name: "Reset champ select HUD position",
      group: "champ select",
      tags: ["hud", "move"],
      perform: () => {
        saveSettings({ position: null });
        if (host()) placeHost(host());
      },
    });
  }

  exports.init = function init(context) {
    if (context?.meta?.name) pluginRoot = context.meta.name;
    const socket = context?.socket || window.socket;
    socket?.observe?.(sessionApi, (event) => onSession(event?.eventType === "Delete" ? undefined : event?.data));
  };

  exports.load = function load() {
    bindCommandBar();
    checkCurrentSession();
  };
})();
