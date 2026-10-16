# Event recorder

See every live event the League client sends: the same events plugins receive from
`socket.observe`. Use it to find which endpoint to watch and what its data looks like.

## Using it

1. Press **Ctrl+K** and run **Open the event recorder**. Recording starts straight away.
2. Do something in the client: open a lobby, queue, enter champ select, change your status.
3. Events appear newest first. Click one to see its data.

- **Filter** by any part of the endpoint, for example `gameflow` or `champ-select`.
- **Create / Update / Delete** chips show or hide each kind of event.
- **Endpoints** lists every endpoint that fired, busiest first, so you can see what's available at a glance.
- **Copy observe snippet** gives you ready-to-paste code for the selected endpoint.
- **⤓** saves what's shown as JSON in `plugins/event-recorder/recordings/`.
- Drag the panel by its title bar.

## Settings

Open **Ctrl+K → Settings: Event recorder** (needs maoloader 0.1.7 or newer):

- **Record from client start**: catch events sent while the client loads.
- **Events to keep**: how many to hold in memory (200–5000). Older ones are dropped first.
- **Keep event data**: turn off to log only which endpoints fire.
- **Ignore endpoints**: comma-separated beginnings to skip, such as `/lol-hovercard`.
- **Open the panel on client start**.

Events stay in memory only, and clear when the client reloads, unless you save them.
