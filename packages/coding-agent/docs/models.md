# Model configuration

Models are declared in `~/.eagent/models.json`. Only the `litellm` provider and `openai-completions` API are accepted.

Required provider fields:

- `baseUrl`: LiteLLM OpenAI-compatible endpoint, including `/v1` when required.
- `api`: must be `openai-completions`.
- `models`: at least one deployment definition.

Optional fields include `name`, `apiKey`, `headers`, `authHeader`, and OpenAI-compatible request flags. Each model can define `name`, `reasoning`, `thinkingLevelMap`, `input`, `cost`, `contextWindow`, `maxTokens`, and headers.

```json
{
  "providers": {
    "litellm": {
      "baseUrl": "http://127.0.0.1:4000/v1",
      "api": "openai-completions",
      "apiKey": "$LITELLM_API_KEY",
      "models": [
        {
          "id": "deepseek-v4-pro",
          "reasoning": true,
          "contextWindow": 128000,
          "maxTokens": 16384,
          "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 }
        }
      ]
    }
  }
}
```

`$NAME` and `${NAME}` read environment variables. A leading `!command` resolves a value by running an explicit local command. Configuration is validated without contacting the endpoint.
