# Dodge Timer

Dodging champ select locks you out of queue for a while, and the client only tells you how long when you try to queue. Dodge Timer keeps it on screen:

- **Countdown** (on by default): a small timer at the top of the client while you can't queue. Click it for details.
- **Tell me when it's over** (on by default): a toast, with a short sound, when you can queue again. It also covers a lockout from a party member's dodge.
- **Start the queue when it's over** (off by default): starts searching as soon as the lockout ends, but only when you're the lobby leader and still in the lobby.
- **Remind me in champ select** (on by default): if you dodged in the last 24 hours, a toast when champ select starts says how long ago and how long that lockout was.

## How close am I to a longer lockout?

Each dodge soon after another gives a longer lockout, and Riot lowers it again after you go a while without dodging. The client doesn't show where you are, so Dodge Timer keeps the dodges it sees: Ctrl+K → `Dodge timer` shows your dodges in the last 24 hours and 7 days, your last lockout and how long it was. Lockouts that happened before you installed Dodge Timer aren't there.

The lockout keeps counting down if you restart the client; Dodge Timer picks it up again when the client opens.

## Command bar (`Ctrl+K`)

- `Dodge timer`: the time left, your recent dodges, and the settings.

Settings are saved in the maoloader DataStore under `dodge-timer.settings`, and your dodges under `dodge-timer.state`.

## Endpoints

| Feature | Request |
| --- | --- |
| Lockout | socket and `GET /lol-lobby/v2/lobby/matchmaking/search-state`, `/lol-matchmaking/v1/search` (`QUEUE_DODGER` errors) |
| Your dodge or a party member's | `GET /lol-summoner/v1/current-summoner` |
| Champ select reminder | socket `/lol-gameflow/v1/gameflow-phase` |
| Auto-queue | `GET /lol-lobby/v2/lobby`, `POST /lol-lobby/v2/lobby/matchmaking/search` |
