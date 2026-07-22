# Extensions

Extensions are trusted TypeScript modules loaded from the global or project configuration directory. They may register tools, commands, shortcuts, events, and terminal UI.

```typescript
import type { ExtensionAPI } from "@enterprise-agent/coding-agent";

export default function activate(agent: ExtensionAPI): void {
  agent.registerCommand("hello", {
    description: "Show a message",
    handler: async (_args, ctx) => ctx.ui.notify("Hello"),
  });
}
```

Project extensions are executable code and load only after project trust is granted.

## Locations

- Global: `~/.eagent/extensions/`
- Project: `.eagent/extensions/`
- Explicit CLI path: `eagent -e ./extension.ts`

Run `/reload` after changing an extension.

## Events

Use `agent.on(event, handler)` to observe lifecycle events. Common events include:

- `session_start`, `session_shutdown`
- `before_agent_start`, `agent_start`, `agent_end`, `agent_settled`
- `turn_start`, `turn_end`
- `message_start`, `message_update`, `message_end`
- `tool_call`, `tool_result`
- `before_provider_request`, `before_provider_headers`, `after_provider_response`
- `input`, `model_select`, `thinking_level_select`

Handlers receive an extension context with the current working directory, model, session manager, UI, abort signal, and session-control helpers.

## Tools

```typescript
import { Type } from "typebox";
import type { ExtensionAPI } from "@enterprise-agent/coding-agent";

export default function activate(agent: ExtensionAPI): void {
  agent.registerTool({
    name: "lookup_record",
    label: "Lookup record",
    description: "Look up an internal record",
    parameters: Type.Object({ id: Type.String() }),
    async execute(_callId, params) {
      return {
        content: [{ type: "text", text: `Record: ${params.id}` }],
        details: {},
      };
    },
  });
}
```

Tool implementations must honor the supplied abort signal and should avoid exposing secrets in result content.

## Commands and shortcuts

Use `registerCommand`, `registerShortcut`, and `registerFlag` for application integration. Keybindings remain user-configurable; extensions should register semantic shortcuts instead of checking raw key sequences.

## UI

`ctx.ui` provides selectors, confirmation dialogs, input, notifications, widgets, status text, custom components, editor access, and theme information. Guard terminal-only behavior with `ctx.mode === "tui"`.

## LiteLLM provider configuration

Extensions may update only the `litellm` provider. Any other provider ID is rejected.

```typescript
agent.registerProvider("litellm", {
  name: "Enterprise LiteLLM",
  baseUrl: "http://127.0.0.1:4000/v1",
  apiKey: "$LITELLM_API_KEY",
  api: "openai-completions",
  models: [
    {
      id: "enterprise-default",
      name: "Enterprise Default",
      reasoning: true,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128000,
      maxTokens: 16384,
    },
  ],
});
```

Supported authentication is API-key based. `apiKey` may be a literal, `$ENV_VAR`, `${ENV_VAR}`, or a leading `!command`. The only supported API value is `openai-completions`.

## State

Persist branch-aware extension state in tool-result `details` or custom session entries. Rebuild in-memory state from the active session branch during `session_start`. Use extension package storage only for data that is intentionally shared across sessions.

## Packaging

An extension package may include npm dependencies and other resources. Install dependencies with lifecycle scripts disabled and review package contents before trusting it. See [Packages](packages.md).

The complete TypeScript contract is exported from `@enterprise-agent/coding-agent` as `ExtensionAPI`, `ExtensionContext`, `ExtensionCommandContext`, `ToolDefinition`, and the event/result interfaces.
