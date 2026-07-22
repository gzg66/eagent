# Extension Examples

Load an extension explicitly:

```bash
eagent --extension examples/extensions/permission-gate.ts
```

Or copy reviewed code into `~/.eagent/extensions/`. Project extensions under `.eagent/extensions/` require project trust.

The directory contains examples for lifecycle hooks, tool registration, custom commands and UI, session metadata, git integration, prompt customization, compaction, event buses, dynamic resources, and extensions with npm dependencies.

Provider-registration examples target only `litellm` with the `openai-completions` API. Other provider IDs are rejected by the runtime.

See [Extension documentation](../../docs/extensions.md) for the supported interface.
