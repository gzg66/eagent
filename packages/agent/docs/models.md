# Model integration

`@enterprise-agent/agent-core` is transport-neutral. The host supplies a `Model` and a `streamFn`.

Enterprise Agent's supported production binding is LiteLLM over the OpenAI-compatible chat-completions API. Provider selection, credentials, and the LiteLLM endpoint are owned by the coding-agent runtime, not by this package.

```ts
const agent = new Agent({
  initialState: { model, systemPrompt, tools },
  streamFn: (requestModel, context, options) =>
    modelRuntime.streamSimple(requestModel, context, options),
});
```

Tests should use the Faux provider and must not call a live model endpoint.
