# Session Tracker changelog

## 0.3.0 - 2026-10-16

### New
- **Tilt guard** (off by default): after a losing streak you choose, it suggests a break and can lock Find Match for up to 30 minutes. End it early from the toast, the card, or Ctrl+K → `End tilt break`.

### Fixed
- The card now shows when the client starts. Before, the client could replace it with an empty copy while starting up, so it stayed invisible until you hid and showed it again.

## 0.2.0 - 2026-10-15

### Changed
- Settings moved to maoloader's shared settings window: Ctrl+K → **Plugin settings** → Session Tracker. Your saved settings carry over. Changing settings needs maoloader 0.1.7 or newer.
- First proper settings: show the card, a summary after each game, daily reset, ranked only, and **Start a new session**. Before, these were only Ctrl+K toggles, and the summary couldn't be turned off.

## 0.1.0 - 2026-10-15

First release. Track today's wins, losses, streak, and LP change in a small card, with a summary after each game.
