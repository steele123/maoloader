# Auto-accept

Accepts League ready checks for you after a short delay. You can cancel any accept before the delay runs out.

## Usage

- Find a match as usual. When the ready check appears, a toast counts down and then accepts.
- Click `Don't accept` on the toast to skip that one ready check.
- Open the command bar (`Ctrl+K`) and run `Turn off auto-accept` / `Turn on auto-accept` to toggle it.
- Run `Auto-accept settings` to change the delay (0 to 10 seconds; 0 accepts at once).

Settings are saved in the maoloader DataStore under `auto-accept.settings`.

## How it works

The plugin watches `/lol-matchmaking/v1/ready-check` on the client socket. While the check is `InProgress` and you have not responded, it waits for the delay and then sends `POST /lol-matchmaking/v1/ready-check/accept`. If you accept or decline yourself first, it does nothing.
