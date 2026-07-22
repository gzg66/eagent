# Project Progress

## Current State

- Active feature: `feat-003` — Web Chat Frontend.
- Status: in progress (integration testing complete, 3 bugs fixed).
- Product identity: `Enterprise Agent`.
- npm scope: `@enterprise-agent/*`.
- CLI: `eagent`.
- User configuration: `.eagent` (project-local, was previously `~/.eagent`).
- Environment prefix: `EAGENT_`.

## feat-003: Web Chat Frontend — Delivered Scope

- `@enterprise-agent/web` package under `packages/web/`.
- **Server**: Express + SSE server (`server/src/index.ts`) that spawns coding-agent RPC child processes via `AgentProcess` (inspired by orchestrator's `RpcProcessInstance`).
- **SessionManager**: Multi-session support with idle timeout (30 min), max concurrent limit (10), auto-reaper.
- **SSE Handler**: Per-session SSE connections, event type-based dispatching.
- **React frontend**: Vite + React 19 + TypeScript.
- **Message display** (matching TUI fidelity):
  - `UserMessage` — background-colored container with Markdown.
  - `AssistantMessage` — text Markdown + collapsible thinking block + stopReason display.
  - `ToolExecution` — color-coded cards (pending/success/error), expandable with args/result JSON.
  - `MarkdownRenderer` — marked + highlight.js with theme matching TUI syntax colors.
- **Session UI**: Sidebar with create/select/delete session operations.
- **SSE integration**: Native `EventSource` with auto-reconnect, typed event routing.
- **Theme**: CSS variables mapped 1:1 from TUI `dark.json` color scheme.

## Bugs Found and Fixed (2026-07-22 integration test)

### Bug 1: `AssistantMessage.tsx` — `content` used before declaration (CRITICAL)
- **Symptom**: Component would throw `ReferenceError: Cannot access 'content' before initialization` at runtime.
- **Root cause**: Line 12 used `content.some(...)` but `content` was declared on line 15.
- **Fix**: Moved `const content = ...` before `const hasText = ...` (`packages/web/client/src/components/AssistantMessage.tsx`).

### Bug 2: `types.ts` — `AssistantMessage.usage` field mismatch
- **Symptom**: Token counts always displayed 0 because actual SSE data uses `input`/`output` fields while the type expected `inputTokens`/`outputTokens`.
- **Fix**: Updated `AssistantMessage.usage` to accept both `input`/`output` (from API) and `inputTokens`/`outputTokens` (legacy), plus `cacheRead`, `cacheWrite`, `reasoning`, `totalTokens`. Also added `api`, `provider`, `model`, `responseId` fields to the type (`packages/web/client/src/types.ts`).
- **Related fix**: Updated `AssistantMessage.tsx` token display to use `message.usage.input ?? message.usage.inputTokens ?? 0`.

### Bug 3: `useChat.ts` — Duplicate user messages
- **Symptom**: User messages appeared twice in the chat — once from optimistic local add and once from SSE echo.
- **Root cause**: `sendMessage()` optimistically added a `message_start` event, but the server also emits `message_start` for user messages via SSE.
- **Fix**: Removed the optimistic user message add. User messages now only appear via SSE (`packages/web/client/src/hooks/useChat.ts`). Also removed unused `UserMessage` import.

### Bug 4: `auth.json` was empty (environment issue)
- **Symptom**: Agent turn failed immediately (9ms, status: error) with `provider: "unknown"`, `model: "unknown"`.
- **Root cause**: `.eagent/auth.json` was `{}` — all API keys were in `.eagent/auth.json.bak`.
- **Fix**: Restored `auth.json` from backup. This is not a code bug but worth documenting.

## Integration Test Results (2026-07-22)

Tested via `curl` against `http://localhost:3001`:

| Test Case | Result |
|---|---|
| `GET /api/health` | OK — returns `{status:"ok", sessions:N}` |
| `POST /api/sessions` | OK — creates session, returns session info |
| `GET /api/sessions` | OK — lists all sessions |
| `PATCH /api/sessions/:id` | OK — renames session label |
| `DELETE /api/sessions/:id` | OK — deletes session, cleans up agent process |
| `POST /api/chat` (with sessionId) | OK — sends prompt, agent responds via SSE |
| `POST /api/chat` (without sessionId) | OK — auto-creates session |
| `POST /api/chat/:id/abort` | OK — aborts running agent turn |
| `GET /api/stream?sessionId=` | OK — SSE stream with correct event types |
| `GET /api/state/:id` | OK — returns session state |
| `GET /api/messages/:id` | OK — returns message history |
| SPA fallback (`GET /chat/...`) | OK — serves `index.html` |
| Static files (JS/CSS) | OK — 200 with correct Content-Type |

SSE event flow verified:
- `agent_start` → `turn_start` → `message_start`(user) → `message_end`(user) → `message_start`(assistant) → `message_update`(streaming) → `tool_execution_start/update/end` → `message_end`(assistant) → `turn_end` → `agent_end` → `agent_settled`
- Thinking blocks streamed via `thinking_start` → `thinking_delta`(×N) → `thinking_end`
- Text blocks streamed via `text_start` → `text_delta` → `text_end`
- Tool results tracked via `tool_execution_*` events attached to assistant messages

Session trace files verified in `.eagent/sessions/`:
- JSONL session files with correct `session`, `model_change`, `thinking_level_change`, `message` entries
- Trace JSONL files in `traces/` subdirectory

## Verification Evidence

- `npm run check`: passed; 578 files checked with no diagnostics.
- `npm run build` (all packages): passed.
- `./test.sh`: passed (agent-core: 16 files/180 tests, ai: 10 files/66 tests, coding-agent: all passing).
- `./init.sh`: passed (build + check + test).
- Server `tsgo --noEmit`: passed.
- Client `vite build`: passed (233 modules, 1.14 MB JS + 9.6 KB CSS).
- `check:pinned-deps`: passed.
- `check:ts-imports`: passed.
- `check:shrinkwrap`: passed.
- `check:install-lock:coding-agent`: passed.
- `check:browser-smoke`: passed.

## Blockers

- None.

## Recommended Next Step

1. Verify fixes in a real browser by opening `http://localhost:3001`.
2. Consider adding E2E tests (Playwright) for critical paths: session CRUD, message send/receive, tool execution display, abort.
3. Optimize JS bundle (1.14 MB) with dynamic imports for marked/highlight.js.
4. Consider adding auth.json validation on server startup to fail fast with a clear error message.

## Repository State

- Uncommitted changes: `AssistantMessage.tsx`, `types.ts`, `useChat.ts` (3 bug fixes).
- No commit was created because the user did not request one.
