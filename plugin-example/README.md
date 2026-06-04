# maoloader Example Plugin

This is a small starter plugin for testing maoloader packaging, registry submission, and runtime loading.

It demonstrates:

- A root `maoloader.json` manifest entry.
- A browser JavaScript entry file.
- A CSS file included in the mirrored package.
- Simple cleanup when the user closes the example panel.

## Files

- `index.js`: plugin entry loaded by maoloader.
- `styles.css`: optional UI styling.
- `assets/icon.svg`: registry image referenced by `maoloader.json`.

## Local Testing

Copy this folder into your maoloader plugins directory, or install it through the registry flow once approved.
