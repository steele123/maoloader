# maoloader

Rust-based PenguLoader fork using Tauri for the desktop shell and SvelteKit for
the UI.

## Project layout

- `app`: Tauri v2 + SvelteKit desktop app.
- `dll`: Rust `core.dll` scaffold used by loader activation.
- `scripts`: local development helpers.
- `web`: public plugin registry, downloads page, and release endpoints.

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

## Distribution

Release builds use Tauri updater artifacts and the website's existing Cloudflare
R2 plugin bucket.

Generate an updater signing key once:

```powershell
cd app
bunx tauri signer generate -w $env:USERPROFILE\.tauri\maoloader.key
```

Copy the generated public key into `app/src-tauri/tauri.release.conf.json`. Keep
the private key out of the repo. To package and upload a release:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY="$env:USERPROFILE\.tauri\maoloader.key"
cd app
bun run build:release
```

The script writes `.dist/maoloader/latest.json` and uploads the installer,
signature, and latest release metadata to R2. Artifact URLs in the release
manifest use the public bucket origin `https://fs.maoloader.com`.

### GitHub tag releases

The repository also has a GitHub Actions release workflow. It runs when a tag
matching `v*` is pushed, builds the Windows Tauri installer, signs updater
artifacts, creates or updates the GitHub Release for that tag, and uploads:

- the installer (`.exe` or `.msi`)
- the updater signature (`.sig`)
- `latest.json`

Add these repository secrets before using the workflow:

- `TAURI_SIGNING_PRIVATE_KEY`: the updater private key contents
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: optional, only if the key has a password

The tag version must match both `app/src-tauri/tauri.conf.json` and
`app/src-tauri/Cargo.toml`.

```powershell
git tag v0.1.4
git push origin v0.1.4
```

To publish the current checked-out tag manually from a machine with `gh`
authenticated:

```powershell
cd app
bun run release:github
```

The generated GitHub `latest.json` uses release asset URLs like
`https://github.com/steele123/maoloader/releases/download/v0.1.4/...`.
The website updater endpoint still works because `maoloader.com` falls back to
the GitHub Release manifest when R2 does not have a newer release manifest.
