/**
 * @description Hide names, status messages, chat and friend requests while you stream or record: one switch (Ctrl+Shift+H) for the whole client, maoloader's own screens, and optionally the game.
 * @author maoloader
 * @link https://github.com/steele123/maoloader
 */
(function () {
  const pluginName = "streamer-mode";
  const settingsKey = "streamer-mode.settings";
  const stateKey = "streamer-mode.state";
  const STYLE_ID = "maoloader-streamer-mode-styles";
  const BADGE_ID = "maoloader-streamer-badge";
  const COMPONENT_STYLE_ATTRIBUTE = "data-maoloader-streamer-style";
  // Set on <html> while streamer mode is on, to "blur" or "bars". Any plugin can style against it.
  const FLAG = "data-maoloader-streamer";
  const gameSettingsApi = "/lol-game-settings/v1/game-settings";
  const defaults = {
    enabled: false,
    look: "blur",
    hideStatuses: true,
    hideChat: true,
    hideRequests: true,
    inGameNames: false,
    showBadge: true,
  };

  // Everywhere the client writes a player's name or Riot ID: your own card, the friends list, hover
  // cards, chat, lobby, champ select, profiles and scoreboards. Most go through Riot's name component.
  const NAMES = [
    ".player-name-component",
    ".player-name-wrapper",
    ".player-name",
    "[class*='summoner-name']",
    ".member-name",
    ".social-member-name",
    ".hover-card-name",
    "[class*='hover-card-game-tag']",
    // The tooltip with your full Riot ID when you hover a name (your profile, for one), and the
    // other places a tagline shows: match details, friends, blocked players, hover cards.
    // Who's in a friend's open lobby, on their hover card.
    "[class*='open-party-summoners']",
    // A game's scoreboard in match history. The same class holds the queue name in the match list,
    // so only the one inside a game's team list counts.
    ".match-details-team-list .player-history-mode",
    // Exact classes here: broader patterns would also catch the profile search's Tagline box.
    "[class*='player-name__tooltip']",
    ".player-name__tag-line",
    ".acs-riot-id",
    ".member-tagline",
    ".member-game-name-tagline",
    ".blocked-player-game-name-tagline",
    ".hover-card-inline-game-tag",
    ".social-profile-name",
    // Linked Discord accounts (hover cards, profiles); not the Discord icons.
    "[class*='discord-id']",
    "[class*='discord-text']",
    "[class*='discord-name']",
    ".conversation-title",
    ".create-panel-game-name",
    ".create-panel-game-tag",
    ".game-invite-name",
    // Who invited you, on the Game Invites card at the top of the right panel.
    ".parties-game-invite-name",
    "[class*='inviter']",
  ];
  // These draw their text inside a sealed component, where text styles can't reach; they get blurred whole.
  const SEALED_NAMES = ["lol-uikit-player-name", ".chat-header .chat-name-info"];
  const STATUSES = [".status-message-quoted", "[class*='hover-card-status']"];
  // Chat messages are drawn inside frames; the frame as a whole gets blurred.
  const CHAT = ["iframe#chat-messages-frame", "iframe#embedded-messages-frame", ".conversation-subtitle"];
  const REQUESTS = [".lol-social-friend-requests"];

  let pluginRoot = pluginName;
  let settings;
  let state = loadState();
  let scanTimer = 0;
  let observer;
  let commandBound = false;

  function toast(kind, message, options) {
    const api = window.Toast;
    const show = api?.[kind] || api?.info || api?.show;
    return typeof show === "function" ? show(message, options) : undefined;
  }

  // What streamer mode changed outside the page (the in-game setting), so turning it off can undo it.
  function loadState() {
    const stored = window.DataStore?.get?.(stateKey, {});
    return stored && typeof stored === "object" ? stored : {};
  }

  function saveState(patch) {
    state = { ...state, ...patch };
    window.DataStore?.set?.(stateKey, state);
  }

  // ---- Styles ----

  // A hidden name keeps its place, its text turns invisible, and a slim rounded bar sits through the
  // middle of the line, like a loading placeholder. The bar's length comes from data-sm-w (set in
  // order, see assignLengths), never from the name, so it gives nothing away. Status messages get a
  // fainter, shorter bar. A name inside another hidden name gets no second bar.
  const LENGTHS = ["4.6em", "6.2em", "5.2em", "7em"];
  const LOOKS = {
    blur: { bar: "linear-gradient(90deg, rgba(220, 228, 236, 0.22), rgba(220, 228, 236, 0.12))", height: "0.62em", radius: "999px" },
    bars: { bar: "rgba(150, 160, 172, 0.42)", height: "0.95em", radius: "3px" },
  };

  function masked(selectors, look, { scope = `html[${FLAG}]`, faint = false } = {}) {
    const style = LOOKS[look] || LOOKS.blur;
    const list = selectors.join(", ");
    const outer = `${scope} :is(${list}):not(:is(${list}) *)`;
    return [
      `${outer} { position: relative !important; display: inline-block !important; width: var(--sm-w, 6em) !important; max-width: 100% !important; overflow: hidden !important; white-space: nowrap !important; vertical-align: middle; color: transparent !important; text-shadow: none !important; filter: none !important; background: none !important; }`,
      `${outer}::after { content: "" !important; position: absolute !important; left: 0; top: 50%; width: 100%; height: ${style.height}; transform: translateY(-50%); border-radius: ${style.radius}; background: ${style.bar}; opacity: ${faint ? 0.6 : 1}; pointer-events: none; }`,
      `${scope} :is(${list}) * { color: transparent !important; text-shadow: none !important; background: none !important; box-shadow: none !important; }`,
      `${scope} :is(${list}) *::after { content: none !important; }`,
      ...LENGTHS.map((length, index) => `${scope} [data-sm-w="${index}"] { --sm-w: ${length}; }`),
      // Status messages are secondary; their bars stay shorter.
      faint ? `${outer} { --sm-w: 3.6em; }` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  function pageCss(values) {
    const rules = [masked(NAMES, values.look), `html[${FLAG}] :is(${SEALED_NAMES.join(", ")}) { filter: blur(6px) !important; }`];
    if (values.hideStatuses) rules.push(masked(STATUSES, values.look, { faint: true }));
    if (values.hideChat) rules.push(`html[${FLAG}] :is(${CHAT.join(", ")}) { filter: blur(7px) !important; }`);
    if (values.hideRequests) rules.push(`html[${FLAG}] :is(${REQUESTS.join(", ")}) { display: none !important; }`);
    // Text you can't read shouldn't be selectable or copyable either.
    rules.push(`html[${FLAG}] :is(${[...NAMES, ...SEALED_NAMES, ...STATUSES].join(", ")}) { user-select: none !important; }`);
    return rules.join("\n");
  }

  // Inside Riot's components (invites, party cards) the page's rules can't reach, so each gets a copy.
  function componentCss(values) {
    return masked(NAMES, values.look, { scope: `:host-context(html[${FLAG}])` });
  }

  // Gives each hidden name one of a few bar lengths, by its order on the page, so a list looks
  // natural without any bar depending on the name it covers.
  let lengthIndex = 0;
  function assignLengths(scope) {
    for (const element of scope.querySelectorAll(NAMES.join(", "))) {
      if (!element.hasAttribute("data-sm-w")) element.setAttribute("data-sm-w", String((lengthIndex++ * 3) % LENGTHS.length));
    }
  }

  function applyStyles() {
    const values = settings.get();
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(style);
    }
    style.textContent = pageCss(values);
    scanComponents();
  }

  function scanComponents() {
    const css = componentCss(settings.get());
    assignLengths(document);
    const visit = (scope) => {
      for (const element of scope.querySelectorAll("*")) {
        const root = element.shadowRoot;
        if (!root || !/^LOL-/.test(element.tagName)) continue;
        let style = root.querySelector(`style[${COMPONENT_STYLE_ATTRIBUTE}]`);
        if (!style) {
          style = document.createElement("style");
          style.setAttribute(COMPONENT_STYLE_ATTRIBUTE, "");
          root.appendChild(style);
        }
        if (style.textContent !== css) style.textContent = css;
        assignLengths(root);
        visit(root);
      }
    };
    visit(document);
  }

  // New screens bring new components; catch them shortly after the page changes.
  function watchPage() {
    if (observer || !document.body) return;
    observer = new MutationObserver(() => {
      if (!document.documentElement.hasAttribute(FLAG) || scanTimer) return;
      scanTimer = window.setTimeout(() => {
        scanTimer = 0;
        scanComponents();
        renderBadge();
      }, 400);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ---- Badge ----

  // A quiet marker in the top corner of the page, clear of the right panel: an eye-off icon, small
  // grey caps, and a red dot.
  const BADGE_ICON =
    '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M3 3l18 18"/><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.1 4.1M6.6 6.6C3.9 8.3 2 12 2 12s3.5 7 10 7a9.8 9.8 0 0 0 5.4-1.6"/></svg>';

  function renderBadge() {
    let badge = document.getElementById(BADGE_ID);
    const show = settings.get("enabled") && settings.get("showBadge");
    if (!show) {
      badge?.remove();
      return;
    }
    if (!badge) {
      badge = document.createElement("div");
      badge.id = BADGE_ID;
      badge.setAttribute("role", "status");
      badge.setAttribute("aria-label", "Streamer mode is on. Ctrl+Shift+H turns it off.");
      badge.innerHTML = `${BADGE_ICON}<span>Streamer mode</span><i></i>`;
      badge.style.cssText =
        "position:fixed;top:7px;right:234px;z-index:2147483600;display:flex;align-items:center;gap:5px;height:16px;" +
        "color:rgba(226,232,238,.62);font:600 10px/1 system-ui,'Segoe UI',sans-serif;letter-spacing:.08em;text-transform:uppercase;pointer-events:none;";
      badge.querySelector("i").style.cssText = "width:5px;height:5px;margin-left:1px;border-radius:999px;background:#ff5d5d;box-shadow:0 0 5px rgba(255,93,93,.8);";
    }
    if (badge.parentNode !== document.body) document.body.appendChild(badge);
  }

  // ---- In-game names ----

  async function readHidePlayerNames() {
    const response = await fetch(gameSettingsApi);
    if (!response.ok) throw new Error(`Game settings request failed with ${response.status}`);
    return Boolean((await response.json())?.HUD?.HidePlayerNames);
  }

  async function writeHidePlayerNames(value) {
    const response = await fetch(gameSettingsApi, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ HUD: { HidePlayerNames: value } }),
    });
    if (!response.ok) throw new Error(`Game settings update failed with ${response.status}`);
  }

  // Turns the game's own "hide player names" on, remembering what it was so it can go back.
  async function syncInGameNames() {
    const want = settings.get("enabled") && settings.get("inGameNames");
    try {
      if (want && state.previousHidePlayerNames === undefined) {
        saveState({ previousHidePlayerNames: await readHidePlayerNames() });
        await writeHidePlayerNames(true);
      } else if (!want && state.previousHidePlayerNames !== undefined) {
        await writeHidePlayerNames(Boolean(state.previousHidePlayerNames));
        saveState({ previousHidePlayerNames: undefined });
      }
    } catch (error) {
      console.warn("[streamer-mode] Couldn't change the in-game name setting.", error);
    }
  }

  // ---- On and off ----

  function apply() {
    const values = settings.get();
    if (values.enabled) document.documentElement.setAttribute(FLAG, values.look === "bars" ? "bars" : "blur");
    else document.documentElement.removeAttribute(FLAG);
    applyStyles();
    renderBadge();
    syncInGameNames();
    window.CommandBar?.update?.();
  }

  function toggle() {
    const enabled = !settings.get("enabled");
    settings.set("enabled", enabled);
    toast(enabled ? "warning" : "info", enabled ? "Streamer mode is on." : "Streamer mode is off.", { duration: 2000 });
  }

  function onKeyDown(event) {
    if (event.ctrlKey && event.shiftKey && !event.altKey && !event.repeat && event.code === "KeyH") {
      event.preventDefault?.();
      toggle();
    }
  }

  // ---- Settings and commands ----

  function defineSettings() {
    if (typeof window.PluginSettings?.define === "function") {
      return window.PluginSettings.define({
        id: pluginName,
        title: "Streamer Mode",
        description: "Hides other players' details and your own while you stream or record. Ctrl+Shift+H turns it on and off anywhere in the client.",
        icon: `https://plugins/${pluginRoot}/assets/icon.svg`,
        storageKey: settingsKey,
        fields: [
          { key: "enabled", type: "toggle", label: "Streamer mode", description: "Shortcut: Ctrl+Shift+H.", default: defaults.enabled },
          {
            key: "look",
            type: "choice",
            label: "How names are hidden",
            options: [
              { value: "blur", label: "Blur" },
              { value: "bars", label: "Solid bars" },
            ],
            default: defaults.look,
          },
          { type: "heading", label: "What to hide" },
          { type: "note", text: "Names and Riot IDs are always hidden: yours, friends', lobby, champ select, profiles, hover cards and scoreboards." },
          { key: "hideStatuses", type: "toggle", label: "Status messages", description: "Yours and your friends' custom messages. \"In game\" and similar stay.", default: defaults.hideStatuses },
          { key: "hideChat", type: "toggle", label: "Chat", description: "Messages, conversation previews and who you're talking to.", default: defaults.hideChat },
          { key: "hideRequests", type: "toggle", label: "Friend requests", description: "Hides the friend requests section.", default: defaults.hideRequests },
          {
            key: "inGameNames",
            type: "toggle",
            label: "Also hide names in game",
            description: "Turns on the game's own \"hide player names\" while streamer mode is on, and puts it back after.",
            default: defaults.inGameNames,
          },
          { key: "showBadge", type: "toggle", label: "Show the badge", description: "A small \"Streamer mode\" pill at the top, so you know it's on.", default: defaults.showBadge },
        ],
      });
    }
    const stored = window.DataStore?.get?.(settingsKey, {});
    const values = { ...defaults, ...(stored && typeof stored === "object" ? stored : {}) };
    const listeners = new Set();
    return {
      get: (key) => (key ? values[key] : { ...values }),
      set(key, value) {
        values[key] = value;
        window.DataStore?.set?.(settingsKey, values);
        for (const listener of listeners) listener({ ...values }, [key]);
      },
      onChange(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      open: () => toast("info", "Update maoloader to 0.1.7 or newer to change plugin settings."),
    };
  }

  function bindCommandBar() {
    if (commandBound || typeof window.CommandBar?.addAction !== "function") return;
    commandBound = true;
    window.CommandBar.addAction({
      name: () => (settings.get("enabled") ? "Turn off streamer mode" : "Turn on streamer mode"),
      legend: "Ctrl Shift H",
      group: "streamer mode",
      tags: ["streamer", "stream", "privacy", "hide", "names", "obs", "record"],
      perform: toggle,
    });
    window.CommandBar.addAction({ name: "Streamer mode settings", group: "streamer mode", tags: ["streamer", "privacy", "settings"], perform: () => settings.open() });
  }

  exports.init = function init(context) {
    if (context?.meta?.name) pluginRoot = context.meta.name;
    settings = defineSettings();
    settings.onChange(() => apply());
    // Before the page draws anything, so names never show for a moment after a restart.
    if (settings.get("enabled")) document.documentElement.setAttribute(FLAG, settings.get("look") === "bars" ? "bars" : "blur");
  };

  exports.load = function load() {
    bindCommandBar();
    window.addEventListener("keydown", onKeyDown, true);
    watchPage();
    apply();
  };
})();
