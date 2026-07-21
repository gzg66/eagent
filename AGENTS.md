# 开发规则

## 启动流程 (Startup Workflow)

每次会话启动时：

1. 读取 `feature_list.json` 确认当前活跃特性。
2. 读取 `progress.md` 了解上次进度和下一步。
3. **One feature at a time** — 所有工作都在当前活跃特性范围内；不活跃特性不触碰。Stay in scope。
4. 工作完成后更新 `progress.md`。

## 完成定义 (Definition of Done)

一个特性"完成"需要满足：

- [ ] `npm run check` 通过（无 error/warning/info）
- [ ] `./test.sh` 通过（非 e2e 测试）
- [ ] 相关 CHANGELOG 已更新
- [ ] `progress.md` 已更新，标注完成证据和 Verification Evidence（运行的命令及输出摘要）
- [ ] 未提交的变更按 Git 规则暂存并提交

始终运行 `./init.sh` 作为最终验证；通过后再声称完成。

## 对话风格

- 回答保持简短精炼
- 在 commit、issue、PR 评论或代码中不使用 emoji
- 不使用空洞或过度热情的填充语（例如，用 "Thanks @user" 而非 "Thanks so much @user!"）
- 仅限技术性叙述，直截了当
- 当用户提问时，先回答问题，再进行编辑或执行实现命令。
- 在回应用户反馈或分析时，先明确表示同意或不同意，再说明你做了哪些修改。

## 代码质量

- 在进行大范围修改之前、在编辑尚未完整检查过的文件之前，以及在需要调查或审计时，完整读取文件。不要依赖搜索片段来做大范围修改。
- 除非绝对必要，否则不使用 `any`。
- 对于只有一处调用点的单行辅助函数，内联处理。
- 检查 node_modules 中的外部 API 类型，不要猜测。
- **禁止内联导入**（`await import()`、`import("pkg").Type`、动态类型导入）。仅使用顶层导入。
- 绝不要通过删除或降级代码来修复过时依赖导致的类型错误；应升级依赖。
- 在由根配置检查的代码中（`packages/*/src`、`packages/*/test`、`packages/coding-agent/examples`），仅使用可擦除的 TypeScript 语法（Node strip-only 模式）：不使用参数属性、`enum`、`namespace`/`module`、`import =`、`export =` 或其他需要 JS 输出的结构。使用显式字段加构造函数赋值。
- 在移除看似有意的功能或代码之前，始终先询问。
- 不要保持向后兼容，除非用户要求。
- 绝不硬编码按键检查（如 `matchesKey(keyData, "ctrl+x")`）。将默认值添加到 `DEFAULT_EDITOR_KEYBINDINGS` 或 `DEFAULT_APP_KEYBINDINGS`，以确保其保持可配置。
- 绝不直接修改 `packages/ai/src/models.generated.ts`；应更新 `packages/ai/scripts/generate-models.ts`，然后重新生成。包含生成的 `models.generated.ts` diff 总是可以的，即使重新生成包含了不相关的上游模型元数据变更。

## 命令

- 代码修改后（非文档）：`npm run check`（完整输出，不截尾）。在提交前修复所有 error、warning 和 info。此命令不运行测试。
- 绝不直接运行完整的 vitest 套件：它包含 e2e 测试，当 endpoint/auth 环境变量存在时会激活。对于所有非 e2e 测试，从仓库根目录运行 `./test.sh`。否则从包根目录运行特定测试：`node ../../node_modules/vitest/dist/cli.js --run test/specific.test.ts`。
- 如果你创建或修改了测试文件，运行它并在测试或实现上迭代直到通过。
- 对于 `packages/coding-agent/test/suite/`，使用 `test/suite/harness.ts` + faux provider。不要使用真实 provider API、密钥或付费 token。
- 将 issue 相关的回归测试放在 `packages/coding-agent/test/suite/regressions/` 下，命名为 `<issue号>-<简短描述>.test.ts`。
- 对于临时脚本，将其写入临时文件（如 `/tmp`），运行，必要时编辑，完成后删除。不要将多行脚本嵌入 `bash` 命令中。
- 除非用户要求，否则绝不提交。

## 依赖与安装安全

- 将 npm 依赖和 lockfile 变更视为需要审查的代码。直接外部依赖保持精确版本锁定。
- 使用 `npm install --ignore-scripts` 进行本地更新/水合；使用 `npm ci --ignore-scripts` 进行干净/CI 风格安装。除非用户要求，否则不运行生命周期脚本。
- 如果依赖元数据发生变化，使用 `npm install --package-lock-only --ignore-scripts` 刷新 `package-lock.json`。
- 如果 `packages/coding-agent/npm-shrinkwrap.json` 需要重新生成，运行 `node scripts/generate-coding-agent-shrinkwrap.mjs`（使用 `--check` 或 `npm run check` 验证）。带生命周期脚本的新依赖需要审查，并在该脚本中添加显式 allowlist 条目；绝不要悄悄添加。
- pre-commit 会阻止 lockfile 提交，除非设置了 `PI_ALLOW_LOCKFILE_CHANGE=1`。除非用户希望提交 lockfile 变更，否则不要绕过此限制。

## 用户覆盖

如果用户的指令与本文档中的任何规则冲突，在覆盖之前先请求明确确认。仅在确认后才执行其指令。
