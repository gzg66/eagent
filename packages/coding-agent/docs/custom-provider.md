# Provider policy

Custom LLM providers are disabled. Extensions may customize the `litellm` registration, but registering any other provider ID fails.

Configure gateway deployments in [models.md](models.md). This keeps authentication, routing, auditing, and outbound network policy centralized at LiteLLM.
