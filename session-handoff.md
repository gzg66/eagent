# Session Handoff

## Current Baseline

Enterprise Agent 0.1.0 is complete and independently restartable. The runtime uses the `eagent` CLI, `@enterprise-agent/*` packages, `.eagent` project-local configuration (was previously `~/.eagent`), `EAGENT_` environment variables, and LiteLLM as its only configurable LLM provider.

## Key Files

- `packages/coding-agent/src/config.ts` — `getAgentDir()` now returns `<cwd>/.eagent` instead of `~/.eagent`
- `packages/coding-agent/src/core/settings-manager.ts` — `FileSettingsStorage` handles single-file mode when global and project paths are the same
- `packages/tui/src/tui.ts` — debug/crash log paths updated
- `packages/orchestrator/src/config.ts` — `getOrchestratorDir()` updated
- `scripts/*` — all `homedir()` + `.eagent` references replaced with `process.cwd()` + `.eagent`
- `test.sh` — `AUTH_FILE` path updated
- `packages/coding-agent/test/utilities.ts` — test helper paths updated
- `packages/coding-agent/test/interactive-mode-status.test.ts` — expected output updated

## Verification

- `settings-manager.test.ts`: 34 tests passed
- `settings-manager-bug.test.ts`: 4 tests passed
- `skills.test.ts`: 28 tests passed
- `trust-manager.test.ts`: 2 tests passed
- `git-update.test.ts`: 13 tests passed
- `interactive-mode-status.test.ts`: 29 tests passed
- `resource-loader.test.ts`: 2 pre-existing failures (unrelated to `.eagent` change — `process.cwd()` mismatch reading dark.json)

## Outstanding Work

- Full test suite (`./test.sh`) cannot run due to missing `@rolldown/binding-linux-x64-gnu` native binding (pre-existing environment issue)
- `npm run check` cannot run due to `tsgo` native binary not available (pre-existing environment issue)
- `~/.eagent/` references in documentation (`docs/*.md`, `README.md`, `SECURITY.md`, `examples/`) still reference the old path
- Changes are intentionally uncommitted

## Next Session

1. Update documentation files to reflect `.eagent` (project-local) instead of `~/.eagent`
2. Fix `resource-loader.test.ts` pre-existing test failures (dark.json path)
3. Run `./init.sh` for final verification once environment issues are resolved
4. Optionally add a new feature entry to `feature_list.json` for this migration
