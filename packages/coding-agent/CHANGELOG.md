# Changelog

## Unreleased

- Added configured OpenAI and Google model providers to the model runtime.
- Added unified policy approval, risk/resource declarations, redaction, and policy Trace events for tool execution.
- Enabled the Python and durable sub-agent tools in default SDK, RPC, TUI, and Web sessions.
- Stored each session in its own workspace with fixed `session.jsonl`, `trace.jsonl`, and `skills/` paths, including idempotent migration of the legacy flat layout.
- Added session-scoped Skill data placeholders and environment propagation for bash, Python scripts, and child agents while keeping executable Skill resources project-scoped.

## 0.1.0 - 2026-07-22

- Introduced the `eagent` CLI and `~/.eagent` configuration namespace.
- Removed self-update checks, startup network requests, install telemetry, upstream announcements, and legacy migration behavior.
- Renamed public packages, environment variables, protocol identifiers, and generated artifacts for Enterprise Agent.
- Restricted model configuration and extension registration to LiteLLM using the OpenAI-compatible chat-completions protocol.
- Removed remote sharing controls and automatic configured-package installation; package network operations now require an explicit command.
- Replaced managed search-tool downloads with local executable discovery and a native file-search fallback.
