# Changelog

## Unreleased

- Added a durable parent/child task graph with dependencies, budgets, results, concurrency limits, retry, cancel, wait, timeout, daemon execution, and restart recovery.
- Restored live process instances on daemon restart instead of marking them stopped.
- Resolved the ESM RPC entrypoint with import conditions so child-agent processes start correctly.
- Shared the parent session Skill data directory with child agents while retaining independent child session and Trace files.
- Reported child Trace artifacts from the session workspace's fixed `trace.jsonl` path.

## 0.1.0 - 2026-07-22

- Established the local Enterprise Agent process orchestrator.
- Removed the upstream-specific remote presence and registration service.
