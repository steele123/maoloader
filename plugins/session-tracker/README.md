# Session Tracker

A small card with today's record, your current streak, recent results and how much LP you've gained or lost. After each game a toast sums it up.

## The card

- **Record**: wins and losses, win rate, and your streak once it's two or more.
- **Results**: one square per game, oldest on the left. Hover a square for the champion and K/D/A.
- **LP**: your current Solo/Duo and Flex rank, and the change since the session started.

Drag the card by its header; double-click the header to put it back in the bottom-left corner. `↻` refreshes it and `×` hides it.

## Command bar (`Ctrl+K`)

- `Hide session tracker` / `Show session tracker`
- `Start a new session`: counts from now instead of midnight, and turns off the daily reset.
- `Session tracker: reset daily at midnight` / `stop resetting daily`
- `Session tracker: count ranked only` / `count all games`

## Details

- Remakes (games under 5 minutes) don't count.
- The LP change is measured from the first time the tracker loads in a session. If you install it partway through the day, games before that still count toward the record but not toward the LP change.
- LP across divisions and tiers is added up, so a promotion from Gold II at 90 LP to Gold I at 10 LP shows as +20 LP.
- The tracker only reads your own match history and ranked stats.

Settings are saved in the maoloader DataStore under `session-tracker.settings`.

## Endpoints

| Feature | Request |
| --- | --- |
| Games | `GET /lol-match-history/v1/products/lol/current-summoner/matches` |
| Rank and LP | `GET /lol-ranked/v1/current-ranked-stats` |
| Refresh after games | socket `/lol-gameflow/v1/gameflow-phase` |
