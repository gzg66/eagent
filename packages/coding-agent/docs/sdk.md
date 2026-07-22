# SDK

Install the package:

```bash
npm install @enterprise-agent/coding-agent
```

The SDK uses the same LiteLLM-only `ModelRuntime` as the CLI. Configure `models.json` before creating a session; no provider is discovered remotely.

```typescript
import {
  createAgentSession,
  ModelRuntime,
  SessionManager,
} from "@enterprise-agent/coding-agent";

const modelRuntime = await ModelRuntime.create({
  modelsPath: "/app/config/models.json",
  authPath: "/app/config/auth.json",
  allowModelNetwork: false,
});

if (process.env.LITELLM_API_KEY) {
  await modelRuntime.setRuntimeApiKey("litellm", process.env.LITELLM_API_KEY);
}

const model = modelRuntime.getModel("litellm", "enterprise-default");
if (!model) throw new Error("LiteLLM model is not configured");

const { session } = await createAgentSession({
  model,
  modelRuntime,
  sessionManager: SessionManager.inMemory(),
});

session.subscribe((event) => {
  if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
});

await session.prompt("Summarize the current repository.");
```

## Runtime authentication

Authentication priority is:

1. `setRuntimeApiKey("litellm", key)`
2. the stored LiteLLM key in `auth.json`
3. `LITELLM_API_KEY`
4. the `apiKey` expression in `models.json`

Runtime overrides are not persisted. `allowModelNetwork` only controls optional model-list refresh behavior; it does not send a completion request by itself.

## Tools

Select built-in tools with the `tools` option:

```typescript
const { session } = await createAgentSession({
  model,
  modelRuntime,
  tools: ["read", "grep", "find", "ls"],
  sessionManager: SessionManager.inMemory(),
});
```

Extensions may add tools, events, commands, and UI components. See [Extensions](extensions.md).

## Resources

`DefaultResourceLoader` loads extensions, skills, prompt templates, themes, and `AGENTS.md` files. Pass a custom loader when embedding Enterprise Agent in another application.

```typescript
import { createAgentSession, DefaultResourceLoader } from "@enterprise-agent/coding-agent";

const loader = new DefaultResourceLoader({ cwd: process.cwd() });
await loader.reload();

const { session } = await createAgentSession({ model, modelRuntime, resourceLoader: loader });
```

## Sessions and events

`AgentSession` exposes `prompt`, `steer`, `followUp`, `compact`, `abort`, `setModel`, `setThinkingLevel`, `subscribe`, and `dispose`. Persistent and in-memory session managers share the same interface.

Use `createAgentSessionRuntime` when the host must replace the active session for resume, fork, clone, or import workflows. Use `runPrintMode` or `runRpcMode` for the CLI-compatible non-interactive modes.

See the examples under `packages/coding-agent/examples/sdk/` and the [RPC documentation](rpc.md).
