/**
 * @description A countdown for your champ select dodge lockout, a heads-up when it's over, and a reminder of how recently you dodged before you do it again.
 * @author maoloader
 * @link https://github.com/steele123/maoloader
 */
(function () {
  const pluginName = "dodge-timer";
  const settingsKey = "dodge-timer.settings";
  const stateKey = "dodge-timer.state";
  const searchStateApi = "/lol-lobby/v2/lobby/matchmaking/search-state";
  const searchApi = "/lol-matchmaking/v1/search";
  const phaseApi = "/lol-gameflow/v1/gameflow-phase";
  const pillId = "maoloader-dodge-timer";
  const HOUR = 3600 * 1000;
  const DAY = 24 * HOUR;
  const defaults = {
    showTimer: true,
    notifyWhenOver: true,
    sound: true,
    champSelectReminder: true,
    autoQueue: false,
  };
  let pluginRoot = pluginName;
  let settings;
  let commandBound = false;
  let me;
  let endTimer;
  let tickTimer;
  let pageContainer;
  let audio;
  let lastSeconds;
  let champSelectSince = false;

  // { endsAt, self, history: [{ at, minutes, self }] }; at is when the lockout was first seen.
  let state = loadState();

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

  function loadState() {
    const stored = window.DataStore?.get?.(stateKey);
    const history = Array.isArray(stored?.history) ? stored.history.filter((entry) => Number.isFinite(entry?.at)) : [];
    return { endsAt: Number(stored?.endsAt) || 0, self: stored?.self !== false, history };
  }

  function saveState() {
    // A week of dodges is plenty for the reminder and the list.
    state.history = state.history.filter((entry) => Date.now() - entry.at < 7 * DAY).slice(-30);
    window.DataStore?.set?.(stateKey, state);
  }

  const active = () => state.endsAt > Date.now();

  function clock(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = String(total % 60).padStart(2, "0");
    return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
  }

  function duration(minutes) {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.round(minutes / 6) / 10;
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }

  function ago(at) {
    const minutes = Math.round((Date.now() - at) / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} h ago`;
    const days = Math.round(hours / 24);
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }

  // ---- Reading the lockout ----

  // The client reports a dodge lockout as a QUEUE_DODGER error on matchmaking, with the seconds left.
  function lockoutFrom(data) {
    const errors = Array.isArray(data?.errors) ? data.errors : [];
    const dodge = errors.find((error) => error?.errorType === "QUEUE_DODGER" && Number(error.penaltyTimeRemaining) > 0);
    if (!dodge) return undefined;
    return { seconds: Number(dodge.penaltyTimeRemaining), summonerId: dodge.penalizedSummonerId };
  }

  async function currentSummonerId() {
    if (me === undefined) {
      try {
        me = (await lcu("/lol-summoner/v1/current-summoner"))?.summonerId ?? null;
      } catch {
        return null;
      }
    }
    return me;
  }

  async function onMatchmaking(data) {
    const lockout = lockoutFrom(data);
    if (!lockout) return;
    // The client repeats the same lockout in every update, sometimes with the seconds it started
    // with. Only a lockout seen after a champ select (or with none running) is a new dodge.
    const fresh = !active() || champSelectSince;
    if (!fresh && lockout.seconds === lastSeconds) return;
    lastSeconds = lockout.seconds;
    state.endsAt = Date.now() + lockout.seconds * 1000;
    if (fresh) {
      champSelectSince = false;
      const id = await currentSummonerId();
      state.self = !lockout.summonerId || !id || lockout.summonerId === id;
      state.history.push({ at: Date.now(), minutes: Math.max(1, Math.round(lockout.seconds / 60)), self: state.self });
    }
    saveState();
    schedule(true);
  }

  async function checkNow() {
    for (const path of [searchStateApi, searchApi]) {
      try {
        await onMatchmaking(await lcu(path));
      } catch {
        // No lobby or no search; nothing to read here.
      }
    }
  }

  // ---- Timer ----

  function schedule(full) {
    window.clearTimeout(endTimer);
    window.clearInterval(tickTimer);
    renderPill();
    renderPage(full);
    if (!active()) return;
    tickTimer = window.setInterval(() => {
      renderPill();
      renderPage();
    }, 1000);
    endTimer = window.setTimeout(() => onLockoutOver(), state.endsAt - Date.now() + 500);
  }

  async function onLockoutOver() {
    window.clearInterval(tickTimer);
    // Ask the client before saying it's over, in case the lockout was extended.
    await checkNow();
    if (active()) return;
    renderPill();
    renderPage(true);
    if (!settings.get("notifyWhenOver")) return;
    if (settings.get("sound")) playChime();
    toast("success", state.self ? "Your dodge lockout is over. You can queue again." : "Your party's dodge lockout is over. You can queue again.", { duration: 6000 });
    if (settings.get("autoQueue")) startQueue();
  }

  // Only starts a search when you lead a lobby that can queue, so it never moves you anywhere.
  async function startQueue() {
    try {
      const [phase, lobby] = await Promise.all([lcu(phaseApi), lcu("/lol-lobby/v2/lobby")]);
      if (phase !== "Lobby" || !lobby?.localMember?.isLeader || lobby?.canStartActivity === false) return;
      await lcu("/lol-lobby/v2/lobby/matchmaking/search", { method: "POST" });
      toast("info", "Queue started.", { duration: 3000 });
    } catch (error) {
      console.warn("[dodge-timer] Couldn't start the queue.", error);
    }
  }

  function playChime() {
    try {
      audio ??= new AudioContext();
      if (audio.state === "suspended") audio.resume();
      const start = audio.currentTime + 0.02;
      [523.25, 783.99].forEach((frequency, index) => {
        const at = start + index * 0.16;
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(0.25, at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.45);
        oscillator.connect(gain).connect(audio.destination);
        oscillator.start(at);
        oscillator.stop(at + 0.5);
      });
    } catch (error) {
      console.warn("[dodge-timer] Could not play the sound.", error);
    }
  }

  // ---- Champ select reminder ----

  function recentDodges() {
    return state.history.filter((entry) => entry.self && Date.now() - entry.at < DAY);
  }

  function remindInChampSelect() {
    if (!settings.get("champSelectReminder")) return;
    const recent = recentDodges();
    const last = recent[recent.length - 1];
    if (!last) return;
    const count = recent.length === 1 ? "" : ` You've dodged ${recent.length} times today.`;
    toast("info", `You dodged ${ago(last.at)} (${duration(last.minutes)} lockout).${count} Dodging again soon gives a longer lockout.`, {
      duration: 7000,
    });
  }

  // ---- Countdown pill ----

  const PILL_STYLE = `
    #${pillId} {
      position: fixed; top: 6px; left: 112px; z-index: 9000;
      display: inline-flex; align-items: center; gap: 7px; height: 22px; padding: 0 10px 0 8px;
      border: 1px solid rgba(232, 64, 87, 0.45); border-radius: 999px;
      background: rgba(10, 14, 20, 0.88); color: #f0e6d2;
      font: 600 11px/1 "LoL Body", "Inter", system-ui, sans-serif; letter-spacing: 0.02em;
      cursor: pointer; -webkit-app-region: no-drag; user-select: none;
    }
    #${pillId}:hover { border-color: rgba(232, 64, 87, 0.8); }
    #${pillId} svg { width: 12px; height: 12px; color: #e84057; flex: none; }
    #${pillId} span { color: #a09b8c; text-transform: uppercase; font-size: 9.5px; letter-spacing: 0.08em; }
    #${pillId} strong { font-variant-numeric: tabular-nums; font-weight: 700; }
  `;
  const CLOCK_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/></svg>';

  function renderPill() {
    let pill = document.getElementById(pillId);
    if (!active() || !settings?.get("showTimer")) {
      pill?.remove();
      return;
    }
    if (!pill) {
      if (!document.getElementById(`${pillId}-style`)) {
        const style = document.createElement("style");
        style.id = `${pillId}-style`;
        style.textContent = PILL_STYLE;
        document.head.appendChild(style);
      }
      pill = document.createElement("div");
      pill.id = pillId;
      pill.setAttribute("role", "timer");
      pill.title = "Dodge Timer: click for details";
      pill.innerHTML = `${CLOCK_ICON}<span>Queue lockout</span><strong></strong>`;
      pill.addEventListener("click", () => settings.open());
      document.body.appendChild(pill);
    }
    pill.querySelector("strong").textContent = clock(state.endsAt - Date.now());
  }

  // ---- Settings page ----

  const PAGE_STYLE = `
    .dt { display: grid; gap: 14px; }
    .dt-status { display: flex; align-items: center; gap: 14px; padding: 14px 16px; border: 1px solid rgba(200, 170, 110, 0.18); border-radius: 10px; background: rgba(1, 10, 19, 0.45); }
    .dt-status.is-active { border-color: rgba(232, 64, 87, 0.45); }
    .dt-clock { font-size: 26px; font-weight: 800; font-variant-numeric: tabular-nums; color: #f0e6d2; }
    .dt-status p { margin: 0; color: #a09b8c; }
    .dt-status strong { color: #f0e6d2; }
    .dt-chips { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
    .dt-chip { padding: 9px 11px; border: 1px solid rgba(200, 170, 110, 0.14); border-radius: 8px; }
    .dt-chip span { display: block; color: #8c96a0; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
    .dt-chip strong { display: block; margin-top: 4px; color: #f0e6d2; font-size: 15px; }
    .dt-list { display: grid; gap: 2px; margin: 0; padding: 0; list-style: none; }
    .dt-list li { display: grid; grid-template-columns: 150px minmax(0, 1fr) auto; gap: 10px; padding: 5px 2px; border-bottom: 1px solid rgba(200, 170, 110, 0.08); font-variant-numeric: tabular-nums; }
    .dt-list time, .dt-list small { color: #8c96a0; }
  `;

  function renderPage(full) {
    const container = pageContainer;
    if (!container?.isConnected) return;
    const live = active();
    const clockEl = container.querySelector(".dt-clock");
    // Every second only the clock changes; keep the rest as it is.
    if (!full && live && clockEl) {
      clockEl.textContent = clock(state.endsAt - Date.now());
      return;
    }
    const recent = recentDodges();
    const mine = state.history.filter((entry) => entry.self);
    const last = mine[mine.length - 1];
    const week = mine.filter((entry) => Date.now() - entry.at < 7 * DAY).length;
    const status = live
      ? `<div class="dt-status is-active"><span class="dt-clock">${clock(state.endsAt - Date.now())}</span><p><strong>${
          state.self ? "You can't queue yet." : "Your party can't queue yet."
        }</strong><br />Ends at ${new Date(state.endsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.</p></div>`
      : `<div class="dt-status"><p><strong>No lockout.</strong> You can queue.</p></div>`;
    const rows = state.history
      .slice()
      .reverse()
      .map(
        (entry) => `<li>
          <time>${new Date(entry.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time>
          <span>${duration(entry.minutes)} lockout</span>
          <small>${entry.self ? "you" : "party member"}</small>
        </li>`,
      )
      .join("");
    container.innerHTML = `
      <style>${PAGE_STYLE}</style>
      <div class="dt">
        ${status}
        <div class="dt-chips">
          <div class="dt-chip"><span>Last 24 hours</span><strong>${recent.length} dodge${recent.length === 1 ? "" : "s"}</strong></div>
          <div class="dt-chip"><span>Last 7 days</span><strong>${week} dodge${week === 1 ? "" : "s"}</strong></div>
          <div class="dt-chip"><span>Last lockout</span><strong>${last ? `${duration(last.minutes)}, ${ago(last.at)}` : "–"}</strong></div>
        </div>
        ${rows ? `<ul class="dt-list">${rows}</ul>` : ""}
        <p class="muted">Each dodge soon after another gives a longer lockout, and Riot lowers it again after you go a while without dodging. The client doesn't show how close you are, so Dodge Timer keeps the dodges it sees here. Lockout lengths are as the client reported them when Dodge Timer first saw them.</p>
      </div>`;
  }

  // ---- Settings and commands ----

  function defineSettings() {
    if (typeof window.PluginSettings?.define === "function") {
      return window.PluginSettings.define({
        id: pluginName,
        title: "Dodge Timer",
        description: "A countdown for your dodge lockout, and how recently you dodged.",
        icon: `https://plugins/${pluginRoot}/assets/icon.svg`,
        storageKey: settingsKey,
        fields: [
          {
            key: "showTimer",
            type: "toggle",
            label: "Countdown at the top of the client",
            description: "A small timer while you can't queue. Click it to see this page.",
            default: defaults.showTimer,
          },
          {
            key: "notifyWhenOver",
            type: "toggle",
            label: "Tell me when it's over",
            description: "A toast when you can queue again.",
            default: defaults.notifyWhenOver,
          },
          { key: "sound", type: "toggle", label: "With a sound", default: defaults.sound, showIf: (values) => values.notifyWhenOver },
          {
            key: "autoQueue",
            type: "toggle",
            label: "Start the queue when it's over",
            description: "Only when you're the lobby leader and still in the lobby.",
            default: defaults.autoQueue,
            showIf: (values) => values.notifyWhenOver,
          },
          {
            key: "champSelectReminder",
            type: "toggle",
            label: "Remind me in champ select",
            description: "If you dodged in the last 24 hours, a toast when champ select starts says how long ago.",
            default: defaults.champSelectReminder,
          },
          {
            type: "button",
            label: "Clear dodge history",
            description: "Forgets the dodges listed below. A lockout that's running keeps counting down.",
            buttonLabel: "Clear",
            action: () => {
              state.history = [];
              saveState();
              renderPage(true);
              toast("success", "Dodge history cleared.", { duration: 2500 });
            },
          },
        ],
        page: {
          render(container) {
            pageContainer = container;
            renderPage(true);
          },
          destroy() {
            pageContainer = undefined;
          },
        },
      });
    }
    const stored = window.DataStore?.get?.(settingsKey, {});
    const values = { ...defaults, ...(stored && typeof stored === "object" ? stored : {}) };
    return {
      get: (key) => (key ? values[key] : { ...values }),
      onChange: () => () => {},
      open: () => toast("info", active() ? `Queue lockout: ${clock(state.endsAt - Date.now())} left.` : "No dodge lockout right now."),
    };
  }

  function bindCommandBar() {
    if (commandBound || typeof window.CommandBar?.addAction !== "function") return;
    commandBound = true;
    window.CommandBar.addAction({
      name: "Dodge timer",
      legend: () => (active() ? `${clock(state.endsAt - Date.now())} left` : "No lockout"),
      group: "queue",
      tags: ["dodge", "lockout", "penalty", "queue", "timer", "leaver"],
      perform: () => settings.open(),
    });
  }

  exports.init = function init(context) {
    if (context?.meta?.name) pluginRoot = context.meta.name;
    const socket = context?.socket || window.socket;
    settings = defineSettings();
    settings.onChange?.(() => renderPill());
    const read = (event) => (event?.eventType === "Delete" ? undefined : event?.data);
    socket?.observe?.(searchStateApi, (event) => onMatchmaking(read(event)));
    socket?.observe?.(searchApi, (event) => onMatchmaking(read(event)));
    socket?.observe?.(phaseApi, (event) => {
      if (event?.data === "ChampSelect") {
        champSelectSince = true;
        remindInChampSelect();
      }
      // Back in the lobby after champ select is when a fresh lockout shows up.
      if (event?.data === "Lobby" || event?.data === "None") window.setTimeout(() => checkNow(), 1500);
    });
  };

  exports.load = function load() {
    bindCommandBar();
    // A lockout outlives a client restart; pick it up again on load and whenever the client comes back.
    schedule();
    checkNow();
    window.addEventListener("focus", () => checkNow());
  };
})();
