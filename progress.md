# Project Progress

## LLM Runtime Repair (2026-07-23)

- Restored `LITELLM_API_KEY` discovery and added repeatable Support API credential loading.
- Enabled `NODE_USE_ENV_PROXY=1` for VPN proxy port `7892`.
- Routed DeepSeek to the Support API endpoint and configured all 9 approved aliases.
- Fixed GPT-5.6 function tools with explicit `reasoning_effort: "none"`.
- Omitted unsupported `store` for Google's OpenAI-compatible endpoint.
- Live smoke passed: DeepSeek 2/2, OpenAI 4/4, Gemini 3/3.
- Targeted regression tests passed: 2 files, 4 tests.
- AI, coding-agent, and Web server builds passed.

## Current State

- Active feature: `feat-005` — Persistent Web sessions and session-scoped Skill data.
- Status: completed.
- **New work 1**: `fix-subagent-policy-approval` — 修复 Web 端创建子代理时的终端弹框和策略审批弹窗问题。
- Status: **in progress** — 后端修改完成，前端 ApprovalCard 增强完成，验证通过。
- **New work 2**: `add-llm-models-gpt55-gpt56-gemini35-gemini36` — 添加 GPT-5.5/5.6、Gemini 3.5/3.6 模型配置，前端 LLM 切换按钮。
- Status: **completed** — 模型配置和前端组件完成，`npm run check` 通过。

## Changes in this session (LLM Models v2 — per museframe-llm-migrate)

### 1. 新增 `packages/ai/src/providers/openai.ts` — OpenAI 直连 provider
- 使用 `OPENAI_API_KEY` 环境变量认证
- 通过 `openai-completions` API 直连 `https://api.openai.com/v1`
- GPT-5.5/5.6 系列模型通过此 provider 访问（不走 LiteLLM 网关）

### 2. 新增 `packages/ai/src/providers/google.ts` — Google Gemini provider
- 使用 `GOOGLE_API_KEY` / `GEMINI_API_KEY` 环境变量认证
- 通过 OpenAI 兼容端点 `https://generativelanguage.googleapis.com/v1beta/openai`
- Gemini 3.5/3.6 系列模型通过此 provider 访问

### 3. 更新 provider 注册体系
- `providers/all.ts`: BuiltinProvider 扩展为 `"litellm" | "openai" | "google"`
- `types.ts`: KnownProvider 从 `"litellm"` 扩展
- `index.ts`: 导出 openai/google provider
- `env-api-keys.ts`: 添加 OPENAI_API_KEY / GOOGLE_API_KEY / GEMINI_API_KEY 映射
- `model-config.ts`: 允许 openai/google provider 在 models.json 中配置
- `model-runtime.ts`: 注册/注销 provider 支持 openai/google
- `model-resolver.ts`: defaultModelPerProvider 添加 openai/google 默认模型
- `extensions/loader.ts`: 添加 openai/google provider 的 bundled module

### 4. 更新 `.eagent/models.json` — 三 provider 架构
- **litellm** (2 models): deepseek-v4-pro, deepseek-v4-flash — 通过 LiteLLM 网关
- **openai** (5 models): gpt-5.5, gpt-5.5-pro, gpt-5.6-luna, gpt-5.6-sol, gpt-5.6-terra — 直连 OpenAI API
- **google** (3 models): gemini-3.5-flash, gemini-3.5-flash-lite, gemini-3.6-flash — 通过 Google OpenAI 兼容端点

### 5. Web Server + 前端（同 v1）
- `GET /api/models/:sessionId` + `POST /api/model/:sessionId`
- ModelSelector 组件在 ChatInput 上方，按 provider 分组

## Verification Evidence

- `npm run check`: passed — 全部子任务 exit 0，无 error/warning/info
- `npm run build --workspace=@enterprise-agent/web`: passed
- Web tests: 3/3 passed

## Blockers

- None.

## Fix — GPT-5.6 / Gemini 模型 400 错误 (reasoning_effort + function tools 不兼容)

### 问题

GPT-5.6 模型在 `/v1/chat/completions` 端点使用 function tools 时，不支持 `reasoning_effort` 参数。
OpenAI API 返回：
> Function tools with reasoning_effort are not supported for gpt-5.6-terra in /v1/chat/completions.
> To use function tools, use /v1/responses or set reasoning_effort to 'none'.

Gemini 3.5 Flash 同样返回 400（无 JSON body）。

### 根因

`.eagent/models.json` 中 openai/google provider 及模型的 `compat.supportsReasoningEffort` 设为 `true`，
导致 `openai-completions.ts` 的 `buildParams` 在第 694/697 行向请求注入了 `reasoning_effort` 参数。
由于 eagent 总是使用 function tools，GPT-5.6 的 `/v1/chat/completions` 端点拒绝该组合。

### 修复

`.eagent/models.json` 中将以下 5 处 `supportsReasoningEffort` 从 `true` 改为 `false`：
- openai provider compat（第 49 行）
- gpt-5.6-terra model compat（第 81 行）
- gpt-5.6-luna model compat（第 118 行）
- google provider compat（第 135 行）
- gemini-3.5-flash model compat（第 157 行）

同时给 google provider 添加 `supportsDeveloperRole: false`，因为 Google OpenAI 兼容端点不支持 developer role。

### 验证

- `npm run check`: passed — 591 files, no fixes applied, all sub-tasks exit 0
