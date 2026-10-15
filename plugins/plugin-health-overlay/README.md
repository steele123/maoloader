# Plugin Health Overlay

A maoloader utility plugin for inspecting plugin lifecycle events, load errors, safe-mode failures, and attributed console output from inside the League client.

## Usage

- Press `Ctrl+Shift+H` to open or close the overlay.
- Open the maoloader command bar and run `Show Plugin Health`.
- Select a plugin to inspect its recent lifecycle and console events.
- Use `Copy report` to copy a JSON diagnostics snapshot.
- Use `Retry plugin` to reset its safe-mode failure count, then reload the League client.

The overlay reads maoloader's in-memory diagnostics. It does not send plugin data anywhere.
