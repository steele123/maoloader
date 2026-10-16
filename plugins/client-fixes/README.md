# Client Fixes

One-click fixes for the League client's common stuck states, plus recovery that runs on its own. None of the fixes leave champ select or decline anything, so none can cost you a dodge or leaver penalty.

## Fix it now

Run any of these from Ctrl+K (type `fix`, or the problem, like `black screen`) or from Ctrl+K → **Plugin settings** → Client Fixes.

| Fix | When to use it |
| --- | --- |
| **Restart the client** | Black or frozen screen, missing buttons, or a client that has slowed down. The client closes and reopens in a few seconds; you stay logged in and keep your lobby. |
| **Refresh the client view** | A lighter fix for a screen that won't update or a button that does nothing. Redraws the client without closing it. |
| **Reconnect to your game** | Your game is still running but there's no Reconnect button, or it does nothing. |
| **Skip stuck post-game stats** | Stuck on "Waiting for stats" or a post-game screen that won't load. |
| **Clear a stuck queue** | The client says you're in queue, or won't let you queue, when you aren't searching. |
| **Clear a failed game launch** | The game didn't start after champ select and the client is stuck waiting for it. |

## Automatic

- **Offer to reconnect** (on by default): a toast with a **Reconnect** button when the client notices your game is still running.
- **Skip stuck post-game stats** (on by default): if "Waiting for stats" hasn't finished after 60 seconds (30 to 180, your choice), it's skipped so you can play again.
- **Refresh after each game** (off by default): redraws the client once you're back in the lobby or on home after a game, clearing the lag it builds up over long sessions.

Settings are saved in the maoloader DataStore under `client-fixes.settings`.

## Endpoints

| Fix | Request |
| --- | --- |
| Restart the client | `POST /riotclient/kill-and-restart-ux` |
| Refresh the client view | `location.reload()` |
| Reconnect | `POST /lol-gameflow/v1/reconnect` |
| Skip post-game stats | `POST /lol-end-of-game/v1/state/dismiss-stats` |
| Clear a stuck queue | `DELETE /lol-lobby/v2/lobby/matchmaking/search` and `DELETE /lol-matchmaking/v1/search` |
| Clear a failed launch | `POST /lol-gameflow/v1/ack-failed-to-launch` |
| Game state | `GET /lol-gameflow/v1/gameflow-phase`, and its live event |
