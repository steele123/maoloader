# Block List

The client's block list (Settings → Block List) is one long, unsorted list where a single click
unblocks someone. Block List adds what it's missing:

- **Search**: a box above the list that filters as you type, by name, tag or your note, with a
  count like "12 of 227". Esc clears it.
- **Sort**: the client's order, A–Z, or **Newest** (the players you blocked most recently first).
- **Notes**: hover a player and click the pencil to note why you blocked them. Notes show under
  the name and are searchable; **With notes** shows only players you've noted.
- **Block dates**: "Blocked Nov 11" under anyone you block after installing Block List, wherever
  you block them (a profile, the scoreboard, chat). The client keeps no dates, so players blocked
  before that have none.
- **Ask before unblocking** (on by default): a click on a player asks "Unblock this player?" first.
  Turn it off in Ctrl+K → **Plugin settings** → Block List.
- **Copy list**: copies every blocked Riot ID, one per line.

Ctrl+K → `Search block list` opens Settings → Block List with the search box ready.

Notes, dates and your sort are kept on this PC in the maoloader DataStore (`block-list.notes`,
`block-list.seen`, `block-list.settings`). With Streamer Mode on, notes are blurred like names.

## Endpoints

| Feature | Request |
| --- | --- |
| Your block list | `GET /lol-chat/v1/blocked-players` |
| Block dates | socket `/lol-chat/v1/blocked-players` |
