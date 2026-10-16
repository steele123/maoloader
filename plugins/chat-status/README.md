# Status

Choose how friends see you (online, away, mobile or offline) and set, save or rotate a custom status message.

## Usage

- From the command bar (`Ctrl+K`): `Appear online`, `Appear away`, `Appear on mobile`, `Appear offline`.
- Ctrl+K → **Plugin settings** → Chat Status (or run `Status settings`) has the rest:
  - **Appear as**: the same four choices.
  - **Keep it**: re-applies your availability and message after games and after a client restart. The client resets you to online when a game ends; this puts your choice back.
  - **Status message**: type a message and press `Set` (or Enter). `Save` adds it to your saved messages.
  - **Saved messages**: `Use` sets one; `×` deletes it.
  - **Rotate saved messages**: cycles through them every 1 to 60 minutes. Needs at least two.

While you're in a game, the client shows you as in game no matter what; the plugin leaves that alone and re-applies your choice afterwards.

Settings are saved in the maoloader DataStore under `chat-status.settings`.

## Endpoints

| Feature | Request |
| --- | --- |
| Availability and message | `GET` / `PUT /lol-chat/v1/me` (`availability`, `statusMessage`) |
| Re-apply after games | socket `/lol-gameflow/v1/gameflow-phase` |
