# Changelog

## 0.1.0 - 2026-07-22

- Introduced the `eagent` CLI and `~/.eagent` configuration namespace.
- Removed self-update checks, startup network requests, install telemetry, upstream announcements, and legacy migration behavior.
- Renamed public packages, environment variables, protocol identifiers, and generated artifacts for Enterprise Agent.
- Restricted model configuration and extension registration to LiteLLM using the OpenAI-compatible chat-completions protocol.
- Removed remote sharing controls and automatic configured-package installation; package network operations now require an explicit command.
- Replaced managed search-tool downloads with local executable discovery and a native file-search fallback.
