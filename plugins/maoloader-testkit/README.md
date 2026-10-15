# maoloader TestKit

Diagnostic plugin for checking whether maoloader loaded correctly inside the League client.

It exercises:

- Plugin UI mounting and cleanup
- CSS loaded from `https://plugins/<plugin>/styles.css`
- `Toast`
- `DataStore`
- `PluginFS`
- `openPluginsFolder`
- Basic route tracking
- A simple LCU fetch probe

Drop the `maoloader-testkit` folder into `app/bin/plugins`, restart or reload the League client, then use the floating panel buttons.

The PluginFS test writes to:

```text
testkit-output/last-run.json
```
