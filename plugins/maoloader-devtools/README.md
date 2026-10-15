# maoloader DOM Inspector

Developer tooling for capturing League client DOM elements while creating and debugging plugins.

## Capture an element

1. Restart the League client after installing the plugin.
2. Press `Ctrl+Shift+D` or run `Open DOM Inspector` from the command bar.
3. Select `Pick element`, hover the client UI, and click the target element.
4. The sanitized snapshot is written to `captures/latest.json` inside the live plugin folder.

In this repository, the stable capture path is:

```text
app/bin/plugins/maoloader-devtools/captures/latest.json
```

Timestamped captures are saved in the same directory. The snapshot includes the selected subtree, parent context, selector, starter CSS, dimensions, computed styles, pseudo-elements, ancestry, a bounded DOM outline, and open shadow-root content.

## Console API

The plugin exposes `window.MaoloaderDOM`:

```js
MaoloaderDOM.open();
MaoloaderDOM.pick();
await MaoloaderDOM.capture($0);
MaoloaderDOM.getLatest();
MaoloaderDOM.getCapturePath();
```

Snapshots strip form values and sensitive attributes, remove scripts, sanitize URLs, redact token-like strings, and cap large HTML subtrees. Review captures before publishing them publicly.
