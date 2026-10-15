# Steele's UI

One plugin for the client's look: a backdrop behind everything, your own home tab, a custom or hidden top bar, and control over the friends panel on the right. It replaces the separate Backdrop and Clean Home plugins, and picks up their settings the first time it runs.

Open the settings with `Ctrl+K` → `Steele's UI settings`, the gear in the home dashboard's greeting card, or the gear on the custom top bar. Each opens the window on its own tab.

## Backdrop

- **Style**:
  - **Image**: a file from the plugin's `backgrounds` folder (`Open folder`) or an `https://` link, with **Dim** and **Blur**. Videos (`.mp4`, `.webm`) play muted and loop.
  - **Color**: one flat color (picker or hex).
  - **Gradient**: five presets, or two colors and an angle.
  - **Transparent**: the window shows through. With no window effect you see your desktop.
- **Opacity** (Color and Gradient): lower it to tint a window effect instead of covering it.
- **Hide screen art**: removes the lobby and home art that would cover the backdrop.
- **Window effect**: Mica (Windows 11), Acrylic or Blur behind.

`Turn off backdrop` in `Ctrl+K` gets the stock background back without losing your settings.

## Home

- **Custom home** (default): Riot's home tab is hidden and replaced by a dashboard of cards:
  - **Greeting and clock**: your icon, name and level, with the time and date.
  - **Quick play**: lobby buttons for the queues you tick in the Home settings.
  - **Friends playing**: friends in a game, champ select, queue or lobby, with the queue (Ranked Solo, ARAM, Arena…) and a live clock for how long they've been at it. In-game first, then champ select, queue and lobby, longest-running first. Friends not on League are skipped.
  - **Friends online**: everyone online; mobile friends are listed last as "Mobile" and not counted.
  - **Recent games**: your last games with champion, queue, length, K/D/A, CS and how long ago, plus a win/loss record. Remakes (under 5 minutes) are labelled and left out of the record. Two columns when the card is full width.
  - **Rank**: Solo/Duo and Flex rank, LP and season record.
  - **Apex cutoffs**: the Challenger and Grandmaster LP cutoffs from LadderEye, for your client's region by default, with a region picker on the card. Refreshed every 5 minutes; if the service can't be reached the card says so.
  - **Notes** (saved as you type) and **Links** (your own `https://` links).

  **Card darkness** lets the backdrop show through. The dashboard starts below the top bar and scrolls on its own. Friends refresh every 20 seconds, games every 2 minutes, and only while those cards are on screen.

  **Customize** (top right of the dashboard) lets you rearrange the cards: drag a card by its handle (holding it near the top or bottom edge scrolls), or focus the handle and use the arrow keys. Each card also has a show/hide toggle and, where it makes sense, half or full width. Hidden cards stay visible but dimmed while customizing, so you can bring them back. **Reset** restores the default layout and shows every card; **Done** leaves Customize mode. Hiding a card is the same as unticking it under Cards in the Home settings, which also has a **Reset layout** button.
- **Trim tabs**: keeps Riot's home but hides the tabs you tick, plus tab icons and promo art.
- **Off**: Riot's home, untouched. `Show Riot's home tab` in `Ctrl+K` switches quickly.

## Top bar

- **Riot's**: unchanged.
- **Custom**: a slim bar with a Play button and only the menu items you tick. Each button clicks Riot's real item, so navigation works as normal. The bar ends before the window controls and the right panel.
- **Hidden**: no bar. Every menu gets a `Go to …` command in `Ctrl+K`, plus `Open Play`.

Minimize, settings and close always stay visible. `Show Riot's top bar` or `Show the top bar again` in `Ctrl+K` brings the normal bar back.

## Right panel

- **Visible**, **Collapse until hover** (slides off to the right leaving a thin gold strip; hover the strip to bring it back), or **Hidden** (`Show the right panel` in `Ctrl+K` restores it).
- **Hide parts**: the profile card, the friends header with its buttons, the friends list, and the bottom bar. Each part is found from something only it contains (the profile icon, `.lol-social-actions-bar`, `lol-social-roster`, `.lol-social-lower-pane-container`), so the switches keep working if Riot renames the wrappers around them.
- **See-through** with a **Panel tint**, so the backdrop shows behind the panel.
- **Divider**: a line between the client and the panel, with its own color and width.

With **Collapse until hover**, opening a menu from the panel (like a friend's right-click menu) and moving onto it can make the panel slide away, since the pointer has left it.

## How it works

Riot's own elements are only hidden with CSS, never removed, so the client keeps working underneath. Everything on the dashboard comes from the client itself (friends, match history, ranked stats, region), except the apex cutoffs, which come from `https://maoloader.com/api/cutoffs`, a proxy for LadderEye's ladder data. Everything shares one stylesheet of rules and one watcher for page changes, batched to once per frame. Settings are saved in the maoloader DataStore under `steeles-ui.settings`; on the first run they're carried over from `client-backdrop.settings` and `clean-home.settings`.

The plugin is an ES module split by area: `src/backdrop.js`, `src/home.js`, `src/topbar.js`, `src/panel.js`, the tabbed window in `src/settings.js`, and shared helpers in `src/core.js`.
