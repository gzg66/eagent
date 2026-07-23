阶段 2：建立统一策略与审批协议
定义 allow/block/rewrite/review 四类决策。
为工具声明风险等级和资源范围。
提供交互式批准与非交互默认策略。
对存储前内容和最终输出提供脱敏 hook。
所有决策写入 Trace。
先完成这一步，再开放 MCP、后台子 Agent和长期记忆。
阶段 3：稳定 orchestrator 和子任务模型
增加 durable task graph：父任务、子任务、状态、预算、依赖、结果。
支持 spawn、cancel、wait、retry、超时和并发上限。
主进程退出后由 daemon 继续运行。
重启后恢复任务，而不是仅把实例标记为 stopped。
补齐 orchestrator 单元测试和 RPC 集成测试。
阶段 4：开发官方子 Agent 扩展和运行面板
向主 Agent注册 spawn_agent、wait_agent、cancel_agent 等工具。
将子任务事件转换为对话内进度卡片。
建立结果摘要和原始产物引用。
增加可折叠 Trace/任务面板。
如果必须实现“右侧栏”，为 TUI 增加通用 panel 插槽，而不是硬编码子 Agent UI。
完成此阶段后，demo.md 的核心 Agent 体验才算基本成立。
阶段 5：开发用户级记忆
定义 MemoryStore、检索、写入、删除、可见范围和保留策略。
提供默认本地持久化实现。
在 context hook 中检索和注入，记录命中原因。
增加 /memory 查看、编辑、删除和单会话关闭。
主 Agent规则与用户偏好分开存储。
测试用户隔离、关闭记忆、删除后不可检索、敏感信息禁止入库。
多用户产品必须先引入可信 userId/tenantId，不能用 cwd 代替用户身份。
阶段 6：补齐 Skill 产品化
明确“一项独立发版 Skill 对应一个 package”；套件包通过依赖组合多个 Skill。
增加输入输出 schema、兼容版本、变更记录和来源信息。
在现有 package manager 上增加 catalog/search UI。
$skill 若必须兼容，优先用输入转换扩展实现，不改变现有 /skill:name 协议。
增加 Skill 修改快照、diff 和回滚。
阶段 7：开发官方 MCP 扩展
支持 stdio 和 HTTP transport。
连接配置、认证信息和工具名称空间分离。
MCP 工具调用复用阶段 2 的风险审批。
调用过程复用阶段 1 的 Trace。
明确连接失败、超时、schema 变化和重连行为。
不要直接把 MCP 合入 agent-core。
阶段 8：分析与闭环优化
建立 Trace 查询和聚合层。
按 Agent、Skill、工具、用户统计成功率、耗时、费用和异常。
先定义“成功”的可靠信号，不能简单把“无异常退出”视为成功。
基于失败模式生成 Skill/Prompt 修改建议。
以 diff 展示，人工批准后创建新版本。
保留版本快照并支持一键回滚。
四、建议的里程碑
M1：可信且可观测的单 Agent
修复基线、Trace、策略审批。

M2：可恢复的多 Agent 平台
durable orchestrator、子 Agent 扩展、任务与 Trace UI。

M3：个性化与生态能力
用户记忆、Skill catalog/版本、MCP 扩展。

M4：闭环优化平台
分析、异常识别、建议、审批和回滚。