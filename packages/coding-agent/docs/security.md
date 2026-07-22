# Security

Enterprise Agent runs with the permissions of the account that starts it. Built-in tools and extensions can read, write, and execute within that account's operating-system permissions.

## Project trust

Project trust controls loading of project `.eagent` settings, extensions, skills, prompts, themes, system-prompt files, and package resources. It is an input-loading guard, not a sandbox. Saved decisions are stored at `~/.eagent/trust.json`.

`AGENTS.md` context remains readable unless context loading is disabled. Non-interactive modes do not prompt; use `--approve` or `--no-approve` for an explicit one-run decision.

## Isolation

There is no built-in sandbox or micro-VM integration. For untrusted repositories or unattended work, run the entire process in an operating-system sandbox, container, VM, or isolated remote environment. Mount only required workspace paths, expose the minimum credentials, and restrict network access when it is unnecessary.

LiteLLM is the only LLM endpoint. Enterprise Agent does not contact a model catalog or update service at startup. Completion requests go only to the endpoint explicitly defined in `models.json`.

## Reporting

Follow the repository [Security Policy](../../../SECURITY.md) for security-sensitive reports.
