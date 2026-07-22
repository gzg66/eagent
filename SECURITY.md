# Security Policy

Enterprise Agent is a local coding agent that runs inside the security boundary of the account and process that launch it. It can read files, start processes, access configured credentials, and connect to model providers selected by the user. It is not a sandbox.

Use a container, virtual machine, or operating-system sandbox when the workspace or model output is not trusted. Treat workspace instructions, extensions, skills, shell configuration, environment variables, and files under `~/.eagent` as trusted executable configuration.

## Reporting

Report suspected vulnerabilities through the private security-reporting channel configured for the internal repository. Include the affected version or commit, impact, reproduction steps, logs, and known mitigations. Do not publish sensitive reports in a public issue tracker.

## In scope

- Privilege-boundary violations caused by Enterprise Agent.
- Credential disclosure that occurs without a user-authorized provider or endpoint.
- Vulnerabilities reachable through the distributed packages, CLI, SDK, or local orchestrator.
- Supply-chain issues that are reachable through shipped runtime dependencies.

## Out of scope

- Expected command execution performed with the launching user's permissions.
- Prompt injection or malicious model output by itself.
- Behavior introduced by untrusted repositories, extensions, skills, packages, proxies, or user configuration.
- Exposure caused by deliberately publishing the local service or weakening its configuration.
- Reports that require prior write access to the user's workspace, home directory, shell startup files, environment, or `~/.eagent`, unless they demonstrate how Enterprise Agent first obtained that access.
