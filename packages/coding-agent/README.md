# Enterprise Agent CLI

`@enterprise-agent/coding-agent` provides the `eagent` terminal application and its embeddable SDK.

## Install

Install from the approved internal npm registry:

```bash
npm install --global @enterprise-agent/coding-agent --ignore-scripts
eagent
```

Run from this repository:

```bash
./eagent-test.sh
```

## Configuration

Global state is stored under `~/.eagent`. Project-local settings and resources use `.eagent` in the project directory.

The application does not perform update checks, telemetry submissions, provider attribution, or remote model-catalog refreshes at startup. Model-provider requests occur only after the user configures and invokes a provider. Package and catalog operations are explicit CLI actions.

## Documentation

- [Quick start](docs/quickstart.md)
- [Usage and CLI flags](docs/usage.md)
- [Providers and authentication](docs/providers.md)
- [Settings](docs/settings.md)
- [Extensions](docs/extensions.md)
- [SDK](docs/sdk.md)
- [Security](docs/security.md)

## Security

The CLI runs with the permissions of its launching process and is not a sandbox. Use a container, virtual machine, or operating-system sandbox for untrusted workspaces.

## Licensing

MIT. Required third-party attribution is retained in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
