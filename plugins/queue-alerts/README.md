# Queue Alerts

Never miss a queue pop. When a match is found:

- **Play a sound** (on by default): a short chime with its own volume, so it plays even with the client's sounds muted.
- **Bring the client to the front** (on by default): shows the client and flashes it in the taskbar if it's minimized or behind other windows.
- **Phone notification** (off until you set one up): a message through a Discord webhook, ntfy, or both. By default it's only sent when the client isn't focused, so you don't get pinged while you're sitting at it.

It alerts once per ready check and works alongside Auto Accept.

## Phone notifications

Set them up in Ctrl+K → **Plugin settings** → Queue Alerts, then press **Send test**.

- **Discord:** in a Discord server you own, open a channel's settings → Integrations → Webhooks → New webhook → Copy webhook URL, and paste it. Discord on your phone notifies you when the message arrives.
- **ntfy:** install the [ntfy](https://ntfy.sh) app, subscribe to a hard-to-guess topic name, and type the same name here. To use your own ntfy server, paste its full `https://` address with the topic instead.

Only the queue name and the time are sent, and only to the webhook or topic you enter. The client can't read the answer from these services, so a mistyped address fails quietly; **Send test** is there to check.

## Command bar (`Ctrl+K`)

- `Test queue alert`: plays the sound and sends a test to your phone.
- `Queue alerts settings`

Settings are saved in the maoloader DataStore under `queue-alerts.settings`.

## Endpoints

| Feature | Request |
| --- | --- |
| Match found | socket `/lol-matchmaking/v1/ready-check` |
| Queue name | `GET /lol-gameflow/v1/session` |
| Bring to front | `POST /riotclient/ux-show`, `POST /riotclient/ux-flash` |
| Discord | `POST` to your webhook, as form data |
| ntfy | `POST` to `https://ntfy.sh/<topic>` or your server, with `title`, `priority` and `tags` in the query |
