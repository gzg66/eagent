# Project Progress

## Current State

- Active feature: `feat-004` — Trusted durable multi-agent platform.
- Status: completed.
- Scope: `demo1.md` phases 2, 3, and 4.
- Product identity: `Enterprise Agent`; CLI: `eagent`.
- Current maintenance change: Web-only read-result suppression; TUI behavior is unchanged.

## Delivered

### Phase 2 — Policy and approval

- Added unified allow/block/rewrite/review policy decisions with risk levels and resource scopes.
- Added interactive approval handling, non-interactive deny behavior, secret redaction, and policy trace events.
- Propagated policy metadata through built-in tools and extension tool definitions.

### Phase 3 — Durable orchestrator

- Added persistent task graphs with parent/child relations, dependencies, budgets, attempts, results, and artifacts.
- Added atomic JSON storage, JSONL events, retry/timeout/cancel/wait behavior, restart recovery, and concurrent scheduling.
- Added IPC and CLI operations for spawning, listing, inspecting, cancelling, retrying, and waiting for tasks.

### Phase 4 — Sub-agent tools and UI

- Added `spawn_agent`, `wait_agent`, `cancel_agent`, `retry_agent`, and `list_agents` tools.
- Added local orchestrator daemon discovery/startup and durable result/artifact reporting.
- Added TUI task result rendering and Web approval cards plus a collapsible task/trace panel.
- Added Web task and approval APIs and SSE approval events.
- Enabled Python and all five sub-agent tools in the default SDK/RPC tool set.
- Switched child RPC entrypoint resolution to ESM import conditions so spawned agents start from the workspace package.

## Verification Evidence

- `npm run check`: passed; Biome, dependency pins, TypeScript imports, shrinkwrap, install lock, `tsgo --noEmit`, and browser smoke all passed.
- `./test.sh`: passed; agent 181 tests, AI 66 tests, coding-agent 1252 tests, orchestrator 5 tests, and TUI tests passed; no failures.
- `npm run build`: passed for TUI, AI, agent, coding-agent, orchestrator, and Web server.
- `npm run build --workspace=@enterprise-agent/web`: passed for Web server and Vite production client. Vite emitted only its existing bundle-size advisory.
- Windows ConPTY TUI startup: passed; interactive screen initialized and exited normally with code 0 in about 9.7 seconds.
- Web runtime E2E on port 3217: passed health, static page, session CRUD, state/messages, task list, SSE readiness, approval conflict, and error paths; Web and orchestrator stderr were empty.
- Live Web sub-agent run on port 3002: passed approval, durable spawn/wait, child RPC execution, result/artifact propagation, task panel status (`feature-status completed`), and trace rendering. Child result: `feat-004 completed`.
- Post-fix `npm run check`: passed; post-fix `./test.sh`: passed with no failures.
- Post-live-fix `./init.sh`: passed (exit 0); rebuilt all packages, reran `npm run check`, reran `./test.sh`, and ended with `=== verification passed ===`.
- Web read-result SSR check: passed; file content was absent, the path was present, and no expand button was rendered.
- Current `npm run build --workspace=@enterprise-agent/web`: passed, including server type-check and Vite production client build; only the existing bundle-size advisory was emitted.
- Current `npx tsgo --noEmit`: passed.
- Current `./test.sh`: blocked by missing package-local Vitest entrypoints under `packages/*/node_modules`.
- Current `./init.sh`: all package builds passed, then `npm run check` stopped on pre-existing unused code in `agent-session.ts` and `run_script.ts`.

## Blockers

- Repository-wide completion is blocked by unrelated existing check failures: unused `join` in `agent-session.ts`, unused `state`/`startedAt`/`endedAt` and `useConst` in `run_script.ts`.
- `./test.sh` cannot resolve package-local Vitest entrypoints for agent, AI, coding-agent, and orchestrator workspaces.

## Recommended Next Step

1. Resolve the existing check and test-harness blockers, then rerun `./init.sh`.
2. Commit only if explicitly requested by the user.
