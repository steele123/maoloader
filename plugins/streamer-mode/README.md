# Streamer Mode

Hide other players' details, and your own, while you stream or record. The League client has no streamer mode of its own: the game can hide player names in game, but the client's friends list, chat, lobby and your Riot ID stay on screen.

**Ctrl+Shift+H** turns it on and off anywhere in the client, or use Ctrl+K → `Turn on streamer mode`. A small "Streamer mode" label with a red dot in the top corner shows when it's on.

## What it hides

- **Names, Riot IDs and linked Discord names, always:** yours, your friends', and everyone in hover cards, chat, the lobby, champ select, profiles and post-game scoreboards.
- **Status messages** (on by default): your and your friends' custom messages. Game statuses like "In game" stay.
- **Chat** (on by default): messages, conversation previews and who you're talking to.
- **Friend requests** (on by default): the whole friend requests section.
- **Names in game** (off by default): turns on the game's own "hide player names" setting while streamer mode is on, and puts your old setting back after.

Each hidden name keeps its place, but its text turns invisible and a slim rounded bar runs through the line, like a loading placeholder: soft and frosted (**Blur**) or solid (**Solid bars**), chosen under **How names are hidden**. Bar lengths vary from row to row so lists look natural, but never depend on the name, so nothing about it shows, not even its length. Status messages get a fainter, shorter bar. Chat messages and a few parts Riot draws in sealed components are blurred instead. Hidden text can't be selected or copied either.

## maoloader's own screens

While streamer mode is on, the page carries `data-maoloader-streamer` on `<html>` (set to `blur` or `bars`). Steele's UI's home dashboard hides your name and your friends' names, and Friend Alerts toasts say "A friend" instead of a name. Plugin authors can do the same: mark names with `data-streamer-hide`, or check `document.documentElement.hasAttribute("data-maoloader-streamer")`.

Settings are in Ctrl+K → **Plugin settings** → Streamer Mode, saved in the maoloader DataStore under `streamer-mode.settings`.

## Endpoints

| Feature | Request |
| --- | --- |
| Names in game | `GET` / `PATCH /lol-game-settings/v1/game-settings` (`HUD.HidePlayerNames`) |
