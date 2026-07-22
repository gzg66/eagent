# Enterprise Agent AI

LiteLLM-only language-model runtime used by Enterprise Agent.

## Supported transport

- Provider ID: `litellm`
- API: `openai-completions`
- Credential: `LITELLM_API_KEY`, a stored API key, or an explicit request key
- Endpoint: an explicit LiteLLM OpenAI-compatible `baseUrl`

No vendor model catalog, account-login flow, image-model provider, telemetry, update check, or remote model lookup is included. Importing the package and creating a runtime do not perform network requests. Network access begins only when the caller sends a model request.

```ts
import { createModels, litellmProvider } from "@enterprise-agent/ai";

const models = createModels();
models.setProvider(litellmProvider());
```

Model definitions are supplied by the host application. The coding CLI reads them from `~/.eagent/models.json`; see its [model configuration](../coding-agent/docs/models.md).

The request implementation uses the OpenAI-compatible chat-completions protocol expected by LiteLLM. Provider-specific SDKs and direct vendor authentication are intentionally excluded.

## Development

```bash
npm run build
npm test
```

The normal build is offline and compiles checked-in source only.
