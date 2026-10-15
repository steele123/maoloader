# Rune Presets

Save rune pages as named presets, apply one in a click, and have a champion's preset applied automatically when you lock that champion in. Presets are stored by the plugin, so you can keep as many as you like no matter how many rune pages you own.

## Usage

- Set up a rune page in the client the normal way.
- Open the command bar (`Ctrl+K`), run `Rune presets`, give it a name and optionally a champion, and press `Save`. `Save current rune page as preset` in the command bar does the same in one step, named after the page.
- Press `Apply` on a preset to load it. `×` deletes it.
- **Apply in champ select**: when you lock in a champion that has a tagged preset, it's applied for you.

## Which page it writes to

The plugin never edits your own pages without asking:

1. If you have a page whose name starts with `mao · `, the preset is written there.
2. Otherwise, if you have a free page slot, it creates that page.
3. Otherwise it asks before overwriting your current page. That page is then renamed `mao · …` and used from then on.

Settings are saved in the maoloader DataStore under `rune-presets.settings`.

## Endpoints

| Feature | Request |
| --- | --- |
| Read pages | `GET /lol-perks/v1/pages`, `/currentpage`, `/inventory`, `/styles` |
| Apply | `PUT /lol-perks/v1/pages/{id}` or `POST /lol-perks/v1/pages`, then `PUT /lol-perks/v1/currentpage` |
| Auto-apply | socket `/lol-champ-select/v1/session` |
