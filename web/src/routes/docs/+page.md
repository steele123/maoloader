<svelte:head>
	<title>Plugin docs · maoloader</title>
	<meta
		name="description"
		content="Learn how to create, package, and submit plugins and themes for maoloader."
	/>
</svelte:head>

<article class="docs-page">

<section class="docs-hero">
	<div>
		<p class="eyebrow">Developer docs</p>

		# Create maoloader plugins

		Build a small JavaScript package, describe it with `maoloader.json`, then upload it as a .zip or submit its GitHub repository. Every submission is reviewed before it goes live.

		<div class="docs-actions">
			<a data-slot="button" class="docs-button" href="/submit">Submit a plugin</a>
			<a data-slot="button" class="docs-button secondary" href="#manifest">View manifest shape</a>
		</div>
	</div>
	<div class="docs-hero-card" aria-label="Plugin flow">
		<span>1. Write your plugin</span>
		<span>2. Add maoloader.json</span>
		<span>3. Upload a .zip or link a repo</span>
		<span>4. Reviewed and listed</span>
	</div>
</section>

<div class="docs-layout">

<aside class="docs-toc" aria-label="Docs navigation">
	<strong>Guide</strong>
	<a href="#shape">Repository shape</a>
	<a href="#manifest">Plugin fields</a>
	<a href="#entry">Entry file</a>
	<a href="#settings">Plugin settings</a>
	<a href="#events">Live client events</a>
	<a href="#layout">File layout</a>
	<a href="#screenshots">Screenshots</a>
	<a href="#multiple">Multiple plugins</a>
	<a href="#review">Submitting</a>
	<a href="#habits">Good habits</a>
</aside>

<div class="docs-content">

<section id="shape">

## Plugin repository shape

Every submitted GitHub repository must include a `maoloader.json` file. Put it at the repository root unless you submit a custom manifest path.

The root manifest only supports three fields:

- `repository`: the GitHub repository URL
- `author`: the package author
- `plugins`: an array of plugin or theme entries

```json
{
  "repository": "https://github.com/your-name/your-plugin-pack",
  "author": {
    "name": "Your Name",
    "url": "https://github.com/your-name"
  },
  "plugins": [
    {
      "slug": "clean-client-tools",
      "title": "Clean Client Tools",
      "version": "0.1.0",
      "description": "Adds small quality-of-life tools to the League client.",
      "image": "assets/icon.png",
      "entry": "plugins/clean-client-tools/index.js",
      "files": [
        "plugins/clean-client-tools/index.js",
        "plugins/clean-client-tools/styles.css",
        "plugins/clean-client-tools/README.md"
      ],
      "tags": ["tools", "ui"]
    }
  ]
}
```

</section>

<section id="manifest">

## Plugin fields

Each item in `plugins` describes one installable plugin or theme.

