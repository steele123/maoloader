# maoloader web

Public SvelteKit registry for maoloader plugins and themes.

## Storage model

- Cloudflare D1 binding `PLUGIN_DB` stores listing metadata, submissions, review state, and indexes.
- Cloudflare R2 binding `PLUGIN_BUCKET` stores package archives, icons, and screenshots.
- The same `PLUGIN_BUCKET` also stores desktop app installers, updater signatures, and `releases/maoloader/latest.json`.
- Local development falls back to the bundled seed listing in `src/lib/registry/seed.ts`.

## D1 setup

Create the database, copy the returned database id into `wrangler.jsonc`, then apply migrations:

```sh
bunx wrangler d1 create maoloader-registry
bun run db:migrate:local
bun run db:migrate:remote
```

Drizzle owns the table schema in `src/lib/db/schema.ts`. Generate new SQL migrations after schema changes:

```sh
bun run db:generate
```

## Registry tables

- `registry_listings` contains approved plugin/theme metadata.
- `registry_submissions` contains pending and reviewed GitHub submissions.
- R2 package keys are stored on each listing under `assets.package.key`.

## Review and mirror flow

1. Users add `maoloader.json` to a GitHub repository.
2. Users submit that GitHub repository from `/submit`.
3. The server reads and validates the manifest. Leave the manifest path empty for root `maoloader.json`, or provide a relative path for nested manifests.
4. Review the source externally.
5. Click `Approve and mirror` from `/admin`.
6. The server fetches the GitHub zipball, uploads it to R2, publishes every listing from the manifest in D1, and marks the submission approved.

## GitHub manifest

Every submitted repository must include a `maoloader.json` manifest. The root identifies the GitHub repository and author. Each plugin entry owns its own title, version, description, image, entry, files, and tags. If the manifest is at the repository root, leave the submit form's manifest path empty. For nested manifests, enter a relative path like `packages/example/maoloader.json`.

```json
{
  "repository": "https://github.com/steele123/maoloader",
  "author": {
    "name": "maoloader",
    "url": "https://github.com/steele123"
  },
  "plugins": [
    {
      "slug": "example-plugin",
      "title": "Example Plugin",
      "version": "0.1.0",
      "description": "Adds a small toast when the League client loads.",
      "image": "plugins/example/icon.png",
      "entry": "plugins/example/index.js",
      "files": ["plugins/example/index.js", "plugins/example/styles.css"],
      "tags": ["example", "ui"]
    },
    {
      "kind": "theme",
      "slug": "example-theme",
      "title": "Example Theme",
      "version": "0.1.0",
      "description": "A small visual theme.",
      "image": "themes/example/preview.png",
      "entry": "themes/example/index.css",
      "files": ["themes/example/index.css", "themes/example/preview.png"],
      "tags": ["theme"]
    }
  ]
}
```

Required root fields are `repository`, `author`, and a non-empty `plugins` array. Each plugin must include `title`, `version`, `description`, and `image`.

## Routes

- `/` browses plugins and themes.
- `/download` shows the latest desktop app release.
- `/submit` lets users submit GitHub repositories for review.
- `/plugins/[slug]` shows a listing detail page.
- `/api/plugins` returns registry JSON.
- `/api/plugins/[slug]` returns one listing.
- `/api/plugins/[slug]/download` streams the R2 package when configured.
- `/api/releases/latest.json` returns the latest desktop release manifest.
- `/api/releases/[target]/[arch]/[currentVersion]` returns Tauri updater JSON or `204` when no update is available.
- `/api/releases/download/[...key]` streams release artifacts from R2.
- `POST /api/admin/upload` uploads a zip package directly with metadata fields, no GitHub repo or `maoloader.json` required. Set `ADMIN_TOKEN` in production and send it as `token` in the multipart form or `Authorization: Bearer <token>`.
- `/admin` provides the GitHub submission queue, approve-and-mirror controls, and direct zip upload. Set `ADMIN_TOKEN` in production.

Direct admin upload fields:

- `package`: required `.zip` package.
- `kind`: `plugin` or `theme`.
- `slug`, `name`, `version`, `entry`, `description`, `author`: required metadata.
- `repository`, `homepage`, `authorUrl`, `tags`, `compatibility`, `files`, `notes`: optional text metadata.
- `icon`, `screenshot`: optional image files.
- `publish`: set to `on`/`true` to publish immediately; otherwise the upload is queued for review.

## Desktop release flow

Generate a Tauri updater signing key once and store the private key somewhere safe:

```sh
cd app
bunx tauri signer generate -w ~/.tauri/maoloader.key
```

Copy the generated public key into `app/src-tauri/tauri.release.conf.json`. Never commit or share the private key. To build, sign, generate release metadata, and upload to R2:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY="C:\Users\<you>\.tauri\maoloader.key"
bun run build:release
```

The script uploads the installer, its `.sig`, and `latest.json` under `releases/maoloader/` in `PLUGIN_BUCKET`. Release artifact URLs use the public bucket origin `https://fs.maoloader.com`.
