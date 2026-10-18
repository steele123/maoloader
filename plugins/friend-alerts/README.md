# Friend Alerts

A toast when chosen friends come online or finish a game. If you're in a lobby, the toast has an `Invite` button.

## Usage

- Open the settings: `Ctrl+K` → **Plugin settings** → **Friend Alerts** (running `Friend alerts` from the command bar opens the same tab).
- Choose **Chosen friends** and tick the friends you care about (search helps with long lists), or choose **All friends**.
- Switch **Comes online** and **Finishes a game** on or off. "Online" means on the League client: a friend opening the mobile app doesn't trigger an alert, but moving from mobile to the client does.

The first check after the client loads only records who's around, so you don't get a flood of alerts at startup. If more than three alerts land at once, they're merged into one toast.

Friends are checked every 15 seconds, so an alert can arrive up to 15 seconds late.

Settings, including the friends you ticked, are saved in the maoloader DataStore under `friend-alerts.settings`. Changing them needs maoloader 0.1.7 or newer; older versions keep using what's saved.

## Streamer Mode

While Streamer Mode is on, toasts say "A friend" instead of a name and leave out status messages.

## Endpoints

| Feature | Request |
| --- | --- |
| Friends | `GET /lol-chat/v1/friends` |
| Lobby check | `GET /lol-gameflow/v1/gameflow-phase` |
| Invite | `POST /lol-lobby/v2/lobby/invitations` |
