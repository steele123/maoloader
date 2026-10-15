# Lobby Tools

Lobby shortcuts in the command bar, a **Play again** button after games, and an optional auto re-queue.

## Command bar (`Ctrl+K`)

- `Lobby: …`: one command per queue the client currently offers (ranked, draft, ARAM, vs AI and so on). The list comes from the client, so new or rotating queues show up on their own. Type part of the name, like `lobby aram`.
- `Start queue` / `Stop queue`
- `Leave lobby`
- `Play again`: back to the lobby from the post-game screen.
- `Turn on auto re-queue` / `Turn off auto re-queue`
- `Lobby tools settings`

## After games

- **Play again button** (on by default): a toast after each game with a `Play again` button.
- **Auto re-queue** (off by default): after each game, goes back to the lobby and starts the same queue after a 3 to 30 second delay. The toast has a `Don't re-queue` button, and going back to the lobby yourself cancels it too.

Settings are saved in the maoloader DataStore under `lobby-tools.settings`.

## Endpoints

| Feature | Request |
| --- | --- |
| Queues | `GET /lol-game-queues/v1/queues` |
| Create lobby | `POST /lol-lobby/v2/lobby` |
| Leave lobby | `DELETE /lol-lobby/v2/lobby` |
| Start / stop queue | `POST` / `DELETE /lol-lobby/v2/lobby/matchmaking/search` |
| Play again | `POST /lol-lobby/v2/play-again` |
| After-game trigger | socket `/lol-gameflow/v1/gameflow-phase` |
