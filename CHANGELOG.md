# maoloader changelog

What changed in each release of the maoloader desktop app and the runtime it loads into the
League client. Each plugin keeps its own CHANGELOG.md in its folder.

Every release needs a section here before it can be published: `scripts/package-release.ps1`
uses it as the release notes that the app's updater and maoloader.com show. Write for players,
newest first, as `## <version> - <yyyy-mm-dd>`.

## 0.1.8 - 2026-10-16

### New
- **Plugin store in Ctrl+K**: type `get` or `plugin`, or run **Browse plugins**, to see store plugins you don't have yet. Picking one opens maoloader on that plugin, where you confirm the install.
- **Settings backups** in Settings → Backups: back up every plugin's settings and saved data (themes, LP history, notes and so on) and restore them in one click. maoloader also keeps an automatic copy each day your settings change, and restoring saves a copy of your current settings first. If League is open, its window closes and reopens with the restored settings.

### Changed
- Cleaner notifications: dark cards that fit the client, with small tinted icons, quieter text, and a gentle slide in and fade out. They use your theme's font when you pick one in Steele's UI.
- The **Discord** button in the sidebar now takes you to the maoloader server.

## 0.1.7 - 2026-10-15

### New
- **One settings window for every plugin**: Ctrl+K → **Plugin settings** lists each plugin with
  its own tab, in maoloader's navy and gold. Each plugin's "… settings" command opens its tab.
  Update your plugins from the store to move them in; your saved settings carry over.
- What's new in each update now shows before it installs, and on maoloader.com/changelog.
- **Event recorder** plugin in the store: see every live event the client sends, filter them,
  and copy ready-made code for plugin authors.

## 0.1.6 - 2026-10-15

### Fixed
- Updates now install while League is open. Before, the installer stopped because League was
  using maoloader's core files.

## 0.1.5 - 2026-10-15

### Fixed
- Installing plugins from the store no longer fails with "Install destination escapes the
  plugin directory".

## 0.1.4 - 2026-10-15

### New
- **One-click installs**: "Install in maoloader" on any plugin page at maoloader.com opens the
  app straight to that plugin.
- Plugins show their icons on the Plugins page.
- Discord link in the sidebar (when one is set).

### Changed
- New update signing key. If you're on 0.1.3 or older, download 0.1.4 from maoloader.com once;
  updates work from the app again after that.
- Home is back to status, plugins and quick actions.

### Fixed
- Dragging the window by its title bar works every time.

## 0.1.3 and earlier

First releases: turning maoloader on and off, the plugin list, the store, and in-app updates.
