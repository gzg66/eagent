# Project Progress

## Current State

- Active feature: `feat-005` — Persistent Web sessions and session-scoped Skill data.
- Status: completed.
- User-owned `reasonix.toml` changes are preserved and outside this feature.

## Delivered

- Session layout is now `.eagent/sessions/<encoded-cwd>/<timestamp>_<sessionId>/` with fixed `session.jsonl`, `trace.jsonl`, and `skills/`.
- Legacy flat session and `traces/<stem>.trace.jsonl` files migrate idempotently without overwriting targets.
- Core list/open/recent/fork/import/delete and TUI deletion use the new workspace layout.
- Skill input/output paths expand from `{{EAGENT_SKILL_DATA_DIR}}`; bash, `run_script`, and child agents receive the session data root.
- Child agents keep independent session/Trace files and share their parent session's Skill data root.
- Web restores only the session list at startup, lazily starts RPC runtimes, loads full history on selection, and preserves metadata when runtimes exit.
- Web History and SSE use cursors to prevent reconnect gaps and duplicate replay.
- Stop aborts the active turn while retaining the session; the UI exposes `Stop` and `Stopping...`.
- The right inspector is Trace-only and no longer polls `/api/tasks`; the backend Tasks API remains available.

## Verification Evidence

- Core targeted tests: 40 passed across session workspaces/migration, Skill expansion, and sub-agent propagation.
- Updated-layout regression tests: 31 passed.
- Orchestrator targeted tests: 5 passed.
- Web tests: 6 passed across restart persistence, exact deletion, default no-selection state, Stop/Stopping, and Trace-only UI.
- `npm run build --workspace=@enterprise-agent/coding-agent`: passed.
- `npm run build --workspace=@enterprise-agent/web`: passed; Vite emitted its existing bundle-size advisory.
- `npm run check`: passed with no errors, warnings, or informational findings.
- `./test.sh`: passed all workspaces; coding-agent reported 1257 passed and 52 skipped, Web reported 6 passed.
- Backend-driven Web E2E on isolated port 33117 passed immediate session persistence, fixed workspace layout, History response, SSE cursor replay/reconnect, persistent rename across service restart, idle abort response, and exact directory deletion.
- `./init.sh`: passed on 2026-07-23; full repository build, `npm run check`, and `./test.sh` all completed successfully.

## Blockers

- None.
- Active-turn abort could not use a real external model during isolated E2E because credentials were intentionally disabled; repository abort coverage and the abort API flow passed without external credentials.

## Recommended Next Step

1. Review the uncommitted `feat-005` diff.
2. Commit only if explicitly requested.