| Field | Required | Notes |
| --- | --- | --- |
| `slug` | Yes | Stable URL-safe id. Use lowercase words separated by hyphens. |
| `title` | Yes | Display name shown in the registry. |
| `version` | Yes | Semver-style version, such as `0.1.0`. |
| `description` | Yes | Short registry description. |
| `image` | Yes | Path to an image inside the repo. |
| `entry` | Yes | Main JavaScript file loaded by maoloader. |
| `files` | Yes | Files that should be mirrored into the package. |
| `tags` | No | Search tags shown in the registry. |
| `kind` | No | `plugin` or `theme`. Defaults to `plugin`. |
| `homepage` | No | Public project or docs URL. |
| `screenshots` | No | Up to 8 images shown on the plugin page. See [Screenshots](#screenshots). |

</section>

<section id="entry">

## Entry file

The entry file is normal browser JavaScript. Keep startup work small, wait for the client UI you need, and clean up any DOM you create when possible.

```js
const root = document.createElement("section");
root.className = "mao-example-panel";
root.innerHTML = `
  <strong>maoloader plugin loaded</strong>
  <button type="button">Close</button>
`;

root.querySelector("button")?.addEventListener("click", () => {
  root.remove();
});

document.body.append(root);
```

If your plugin imports CSS, include the CSS file in `files` and load it from your entry script using the maoloader runtime API once that API is available.

</section>

<section id="settings">

## Plugin settings

Describe your settings once with `PluginSettings.define` and maoloader does the rest: it saves the values, checks each one against its field, and lists your plugin in the shared settings window (Ctrl+K → **Plugin settings**, or **Settings: Your plugin**). Needs maoloader 0.1.7 or newer.

```js
const settings = PluginSettings.define({
  id: "auto-accept",
  title: "Auto Accept",
  description: "Accepts ready checks for you.",
  fields: [
    { key: "enabled", type: "toggle", label: "Accept ready checks", default: true },
    { key: "delay", type: "range", label: "Delay", min: 0, max: 10, step: 0.5, unit: "s", default: 2 },
    { key: "mode", type: "choice", label: "Mode", options: ["fast", "safe"], default: "fast" },
    { key: "note", type: "text", label: "Toast text", showIf: (values) => values.enabled },
  ],
});

settings.get("delay"); // 2
settings.set("delay", 3);
settings.onChange((values, changed) => console.log(changed, values));
```

Field types:

| Type | Stores | Options |
| --- | --- | --- |
| `toggle` | true or false | |
| `range` | a number | `min`, `max`, `step`, `unit` |
| `number` | a number | `min`, `max`, `step` |
| `choice` | one of `options` | buttons for up to 4 options, a dropdown for more |
| `color` | a hex colour | |
| `text` | a string | `placeholder`, `maxLength` |
| `heading`, `note` | nothing | layout only; a note shows its `text` |
| `button` | nothing | `buttonLabel`, `action(settings)` |

Every value field also takes `label`, `description`, `default` and an optional `showIf(values)`. Values are saved in DataStore under `your-id.settings` (or `storageKey`). Keys your current version doesn't define are kept, so an update never loses anyone's settings.

Need something fields can't express, like a list people edit or a preset manager? Give `define` a `page` and draw it yourself, under your fields in the same tab:

```js
PluginSettings.define({
  id: "rune-presets",
  title: "Rune Presets",
  page: {
    render(container, context) {
      container.innerHTML = `<button class="button primary">Save current page</button>`;
      // context.settings is your settings handle; context.tab is the section asked for in open()
    },
    destroy() {
      // stop timers or listeners you started outside the container
    },
  },
});
```

Your page sits in maoloader's window, so its classes are available: `.field`, `.copy`, `.switch`, `.segmented`, `.button` and `.button.primary`, `.subtabs`, `.text`, `.note` and `.muted`. Open your tab with `settings.open()`, or `settings.open({ tab: "presets" })` to hand your page a section.

</section>

<section id="events">

## Live client events

The client pushes an event whenever something changes: your status, the lobby, champ select, the friends list. Subscribe with `socket.observe` and the endpoint you care about:

```js
exports.init = function (context) {
  context.socket.observe("/lol-gameflow/v1/gameflow-phase", (event) => {
    // event.eventType is "Create", "Update" or "Delete"
    console.log("Phase:", event.data);
  });
};
```

Not sure which endpoint to watch? Install the **Event recorder** plugin, press Ctrl+K → **Open the event recorder**, and do whatever your plugin should react to. It lists every event as it arrives, shows its data, and copies a ready-made `socket.observe` snippet for any endpoint.

</section>

<section id="layout">

## Suggested file layout

Each plugin's `README.md` becomes its store page, and its `CHANGELOG.md` becomes the **What's new** list there and on the [changelog](/changelog).

```txt
your-plugin-pack/
  maoloader.json
  plugins/
    clean-client-tools/
      index.js
      styles.css
      README.md
      CHANGELOG.md
  assets/
    icon.png
  media/
    clean-client-tools/
      home.webp
      settings.webp
```

Start each release in `CHANGELOG.md` with `## <version> - <date>`, newest first, and write it for players:

```md
## 1.1.0 - 2026-10-16

### New
- Pick which friends trigger alerts.

### Fixed
- Alerts no longer repeat after the client reloads.
```

Bump `version` in `maoloader.json` to match, then submit the update the same way as the first release.

</section>

<section id="screenshots">

## Screenshots

Show what your plugin does with a few images at the top of its page. People can click one to see it full size and step through the rest with the arrow keys.

Add a `screenshots` list to the plugin's entry in `maoloader.json`. Each item is a path, or a path with a caption:

```json
{
  "slug": "clean-client-tools",
  "title": "Clean Client Tools",
  "version": "0.1.1",
  "screenshots": [
    {
      "path": "media/clean-client-tools/home.webp",
      "caption": "The home screen with the tools panel open"
    },
    "media/clean-client-tools/settings.webp"
  ]
}
```

- **Paths** are from the repository root, like `image`. Images are shown straight from your GitHub repo at the submitted commit, so they don't go in `files` and don't make the download bigger.
- **Formats:** `.png`, `.jpg`, `.webp` or `.gif`. WebP keeps them small. Up to 8 per plugin.
- **Captions** are optional, up to 140 characters, and double as the image's alt text. Say what the image shows, not what the plugin is called.
- **Size:** capture the client at its normal size (1280×720) and crop to the part that matters. A cropped settings page or card reads better than a full screen.
- **Hide names.** Turn on [Streamer Mode](/plugins/streamer-mode) before capturing, so your friends' names and tags stay out of public images. If you show sample data, say so in the caption.

Screenshots work for plugins submitted from a GitHub repo. Changing them counts as an update even without a new version, so new images go up the same way as a release.

</section>

<section id="multiple">

## Multiple plugins in one repo

One repository can publish multiple plugins. Add more entries to the `plugins` array and keep each plugin's files grouped in its own folder.

```json
{
  "repository": "https://github.com/your-name/client-addons",
  "author": {
    "name": "Your Name"
  },
  "plugins": [
    {
      "slug": "client-tools",
      "title": "Client Tools",
      "version": "0.1.0",
      "description": "Small client utilities.",
      "image": "client-tools/icon.png",
      "entry": "client-tools/index.js",
      "files": ["client-tools/index.js", "client-tools/icon.png"]
    },
    {
      "slug": "quiet-theme",
      "title": "Quiet Theme",
      "version": "0.1.0",
      "description": "A restrained visual theme.",
      "image": "quiet-theme/icon.png",
      "entry": "quiet-theme/index.js",
      "files": ["quiet-theme/index.js", "quiet-theme/styles.css"],
      "kind": "theme"
    }
  ]
}
```

</section>

<section id="review">

## Submitting for review

There are two ways in, both on the [submit page](/submit):

- **Upload a .zip.** Drop in your plugin folder as a zip. A `maoloader.json` is optional here: without one, fill in the name, version and description on the page and `index.js` at the top of the zip is used. A `README.md` in the zip becomes the plugin page.
- **Link a GitHub repo.** Push your repository with `maoloader.json` at the root (or note a custom manifest path), then paste the repository URL. The README next to the manifest becomes the plugin page.

After a reviewer approves it, the plugin shows up in the store. People install it with **Install in maoloader** on its page, which opens the desktop app straight to it.

</section>

<section id="habits">

## Good plugin habits

- Prefer small, focused plugins over large bundles.
- Keep generated files out of the package unless they are required at runtime.
- Use stable file paths because registry metadata points to them directly.
- Include a short `README.md` explaining what the plugin changes.
- Avoid destructive client behavior, hidden network calls, and surprises.

</section>

</div>

</div>

</article>
