/**
 * @description Accept ready checks automatically after a short, cancellable delay.
 * @author maoloader
 * @link https://github.com/steele123/maoloader
 */
(function () {
  const pluginName = "auto-accept";
  const settingsKey = "auto-accept.settings";
  const readyCheckApi = "/lol-matchmaking/v1/ready-check";
  const defaults = { enabled: true, delaySeconds: 2 };
  const maxDelaySeconds = 10;
  let pluginRoot = pluginName;
  let socket;
  let settings;
  let pendingTimer = 0;
  let skippedThisCheck = false;
  let commandBound = false;

  // Settings live in maoloader's shared settings window (Ctrl+K → Plugin settings). On a runtime
  // older than 0.1.7 there is no such window; the plugin then keeps working with what's saved.
  function defineSettings() {
    if (typeof window.PluginSettings?.define === "function") {
      return window.PluginSettings.define({
        id: pluginName,
        title: "Auto Accept",
        description: "Accepts ready checks for you after a short delay you can cancel.",
        icon: `https://plugins/${pluginRoot}/assets/icon.svg`,
        storageKey: settingsKey,
        fields: [
          { key: "enabled", type: "toggle", label: "Accept ready checks", description: "Accepts for you when a match is found.", default: defaults.enabled },
          {
            key: "delaySeconds",
            type: "range",
            label: "Delay",
            description: "Time to cancel before it accepts. 0 accepts at once.",
            min: 0,
            max: maxDelaySeconds,
            step: 0.5,
            unit: "s",
            default: defaults.delaySeconds,
            showIf: (values) => values.enabled,
          },
        ],
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

  function clearPending() {
    if (pendingTimer) {
      window.clearTimeout(pendingTimer);
      pendingTimer = 0;
    }
  }

  async function accept() {
    pendingTimer = 0;
    try {
      const response = await fetch(`${readyCheckApi}/accept`, { method: "POST" });
      if (!response.ok) throw new Error(`Accept failed with ${response.status}`);
      toast("success", "Match accepted.", { duration: 2500 });
    } catch (error) {
      console.error("[auto-accept]", error);
      toast("error", "Could not accept the match. Accept it manually.");
    }
  }

  function onReadyCheck(check) {
    const waiting = check?.state === "InProgress" && check?.playerResponse === "None";

    if (!waiting) {
      clearPending();
      if (check?.state !== "InProgress") skippedThisCheck = false;
      return;
    }

    if (!settings.get("enabled") || skippedThisCheck || pendingTimer) return;

    const delaySeconds = settings.get("delaySeconds");
    const delay = Math.round(delaySeconds * 1000);
    if (delay === 0) {
      pendingTimer = -1;
      accept();
      return;
    }

    pendingTimer = window.setTimeout(accept, delay);
    toast("info", {
      title: "Match found",
      description: `Accepting in ${delaySeconds}s.`,
      duration: delay,
      action: {
        label: "Don't accept",
        onClick: () => {
          clearPending();
          skippedThisCheck = true;
        },
      },
    });
  }

  function bindCommandBar() {
    if (commandBound || typeof window.CommandBar?.addAction !== "function") return;
    commandBound = true;
    window.CommandBar.addAction({
      name: () => (settings.get("enabled") ? "Turn off auto-accept" : "Turn on auto-accept"),
      group: "auto-accept",
      tags: ["ready check", "queue", "accept", "match"],
      perform: () => {
        settings.set("enabled", !settings.get("enabled"));
        toast("info", settings.get("enabled") ? "Auto-accept is on." : "Auto-accept is off.", { duration: 2500 });
      },
    });
    window.CommandBar.addAction({
      name: "Auto-accept settings",
      group: "auto-accept",
      tags: ["ready check", "delay", "settings"],
      perform: () => settings.open(),
    });
  }

  async function checkCurrentReadyCheck() {
    try {
      const response = await fetch(readyCheckApi);
      if (response.ok) onReadyCheck(await response.json());
    } catch {
      // No ready check in progress.
    }
  }

  exports.init = function init(context) {
    if (context?.meta?.name) pluginRoot = context.meta.name;
    socket = context?.socket || window.socket;
    settings = defineSettings();
    // Turning it off cancels a countdown that's already running.
    settings.onChange((values) => {
      if (!values.enabled) clearPending();
      window.CommandBar?.update?.();
    });
    socket?.observe?.(readyCheckApi, (event) => onReadyCheck(event?.eventType === "Delete" ? undefined : event?.data));
  };

  exports.load = function load() {
    bindCommandBar();
    checkCurrentReadyCheck();
  };
})();
