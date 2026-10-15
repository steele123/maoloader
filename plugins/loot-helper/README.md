# Loot Helper

Turns champion shards into Blue Essence in one go, after showing you exactly what will be disenchanted.

## Usage

1. Open the command bar (`Ctrl+K`) and run `Disenchant champion shards`.
2. Check the list: each champion, how many shards, and the Blue Essence they give. The total is at the top.
3. Adjust if needed:
   - **Only champions I own** (on by default): leaves shards for champions you could still unlock.
   - **Keep one of each**: leaves one shard per champion.
4. Click the disenchant button, then click it again within 4 seconds to confirm.

Disenchanting can't be undone. Only champion shards are ever included; skins, skin shards, permanent champions, chests and keys are never touched.

Settings are saved in the maoloader DataStore under `loot-helper.settings`.

## Endpoints

| Feature | Request |
| --- | --- |
| Read loot | `GET /lol-loot/v1/player-loot` |
| Disenchant | `POST /lol-loot/v1/recipes/CHAMPION_RENTAL_disenchant/craft?repeat={count}` |
