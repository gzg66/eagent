# Using Enterprise Agent

## Interactive mode

Run `eagent` in the directory the agent may inspect and modify. The interface shows messages, tool activity, an editor, and a footer with the active LiteLLM model and context usage.

Common editor actions:

| Action | Input |
|---|---|
| Reference a file | Type `@` |
| Run a shell command | `!command` |
| Run without adding output to context | `!!command` |
| Open the external editor | Ctrl+G |
| Copy the latest response | Ctrl+X |

## Commands

| Command | Purpose |
|---|---|
| `/login`, `/logout` | Store or remove the LiteLLM API key |
| `/model` | Select a configured LiteLLM model |
| `/settings` | Change local application settings |
| `/resume`, `/new`, `/tree`, `/fork`, `/clone` | Manage sessions |
| `/compact [prompt]` | Compact the current context |
| `/export [file]` | Export a session locally |
| `/reload` | Reload settings and local resources |
| `/quit` | Exit |

## Sessions

Sessions are stored under `~/.eagent/sessions/` unless disabled:

```bash
eagent -c
eagent -r
eagent --session <path-or-id>
eagent --fork <path-or-id>
eagent --no-session
```

## Context files

Enterprise Agent reads only `AGENTS.md`: the global file at `~/.eagent/AGENTS.md`, then project files found while walking from parent directories to the current directory. Disable this with `--no-context-files`.

Project-local settings and executable resources require project trust. Use `--approve` or `--no-approve` for a one-run decision.

## CLI reference

```text
eagent [options] [@files...] [messages...]
```

Important options:

| Option | Purpose |
|---|---|
| `-p`, `--print` | Print one response and exit |
| `--mode json` | Emit JSONL events |
| `--mode rpc` | Use the stdin/stdout RPC protocol |
| `--provider litellm` | Select the only supported provider |
| `--model <id>` | Select a model defined in `models.json` |
| `--api-key <key>` | Override `LITELLM_API_KEY` for this run |
| `--thinking <level>` | Set the thinking level |
| `--tools <list>` | Allowlist tools |
| `--exclude-tools <list>` | Disable selected tools |
| `--no-session` | Do not persist the session |
| `--no-context-files` | Disable `AGENTS.md` loading |
| `-a`, `--approve` | Trust project-local resources for this run |
| `-na`, `--no-approve` | Ignore project-local resources for this run |

Package commands manage extension packages only:

```bash
eagent install <source>
eagent remove <source>
eagent update <source>
eagent list
eagent config
```

No command checks for or installs Enterprise Agent updates.

## Environment

| Variable | Purpose |
|---|---|
| `LITELLM_API_KEY` | Optional LiteLLM gateway key |
| `EAGENT_HOME` | Override the configuration directory |
| `EAGENT_SESSION_DIR` | Override session storage |
| `EAGENT_PACKAGE_DIR` | Override extension package storage |
| `EAGENT_OFFLINE` | Disable optional package-network operations |
| `VISUAL`, `EDITOR` | External editor fallback |
