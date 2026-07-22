# LiteLLM

Enterprise Agent supports one LLM provider: `litellm`.

Set the gateway key and define the endpoint and deployments in `~/.eagent/models.json`:

```bash
export LITELLM_API_KEY=your-internal-key
```

```json
{
  "providers": {
    "litellm": {
      "name": "LiteLLM",
      "baseUrl": "https://llm.internal.example/v1",
      "api": "openai-completions",
      "apiKey": "$LITELLM_API_KEY",
      "models": [
        {
          "id": "deepseek-v4-pro",
          "name": "DeepSeek V4 Pro",
          "reasoning": true,
          "contextWindow": 128000,
          "maxTokens": 16384
        }
      ]
    }
  }
}
```

You may instead run `/login litellm` to save the key in `auth.json`. Other provider IDs and API protocols are rejected.

Startup does not probe the gateway or fetch a model catalog. A network request occurs only when a prompt is sent or an explicitly requested authentication/package operation needs it.
