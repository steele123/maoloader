/**
 * @description Never miss a queue pop: a sound even with the client muted, the client brought to the front, and an optional phone notification through Discord or ntfy when you're away.
 * @author maoloader
 * @link https://github.com/steele123/maoloader
 */
(function () {
  const pluginName = "queue-alerts";
  const settingsKey = "queue-alerts.settings";
  const readyCheckApi = "/lol-matchmaking/v1/ready-check";
  const defaults = {
    sound: true,
    volume: 70,
    bringToFront: true,
    discordWebhook: "",
    ntfyTopic: "",
    onlyWhenAway: true,
  };
  const DISCORD_WEBHOOK = /^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/;
  const NTFY_TOPIC = /^[\w-]{1,64}$/;
  let pluginRoot = pluginName;
  let settings;
  let alertedCheck = false;
  let audio;
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

  // ---- Sound ----

  // A short rising chime made in the page, so it plays at its own volume even when the client's
  // sounds are muted.
  function playChime() {
    const volume = settings.get("volume") / 100;
    if (!volume) return;
    try {
      audio ??= new AudioContext();
      if (audio.state === "suspended") audio.resume();
      const start = audio.currentTime + 0.02;
      [659.25, 880, 1318.5].forEach((frequency, index) => {
        const at = start + index * 0.14;
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(0.35 * volume, at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
        oscillator.connect(gain).connect(audio.destination);
        oscillator.start(at);
        oscillator.stop(at + 0.55);
      });
    } catch (error) {
      console.warn("[queue-alerts] Could not play the sound.", error);
    }
  }

  // ---- Phone notifications ----

  function discordUrl() {
    const url = String(settings.get("discordWebhook") || "").trim();
    return DISCORD_WEBHOOK.test(url) ? url : "";
  }

  // A bare topic goes to ntfy.sh; a full https:// address can point at your own ntfy server.
  function ntfyUrl() {
    const value = String(settings.get("ntfyTopic") || "").trim();
    if (!value) return "";
    if (NTFY_TOPIC.test(value)) return `https://ntfy.sh/${value}`;
    try {
      const url = new URL(value);
      return url.protocol === "https:" && url.pathname.length > 1 ? url.href.replace(/\/$/, "") : "";
    } catch {
      return "";
    }
  }

  // Both are sent as simple requests (form data, plain text, query parameters), which the client
  // page can send to another site without a preflight. The answer can't be read, so a mistyped
  // address fails quietly; the test button is there to check.
  async function sendPhone(title, body) {
    const sent = [];
    const discord = discordUrl();
    if (discord) {
      const form = new FormData();
      form.append("content", `**${title}**\n${body}`);
      sent.push(fetch(discord, { method: "POST", mode: "no-cors", body: form }));
    }
    const ntfy = ntfyUrl();
    if (ntfy) {
      const query = new URLSearchParams({ title, priority: "high", tags: "crossed_swords" });
      sent.push(fetch(`${ntfy}?${query}`, { method: "POST", mode: "no-cors", body }));
    }
    const results = await Promise.allSettled(sent);
    return { tried: sent.length, failed: results.filter((result) => result.status === "rejected").length };
  }

  async function queueName() {
    try {
      const session = await lcu("/lol-gameflow/v1/session");
      return session?.gameData?.queue?.description || session?.gameData?.queue?.shortName || "";
    } catch {
      return "";
    }
  }

  // ---- Alert ----

  async function alertMatchFound() {
    if (settings.get("sound")) playChime();
    if (settings.get("bringToFront")) {
      lcu("/riotclient/ux-show", { method: "POST" }).catch(() => {});
      lcu("/riotclient/ux-flash", { method: "POST" }).catch(() => {});
    }
    if (settings.get("onlyWhenAway") && document.hasFocus()) return;
    if (!discordUrl() && !ntfyUrl()) return;
    const queue = await queueName();
    const time = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    sendPhone("Match found", `${queue ? `${queue} · ` : ""}${time}. You have about 10 seconds to accept.`);
  }

  function onReadyCheck(check) {
    // One alert per ready check; it resets when the check ends.
    if (!check || check.state !== "InProgress") {
      alertedCheck = false;
      return;
    }
    if (alertedCheck || check.playerResponse !== "None") return;
    alertedCheck = true;
    alertMatchFound();
  }

  async function sendTest() {
    if (settings.get("sound")) playChime();
    if (!discordUrl() && !ntfyUrl()) {
      const typed = String(settings.get("discordWebhook") || "").trim() || String(settings.get("ntfyTopic") || "").trim();
      toast(
        "info",
        typed
          ? "That doesn't look like a Discord webhook or an ntfy topic. Check the address and try again."
          : "Add a Discord webhook or an ntfy topic to get phone notifications.",
      );
      return;
    }
    const result = await sendPhone("Test from maoloader", "Queue alerts are working. You'll get a message like this when a match is found.");
    if (result.failed) toast("error", "Couldn't reach the notification service. Check your internet connection.");
    else toast("success", "Test sent. Check your phone.", { duration: 3500 });
  }

  // ---- Settings and commands ----

  function defineSettings() {
    if (typeof window.PluginSettings?.define === "function") {
      return window.PluginSettings.define({
        id: pluginName,
        title: "Queue Alerts",
        description: "Never miss a queue pop, even when you've stepped away.",
        icon: `https://plugins/${pluginRoot}/assets/icon.svg`,
        storageKey: settingsKey,
        fields: [
          { type: "heading", label: "When a match is found" },
          {
            key: "sound",
            type: "toggle",
            label: "Play a sound",
            description: "A chime with its own volume, so it plays even with the client's sounds muted.",
            default: defaults.sound,
          },
          { key: "volume", type: "range", label: "Volume", min: 10, max: 100, step: 5, unit: "%", default: defaults.volume, showIf: (values) => values.sound },
          {
            key: "bringToFront",
            type: "toggle",
            label: "Bring the client to the front",
            description: "Shows the client and flashes it in the taskbar if it's minimized or behind other windows.",
            default: defaults.bringToFront,
          },
          { type: "heading", label: "Phone notifications" },
          {
            key: "discordWebhook",
            type: "text",
            label: "Discord webhook",
            description: "In a Discord server you own: channel settings → Integrations → Webhooks → New webhook → Copy webhook URL.",
            placeholder: "https://discord.com/api/webhooks/…",
            maxLength: 300,
            default: defaults.discordWebhook,
          },
          {
            key: "ntfyTopic",
            type: "text",
            label: "ntfy topic",
            description: "Install the ntfy app, subscribe to a hard-to-guess topic name, and type the same name here. Or paste your own ntfy server's address.",
            placeholder: "my-secret-queue-topic",
            maxLength: 200,
            default: defaults.ntfyTopic,
          },
          {
            key: "onlyWhenAway",
            type: "toggle",
            label: "Only when the client isn't focused",
            description: "Skips the phone message while you're using the client.",
            default: defaults.onlyWhenAway,
          },
          { type: "button", label: "Send a test", description: "Plays the sound and sends a test message to your phone.", buttonLabel: "Send test", action: () => sendTest() },
          { type: "note", text: "Only the queue name and the time are sent, and only to the webhook or topic you enter here." },
        ],
      });
    }
    const stored = window.DataStore?.get?.(settingsKey, {});
    const values = { ...defaults, ...(stored && typeof stored === "object" ? stored : {}) };
    return {
      get: (key) => (key ? values[key] : { ...values }),
      onChange: () => () => {},
      open: () => toast("info", "Update maoloader to 0.1.7 or newer to change plugin settings."),
    };
  }

  function bindCommandBar() {
    if (commandBound || typeof window.CommandBar?.addAction !== "function") return;
    commandBound = true;
    window.CommandBar.addAction({ name: "Test queue alert", group: "queue alerts", tags: ["queue", "alert", "sound", "phone", "test"], perform: () => sendTest() });
    window.CommandBar.addAction({ name: "Queue alerts settings", group: "queue alerts", tags: ["queue", "alert", "discord", "ntfy", "settings"], perform: () => settings.open() });
  }

  async function checkCurrentReadyCheck() {
    try {
      onReadyCheck(await lcu(readyCheckApi));
    } catch {
      // No ready check in progress.
    }
  }

  exports.init = function init(context) {
    if (context?.meta?.name) pluginRoot = context.meta.name;
    const socket = context?.socket || window.socket;
    settings = defineSettings();
    socket?.observe?.(readyCheckApi, (event) => onReadyCheck(event?.eventType === "Delete" ? undefined : event?.data));
  };

  exports.load = function load() {
    bindCommandBar();
    checkCurrentReadyCheck();
  };
})();
