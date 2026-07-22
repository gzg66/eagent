# Observability

Agent events expose lifecycle, message, tool-call, and completion state to the host. Consumers can subscribe locally and write their own logs or traces.

```ts
const unsubscribe = agent.subscribe((event) => {
  auditLogger.write({ type: event.type, timestamp: Date.now() });
});
```

The package does not transmit telemetry. LiteLLM request monitoring, if required, must be configured explicitly at the internal gateway or by the host application.
