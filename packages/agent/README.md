# Enterprise Agent Core

Stateful agent loop used by Enterprise Agent.

It coordinates messages, tool calls, streaming events, steering, follow-up input, and cancellation. Model traffic is supplied by the host through a stream function; the Enterprise Agent CLI binds that stream to its LiteLLM-only runtime.

```ts
import { Agent } from "@enterprise-agent/agent-core";

const agent = new Agent({
  initialState: {
    model,
    systemPrompt: "You are a coding assistant.",
    tools: [],
  },
  streamFn,
});
```

This package does not discover providers, check for updates, emit telemetry, or contact a network endpoint on import.

See [model integration](docs/models.md) and [observability](docs/observability.md).
