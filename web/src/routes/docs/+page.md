<svelte:head>
	<title>Plugin docs - maoloader</title>
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

		Build a small JavaScript package, describe it with `maoloader.json`, host it in a GitHub repository, then submit the repository for review and mirroring.

		<div class="docs-actions">
			<a data-slot="button" class="docs-button" href="/submit">Submit a repository</a>
			<a data-slot="button" class="docs-button secondary" href="#manifest">View manifest shape</a>
		</div>
	</div>
	<div class="docs-hero-card" aria-label="Plugin flow">
		<span>1. Create repo</span>
		<span>2. Add manifest</span>
		<span>3. Submit for review</span>
		<span>4. Mirror package</span>
	</div>
</section>

<div class="docs-layout">

<aside class="docs-toc" aria-label="Docs navigation">
	<strong>Guide</strong>
	<a href="#shape">Repository shape</a>
	<a href="#manifest">Plugin fields</a>
	<a href="#entry">Entry file</a>
	<a href="#layout">File layout</a>
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

<section id="layout">

## Suggested file layout

```txt
your-plugin-pack/
  maoloader.json
  plugins/
    clean-client-tools/
      index.js
      styles.css
      README.md
  assets/
    icon.png
```

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

1. Push your repository to GitHub.
2. Make sure `maoloader.json` exists at the root, or note the custom manifest path.
3. Open the submit page and paste the GitHub repository URL.
4. After approval, maoloader mirrors the package into the registry storage.
5. Users can copy the install link from the plugin page and paste it into the desktop app.

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
