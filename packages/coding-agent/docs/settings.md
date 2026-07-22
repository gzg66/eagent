# Settings

Global settings are stored at `~/.eagent/settings.json`; trusted project overrides are stored at `.eagent/settings.json`. Project values override global values and nested objects merge by key.

## LiteLLM selection

```json
{
  "defaultProvider": "litellm",
  "defaultModel": "deepseek-v4-pro",
  "defaultThinkingLevel": "medium",
  "enabledModels": ["deepseek-v4-pro", "fast-code"]
}
```

`defaultProvider` must be `litellm`. Model definitions and the gateway endpoint belong in `models.json`, not `settings.json`.

## Common settings

| Setting | Purpose |
|---|---|
| `theme` | Built-in or custom terminal theme |
| `externalEditor` | Command used by Ctrl+G |
| `quietStartup` | Hide the startup header |
| `defaultProjectTrust` | `ask`, `always`, or `never` |
| `defaultThinkingLevel` | `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max` |
| `hideThinkingBlock` | Hide thinking output |
| `showCacheMissNotices` | Show significant cache-miss notices |
| `enabledModels` | LiteLLM model patterns used for cycling |
| `steeringMode` | Delivery policy for steering messages |
| `followUpMode` | Delivery policy for follow-up messages |
| `sessionDir` | Session storage directory |
| `shellPath` | Shell executable |
| `shellCommandPrefix` | Prefix for shell commands |
| `httpProxy` | Explicit HTTP/HTTPS proxy |

Compaction and retry use nested objects:

```json
{
  "compaction": {
    "enabled": true,
    "reserveTokens": 16384,
    "keepRecentTokens": 20000
  },
  "retry": {
    "enabled": true,
    "maxRetries": 3,
    "baseDelayMs": 2000,
    "provider": {
      "timeoutMs": 300000,
      "maxRetries": 0,
      "maxRetryDelayMs": 60000
    }
  }
}
```

## Resources

`packages`, `extensions`, `skills`, `prompts`, and `themes` select local or installed resources. Review executable extensions and package dependencies before enabling them. Project resources load only after project trust is granted.

Use `/settings` for interactive changes. Restart or `/reload` after editing files directly.
