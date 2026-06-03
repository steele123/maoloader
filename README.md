# maoloader

Rust-based PenguLoader fork using Tauri for the desktop shell and SvelteKit for
the UI.

## Project layout

- `app`: Tauri v2 + SvelteKit desktop app.
- `dll`: Rust `core.dll` scaffold used by loader activation.
- `scripts`: local development helpers.

## Development

Install frontend dependencies:

```sh
cd app
bun install
```

Build and copy the native core DLL into the Tauri dev base directory:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-core.ps1
```

Run the app:

```sh
cd app
bun run tauri dev
```

The loader app creates its local development layout under `app/src-tauri/bin`.
