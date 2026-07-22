# SDK Examples

These examples demonstrate `createAgentSession()` and `createAgentSessionRuntime()` with the LiteLLM-only `ModelRuntime`.

Configure `~/.eagent/models.json` and, if required, `LITELLM_API_KEY` before running an example.

```bash
cd packages/coding-agent
npx tsx examples/sdk/01-minimal.ts
```

The examples cover model selection, system prompts, skills, tools, extensions, `AGENTS.md`, prompt templates, settings, sessions, full-control embedding, and runtime-backed session replacement.

```typescript
import { createAgentSession, ModelRuntime, SessionManager } from "@enterprise-agent/coding-agent";

const modelRuntime = await ModelRuntime.create();
const model = modelRuntime.getModel("litellm", "enterprise-default");
if (!model) throw new Error("Configure the LiteLLM model first");

const { session } = await createAgentSession({
  model,
  modelRuntime,
  sessionManager: SessionManager.inMemory(),
});

await session.prompt("Review the current project.");
```
