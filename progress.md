# Project Progress

## Current State

- Active feature: `feat-002` — Enterprise Agent 0.1.0 baseline.
- Status: completed.
- Product identity: `Enterprise Agent`.
- npm scope: `@enterprise-agent/*`.
- CLI: `eagent`.
- User configuration: `~/.eagent`.
- Environment prefix: `EAGENT_`.
- Supported LLM provider: `litellm` only, using `openai-completions`.

## Delivered Scope

- Unified package, CLI, protocol, environment, documentation, and release metadata under the Enterprise Agent identity.
- Removed application self-update checks, startup telemetry, announcements, remote model catalogs, remote sharing controls, legacy data migration, and service-specific integrations.
- Startup does not install configured packages, download search binaries, or initiate model requests.
- Network-backed package installation and updates require an explicit CLI command.
- Model configuration rejects provider IDs other than `litellm` and API values other than `openai-completions`.
- Required third-party MIT attribution is isolated in `THIRD_PARTY_NOTICES.md` files.

## Verification Evidence

- `npm run check`: passed; 578 files checked with no diagnostics, dependency locks and TypeScript checks passed.
- `npm run build`: passed for tui, ai, agent-core, coding-agent, and orchestrator packages.
- `bash ./test.sh`: passed; agent 177 passed/3 skipped, ai 66 passed, coding-agent 1248 passed/52 skipped, and tui passed.
- `bash ./init.sh`: passed with `=== verification passed ===`.
- Identity audit: no disallowed product name, package scope, environment variable, repository URL, service name, or matching filename remained outside legally required notice files.
- Metadata audit: all packages report version `0.1.0`, Enterprise Engineering authorship, and no repository/homepage/bugs metadata.

## Blockers

- None.

## Recommended Next Step

Publish only from the clean `enterprise-agent` delivery repository after internal registry names and release authorization are confirmed.

## Repository State

- No commit was created because the user did not request one.
- Removed material is recoverable from the session quarantine directory until the user chooses to delete it.
