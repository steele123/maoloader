# Steele's UI changelog

## 0.3.0 - 2026-10-18

### New
- Six more theme presets: Rose, Emerald, Frost, Void, Crimson and Glass. Glass tints a blurred view of your desktop through the client.

### Changed
- A livelier home. The greeting card shows the splash art of the profile background you picked (or your most played recent champion) and holds your Quick play buttons, with your first queue as the main button, so there's no near-empty Quick play card anymore.
- The Rank card shows each queue's rank crest, with LP beside the queue name and a win-rate bar under your record.
- Friends online shows each friend's profile icon, and Friends playing shows the champion a friend is playing while they're in game.
- Picking a preset now also resets the backdrop's window effect and opacity, so a see-through look like Glass doesn't carry over into the next preset.
- Custom game lobbies match the rest: each team is a card, open seats stay quiet until you hover them, and the Invited and Spectators panels are cards too.

### Fixed
- The Recent games record (like 4W 4L) now counts the games the card lists. It could count more games than it showed.

## 0.2.5 - 2026-10-18

### Changed
- Works with Streamer Mode: your name and your friends' names on the home dashboard are hidden while it's on.

## 0.2.4 - 2026-10-16

### Fixed
- A friend's profile now opens on top of the custom home instead of underneath it, and its close button shows in full over the custom top bar, as it does over Riot's.
- The open right panel (with **Collapse until hover**) now slides over the custom top bar directly.
- The custom top bar steps aside on the post-game screen, like Riot's does. Before, it covered the Victory or Defeat header, the game details and the View Advanced Details button.

### Changed
- Tidier home: cards keep their own height and pack into the two columns, so short cards like Quick play and Rank no longer stretch into big empty boxes, and the page is about a fifth shorter.
- **Customize** moved onto the greeting card, next to the settings gear, so the cards start at the top. With the greeting hidden, it stays above the cards.
- **Hide screen art** now also clears the map art behind the post-game screen.
- With **Neutral colours**, the post-game Continue button turns grey like the lobby's Find Match, and the right panel's party card (a looping blue video), Clash panel art and the gold ring around your icon turn grey too.
- In Customize mode, each card's tools sit on its top edge instead of covering what the card shows, like the clock.

## 0.2.3 - 2026-10-15

### Changed
- **Hide screen art** now also clears the art behind Collection, Loot (its looping video), the Store and Clash, so your backdrop shows on those screens too.
- **Accent colour** and **Neutral colours** now reach Riot's own buttons, inputs and tabs, which keep their styles sealed inside the component. With Neutral colours, framed buttons like Purchase RP and Create Team turn grey as well, and so do champ select's Lock In button, its rune and spell buttons, and the dark gold-brown frames and borders around the client.

### Fixed
- The custom top bar steps aside in champ select. Before, it covered champ select's "Pick your champion!" title and timer.
- The custom top bar now meets the right panel with no gap. Before, it stopped a few pixels short, leaving a small notch beside the panel.

## 0.2.2 - 2026-10-15

### New
- **Mono** look in Theme → Presets: black surfaces, grey borders, white text and the Geist font, for a clean, minimal client.
- **Neutral colours** switch in the Theme tab: turns the client's navy, teal and cream into greys, and greys out the lobby's gold buttons. Bright colours that mean something, like status dots, rarity, wins and losses, stay.
- **Geist** font option, included with Steele's UI.

### Fixed
- Steele's UI's own home and top bar now use the font you pick in the Theme tab.
- Recolouring now also reaches stylesheets that finish loading after a screen opens, and settings the client marks as important.

## 0.2.1 - 2026-10-15

### New
- **Lobby** tab: open party seats become cards you can click anywhere to invite, and the lobby chat and progression panel get the same card look as the home screen. They follow your accent colour.
- Hide the lobby chat while it's switched off (when you're on your own), and optionally hide the progression panel.

### Fixed
- **Collapse until hover** now gives the panel's space to the client, like **Hidden** does. Before, the lobby and other screens stopped 223px short and left an empty strip.
- The open panel covers the custom top bar instead of sliding under it, and stays readable over the page.
- The custom top bar no longer runs under the minimise, settings and close buttons, and no longer covers the close button of dialogs like the invite window.

## 0.2.0 - 2026-10-15

### New
- **Theme** tab: one-click looks (Hextech, Midnight, Focus, Ember, or back to Steele's default), each undoable right after.
- **Share your look**: copy a code with your whole setup and send it to friends, or paste theirs to try it.
- **Accent colour**: recolour the client's gold across buttons, borders, highlights and text.
- **Font**: switch the whole client to Clean (Segoe UI), Serif, or any font on your PC.
- **Profile** tab: set your profile background from any skin you own, and pick your banner, without opening your profile.

### Changed
- Settings now open in maoloader's shared settings window (Ctrl+K → **Plugin settings** → Steele's UI), in its navy and gold look, with the same tabs. On maoloader 0.1.6 and older, the old window still opens.

## 0.1.1 - 2026-10-15

### Fixed
- Hiding the right panel now gives its space to the rest of the client. Before, it left an empty strip on the right and the home dashboard stopped short.

## 0.1.0 - 2026-10-15

First release. Backdrop, custom home, custom or hidden top bar, and right panel controls for the League client, with one tabbed settings window.
