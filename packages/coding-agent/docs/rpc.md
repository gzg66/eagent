# RPC Mode

Run Enterprise Agent as a JSONL subprocess:

```bash
eagent --mode rpc --no-session
```

Configure LiteLLM in `models.json` before starting the process. Optional startup flags include `--provider litellm`, `--model <id>`, `--api-key <key>`, `--thinking <level>`, and tool/resource controls.

Each request and response is one JSON object per line. Requests carry a caller-generated `id`; responses echo that ID. Unsolicited lifecycle events have `type: "event"`.

## Core requests

```json
{"id":"1","type":"get_state"}
{"id":"2","type":"prompt","message":"Review this repository"}
{"id":"3","type":"set_model","provider":"litellm","modelId":"deepseek-v4-pro"}
{"id":"4","type":"set_thinking_level","level":"high"}
{"id":"5","type":"abort"}
{"id":"6","type":"new_session"}
{"id":"7","type":"get_messages"}
```

Prompt requests may include structured text/image content and a streaming behavior. Session requests support resume, fork, clone, compaction, tree navigation, export, and import. UI-capable extension requests are emitted as events and completed by a matching response ID.

## State

State responses include the active LiteLLM model, thinking level, streaming state, message count, session identity, and available models.

```json
{
  "id": "1",
  "type": "response",
  "success": true,
  "data": {
    "model": {"provider":"litellm","id":"deepseek-v4-pro"},
    "thinkingLevel": "medium",
    "isStreaming": false,
    "messageCount": 0
  }
}
```

## Events

Events report agent, turn, message, tool, compaction, retry, and session lifecycle changes. Consumers should process events continuously while waiting for a response and must not assume that every event has a request ID.

The TypeScript request, response, and event unions are exported by `@enterprise-agent/coding-agent`. For same-process integrations, prefer the [SDK](sdk.md).
