# My Builds

Item sets made from your own games, not a website's. After each Summoner's Rift game, My Builds learns what you built on that champion and keeps a set called "My <champion>" in the in-game shop:

- **Start:** your usual starter (Doran's, Dark Seal and so on) and potions.
- **Core:** your three most-built finished items, in the order they usually sit in your inventory.
- **Boots:** the boots you build most.
- **Also built:** your next most common finished items, for when the game calls for something else.
- **Vision:** a Control Ward.

Your item sets are saved to your Riot account, like any you make in the client. My Builds only changes its own sets (their IDs start with `maoloader-my-builds-`); your other sets are left exactly as they are, and **Remove My Builds' item sets** deletes only its own.

## How it learns

The client only shows your latest games, so My Builds keeps each Summoner's Rift game as it comes in: up to 30 per champion, saved in the maoloader DataStore under `my-builds.games`. Remakes and other maps don't count. The client doesn't record when you bought each item, so the order comes from where each item ended up in your inventory, since items fill the first free slot when you buy them. Transformed items count as what you bought (Seraph's Embrace counts as Archangel's Staff).

A champion gets a set after 3 games (1 to 10 in the settings).

## Settings and commands

In Ctrl+K → **Plugin settings** → My Builds: update after each game (on by default), games before a set, **Update now**, and **Remove My Builds' item sets**. The tab also previews each champion's core items.

- `Update my item sets` (Ctrl+K): reads your latest games and rebuilds every set.
- `My builds` (Ctrl+K): opens the settings tab.

## Endpoints

| Feature | Request |
| --- | --- |
| Your games | `GET /lol-match-history/v1/products/lol/current-summoner/matches` |
| Items | `GET /lol-game-data/assets/v1/items.json` |
| Item sets | `GET` / `PUT /lol-item-sets/v1/item-sets/{summonerId}/sets` |
| After each game | socket `/lol-gameflow/v1/gameflow-phase` |
