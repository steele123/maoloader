# Champ Select Tools

A small HUD that shows up in champ select and goes away when it ends.

## What it shows

- The current phase (planning, bans and picks, finalization) and a countdown that turns red under 10 seconds.
- Your assigned position.
- Whether it's your turn to ban or pick, and the champion you're hovering or playing.

## Actions

- **Random skin**: picks a random skin you own for your locked champion. Available once your pick is locked.
- **Reroll (n)**: ARAM reroll, shown in modes with a bench.
- **Dodge**: leaves champ select. You have to click twice within 3 seconds, so a single misclick can't dodge. Dodging in ranked costs LP and adds a queue timer, same as closing the client.

## Auto pick and ban

Off by default. Open it with the ⚙ button on the HUD, or `Auto pick and ban settings` in the command bar (`Ctrl+K`).

- Set two picks and a ban for each role, plus an **Any role** row used for blind pick and as a fallback. Type a champion name; the box suggests names as you type.
- **Hover my pick** shows your first available pick to the team as soon as champ select opens.
- **Ban for me** bans your role's ban when your ban turn starts. It never bans a champion a teammate is hovering.
- **Lock in for me** locks when your pick turn starts, after the **Lock delay**. A toast counts down with a `Don't lock` button. Whatever is hovered when the delay ends is what gets locked, so picking something else by hand during the delay wins.
- Picks that are banned, already taken, hovered by a teammate or not owned are skipped, and it moves on to the next one. If none are left, it tells you to pick manually.

The HUD shows an **Auto** badge while it's on. `Turn off auto pick and ban` in the command bar switches it off quickly.

## Controls

- Drag the header to move the HUD. Double-click the header to put it back in the top-right corner.
- `−` / `+` collapses it to a single line with the timer.
- From the command bar (`Ctrl+K`): `Hide champ select HUD` / `Show champ select HUD`, and `Reset champ select HUD position`.

Settings are saved in the maoloader DataStore under `champ-select-tools.settings`.

## Endpoints

| Feature | Request |
| --- | --- |
| Session updates | socket `/lol-champ-select/v1/session` |
| Champion names | `GET /lol-game-data/assets/v1/champion-summary.json` |
| Random skin | `GET /lol-champ-select/v1/skin-carousel-skins`, `PATCH /lol-champ-select/v1/session/my-selection` |
| Reroll | `POST /lol-champ-select/v1/session/my-selection/reroll` |
| Dodge | `POST /lol-login/v1/session/invoke` (`teambuilder-draft` `quitV2`) |
| Auto hover, ban, lock | `PATCH /lol-champ-select/v1/session/actions/{id}`, `POST /lol-champ-select/v1/session/actions/{id}/complete` |
| Owned and bannable champions | `GET /lol-champ-select/v1/pickable-champion-ids`, `GET /lol-champ-select/v1/bannable-champion-ids` |
