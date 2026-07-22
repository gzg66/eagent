# Enterprise Agent

Enterprise Agent is an internally maintained coding-agent platform. It provides a terminal application, a reusable agent runtime, a LiteLLM model gateway adapter, a terminal UI toolkit, and a local process orchestrator.

## Packages

| Package | Purpose |
| --- | --- |
| `@enterprise-agent/coding-agent` | Interactive CLI (`eagent`) and SDK |
| `@enterprise-agent/agent-core` | Agent loop, tool execution, and state management |
| `@enterprise-agent/ai` | Model-provider adapters and streaming types |
| `@enterprise-agent/tui` | Terminal UI components and renderer |
| `@enterprise-agent/orchestrator` | Local multi-instance process supervisor |

## Local data and networking

User configuration is stored under `~/.eagent` by default. Enterprise Agent does not check for application updates, send install telemetry, or refresh remote model catalogs at startup. Network access occurs only when a user invokes a configured model provider or explicitly requests a network-backed operation.

The coding agent runs with the permissions of the launching process. Use an operating-system sandbox or container when stronger isolation is required.

## Development

```bash
npm install --ignore-scripts
npm run build
npm run check
./test.sh
./eagent-test.sh
```

Dependency changes are reviewed code. Direct dependencies are pinned, install lifecycle scripts are disabled during dependency hydration, and generated install locks are verified by `npm run check`.

See [AGENTS.md](AGENTS.md) for repository workflow and [packages/coding-agent/docs](packages/coding-agent/docs) for product documentation.

## Licensing

Enterprise Agent is distributed under the MIT license. Required attribution for incorporated third-party source is retained in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and the corresponding package notice files.
