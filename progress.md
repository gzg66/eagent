# 会话进度日志

## 当前状态 (Current State，Last Updated: 2026-07-21)

**最近完成特性：** feat-001 — 阶段0-1：可信验证基线与统一 Trace 主干
**状态：** 已完成

### 已完成事项

- 修复 `init.sh` 的 CRLF 假通过问题，使其严格执行 build、check 和完整非 e2e 测试。
- 修复 Windows 下环境路径、Skill/Prompt 路径、find glob、footer、配置覆盖路径、符号链接和批处理测试夹具等基线问题。
- 新增统一 Trace：每个执行轮次以 session 为根，记录 agent、turn、显式 skill 和 tool span。
- Trace 通过 SDK/RPC 的 `trace_event` 暴露，并在会话目录的 `traces/*.trace.jsonl` 中追加持久化。
- Trace 只记录安全元数据，不记录提示词、Skill 正文、工具参数/结果、Shell 输出或文件内容。
- 修复 `pi-test.sh` 在 Windows/WSL 非登录 shell 中找不到 Node，以及 Windows `node_modules` 与 WSL esbuild 平台不匹配的问题。
- 更新 Trace 文档、文档导航和 CHANGELOG。

### Verification Evidence

- `npm run build`：通过；tui、ai、agent、coding-agent、orchestrator 全部构建成功。
- `npm run check`：通过；Biome 800 files、依赖锁定、TS import、shrinkwrap、install-lock、TypeScript 和 browser smoke 全部通过。
- `bash ./test.sh`：通过；agent 177 passed/3 skipped，ai 555 passed/737 skipped，coding-agent 1559 passed/53 skipped，tui 全部通过。
- `bash ./init.sh`：通过，输出 `=== verification passed ===`。
- Harness 校验：100/100，instructions、state、verification、scope、lifecycle 全部 5/5。
- Trace 专项测试：`agent-session-trace.test.ts` 覆盖持久化因果树、Skill span、订阅隔离、重试恢复状态和敏感内容排除。
- 真实会话：通过 `bash ./pi-test.sh --mode rpc` 启动真实 litellm/deepseek-v4-pro 会话，消息被接受，实际执行 bash `pwd`，Agent 正常 settled。
- 真实 Trace：12 条事件，`session → agent → turn → bash tool` 父子关系、schema v1、sessionId、start/end 配对、ok 状态、耗时均通过；提示词和工具参数未落盘。
- 真实 Trace 文件：`C:\Users\pg\AppData\Local\Temp\pi-trace-e2e-ff1b7848f6484b18bfd35bcdf4a51f57\traces\2026-07-21T13-44-18-445Z_019f84eb-910d-79d8-a166-3eeb5bb55f84.trace.jsonl`。

### 阻碍 (Blockers)

- 无。

### 交付说明

- 按项目规则，用户未明确要求提交，因此改动尚未创建 Git commit。
- `.gitignore` 与 `.codegraph/` 是会话开始前已有的用户变更，未纳入本特性实现。
- 验证流程格式化了图像模型目录，并按项目脚本重新生成了 OpenRouter 模型价格元数据。

### 建议下一步 (Recommended Next Step)

1. 进入阶段 2：Guard 门控与主 Agent/子 Agent 统一 span 接入。
2. 基于 Trace JSONL 增加树状查询、聚合指标和异常分析接口。
3. 如需发布，再由用户明确授权后创建 commit/PR。
