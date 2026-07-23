# @enterprise-agent/orchestrator

Durable local task graph and process orchestrator for Enterprise Agent. Tasks persist independently of CLI clients and are recovered by the daemon after restart.

## CLI

```bash
orchestrator --help
orchestrator serve
orchestrator spawn-task --prompt "Implement and verify the requested change"
orchestrator tasks
orchestrator wait-task <task-id>
```
