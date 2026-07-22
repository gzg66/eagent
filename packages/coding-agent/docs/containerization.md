# Containerization

Pass only the LiteLLM endpoint configuration and gateway key into the container. Mount the Enterprise Agent config directory read-only when configuration must be immutable.

```bash
docker run --rm -it \
  -e LITELLM_API_KEY \
  -v "$HOME/.eagent:/home/agent/.eagent:ro" \
  enterprise-agent:latest
```

No provider catalog, update check, or telemetry endpoint is contacted at startup.
