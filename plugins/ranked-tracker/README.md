# Ranked Tracker

The League client doesn't keep your LP history, so Ranked Tracker does. It saves your Solo/Duo and Flex rank after every ranked game, and each time the client starts.

Open it with Ctrl+K → `Ranked tracker`, or Ctrl+K → **Plugin settings** → Ranked Tracker. For each queue it shows:

- Your current rank, record and win rate.
- Your LP change today, over the last 7 days and over the last 30 days, and your peak.
- An LP graph of your last 120 snapshots, with tier and division lines. From Master up it adds the live Grandmaster and Challenger cutoffs for your region, and how much LP you still need.
- Your last 12 changes, with times.

After each ranked game, a toast shows the LP you won or lost, with a button to the graph (turn it off in the settings).

LP across divisions and tiers adds up, so a promotion from Diamond II at 90 LP to Diamond I at 10 LP counts as +20. Master, Grandmaster and Challenger share one ladder of LP above Diamond I.

History starts when you install the plugin; games before that can't be recovered. It's kept in the maoloader DataStore under `ranked-tracker.history`, up to 1,500 snapshots per queue.

## Endpoints

| Feature | Request |
| --- | --- |
| Rank and record | `GET /lol-ranked/v1/current-ranked-stats` |
| After each game | socket `/lol-gameflow/v1/gameflow-phase` |
| Region | `GET /riotclient/region-locale` |
| Apex cutoffs | `GET https://maoloader.com/api/cutoffs?region=…` (LadderEye data) |
