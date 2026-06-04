# maoloader Example Plugin

This is a reference plugin package for maoloader. It is intentionally small, but it touches the APIs plugin authors will usually need:

- `init(context)` for plugin metadata and optional LCU socket access.
- `load()` for DOM work after the League client has loaded.
- CSS module imports with `import "./styles.css"`.
- `window.DataStore` for persisted local plugin state.
- `window.Toast` for user feedback.
- `window.CommandBar.addAction` for searchable commands.

The `maoloader.plugin.json` file is a draft website/store manifest. The loader discovers `index.js`; the website can use the manifest for listing, filtering, compatibility, and install metadata.
