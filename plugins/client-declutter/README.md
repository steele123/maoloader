# Declutter

Hides parts of the League client you don't use. Nothing is hidden until you switch it on.

## Usage

- Open the command bar (`Ctrl+K`) and run `Declutter settings`.
- Switch on the presets you want hidden. Changes apply right away.
- Add your own selectors under **Custom selectors**, one per line. Lines starting with `//` are ignored. The DOM Inspector plugin (`maoloader-devtools`) can copy a selector for any element you click.
- Run `Pause declutter` to show everything again for a moment, and `Resume declutter` to bring the rules back.

Settings are saved in the maoloader DataStore under `client-declutter.settings`.

## Presets

| Preset | Selectors |
| --- | --- |
| Home tab artwork | `.activity-center__tab_content_image`, `.activity-center__tab_label_icon` |
| Lobby background art | `.parties-background` |
| TFT nav tab | `.menu_item_navbar_tft` |
| RP top-up button | `.currency-rp-top-up` |
| Notifications bell | `.notifications-button` |
| Support button | `.app-controls-support` |
| Top bar dividers | `.right-nav-vertical-rule` |
| Version badge | `.alpha-version-panel` |

Riot renames client classes from time to time, so a preset can stop working after a patch. If one does, find the new selector with the DOM Inspector and add it under custom selectors.

## Limits

The rules go into one page-level stylesheet, so they can only reach elements in the main document. Elements inside a component's shadow root are out of reach. Selectors containing `{`, `}`, `;` or `/*` are rejected so a typo can't break the other rules.
