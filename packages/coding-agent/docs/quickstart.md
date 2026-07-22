# Quickstart

## Install

```bash
npm install -g --ignore-scripts @enterprise-agent/coding-agent
```

Run the CLI in a project directory:

```bash
cd /path/to/project
eagent
```

## Configure LiteLLM

Start a LiteLLM gateway and define at least one model in `~/.eagent/models.json`:

```json
{
  "providers": {
    "litellm": {
      "baseUrl": "http://127.0.0.1:4000/v1",
      "api": "openai-completions",
      "apiKey": "$LITELLM_API_KEY",
      "models": [
        {
          "id": "enterprise-default",
          "name": "Enterprise Default",
          "reasoning": true,
          "input": ["text"],
          "contextWindow": 128000,
          "maxTokens": 16384
        }
      ]
    }
  }
}
```

Set the gateway key only when the gateway requires one:

```bash
export LITELLM_API_KEY=your-gateway-key
```

You may also run `/login` to store that key locally. Enterprise Agent has no other LLM provider or account-login flow.

## First session

Type a request and press Enter:

```text
Summarize this repository and tell me how to run its checks.
```

The standard tools are `read`, `write`, `edit`, and `bash`; optional read-only tools include `grep`, `find`, and `ls`.

## Project instructions

Add `AGENTS.md` to the repository:

```markdown
# Project Instructions

- Run `npm run check` after code changes.
- Keep responses concise.
```

Enterprise Agent reads global instructions from `~/.eagent/AGENTS.md` and walks parent directories for project `AGENTS.md` files. Run `/reload` after changing resources.

## Useful commands

```bash
eagent -c
eagent -r
eagent --name "my task"
eagent -p "Summarize this codebase"
eagent @README.md "Review this file"
```

Inside the application, use `/model`, `/settings`, `/resume`, `/new`, `/tree`, `/fork`, `/compact`, `/reload`, and `/quit`.

See [Models](models.md), [Providers](providers.md), [Usage](usage.md), and [Settings](settings.md).
