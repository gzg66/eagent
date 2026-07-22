# Execution traces

Pi records a structured causal trace for each executable session turn. Traces are available to SDK and RPC consumers while the turn runs and are persisted beside file-backed sessions.

## Causal tree

A normal tool-using turn has this shape:

```text
pi.session.turn
└── pi.agent.run
    ├── pi.agent.turn
    │   └── pi.agent.tool_call
    └── pi.agent.turn
```

An explicit `/skill:<name>` expansion is recorded as `pi.agent.skill`, parented to `pi.session.turn`. Direct user bash execution is represented as a tool span under its own session turn.

Every event has a `traceId`, `spanId`, optional `parentSpanId`, timestamp, sequence, span kind, phase, and attributes. End events also include `status` and `durationMs`. The schema version is currently `1`.

## Persistence

For a session file such as:

```text
<session-dir>/2026-07-21T13-00-00-000Z_<session-id>.jsonl
```

the trace is appended to:

```text
<session-dir>/traces/2026-07-21T13-00-00-000Z_<session-id>.trace.jsonl
```

Each line is one complete `TraceEvent`. Trace write failures are isolated from agent execution and exposed through `AgentSession.traceWriteError`.

## SDK and RPC

`AgentSession.subscribe()` emits trace records as:

```ts
{
  type: "trace_event",
  event: {
    type: "trace",
    schemaVersion: 1,
    traceId: "...",
    spanId: "...",
    name: "pi.agent.tool_call",
    kind: "tool",
    phase: "end",
    status: "ok",
    durationMs: 42,
    attributes: { toolName: "read", toolCallId: "..." }
  }
}
```

RPC mode forwards the same `trace_event` objects. SDK callers can also inspect `AgentSession.traceEvents` and `AgentSession.traceFile`. `SessionTrace`, `TraceEvent`, related types, and `getTraceFilePath()` are exported for integrations.

Trace subscribers are passive: an exception from one subscriber cannot interrupt the agent or prevent other trace subscribers from receiving the event.

## Data safety

The built-in trace records operational metadata only:

- session, agent, turn, skill, and tool identities
- provider, model, and thinking level
- status, duration, stop reason, token counts, and cost
- tool name and tool-call ID

It does not record prompts, completions, skill bodies, tool arguments, tool results, shell output, file contents, API keys, or request headers.
