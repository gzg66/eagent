import type { AgentTool, AgentToolResult } from "@enterprise-agent/agent-core";
import { Text } from "@enterprise-agent/tui";
import { type Static, type TSchema, Type } from "typebox";
import type { Theme } from "../../modes/interactive/theme/theme.ts";
import type { ToolDefinition, ToolRenderContext, ToolRenderResultOptions } from "../extensions/types.ts";
import { OrchestratorTaskClient, type SubagentTask } from "../orchestrator-client.ts";
import { wrapToolDefinition } from "./tool-definition-wrapper.ts";

const spawnSchema = Type.Object({
	task: Type.String({ description: "Concrete task for the child agent" }),
	label: Type.Optional(Type.String({ description: "Short task label" })),
	parentTaskId: Type.Optional(Type.String({ description: "Parent durable task id" })),
	dependencies: Type.Optional(Type.Array(Type.String(), { description: "Task ids that must complete first" })),
	timeoutMs: Type.Optional(Type.Number({ description: "Execution timeout in milliseconds" })),
	maxAttempts: Type.Optional(Type.Number({ description: "Maximum attempts including automatic retries" })),
});
const taskIdSchema = Type.Object({ taskId: Type.String({ description: "Durable task id" }) });
const waitSchema = Type.Object({
	taskId: Type.String({ description: "Durable task id" }),
	timeoutMs: Type.Optional(Type.Number({ description: "Maximum time to wait in milliseconds" })),
});
const listSchema = Type.Object({});

export interface SubagentToolDetails {
	task?: SubagentTask;
	tasks?: SubagentTask[];
}

export interface SubagentToolOptions {
	client?: Pick<OrchestratorTaskClient, "request">;
	skillDataDir?: string;
}

const terminalStatuses = new Set(["completed", "failed", "cancelled", "timed_out"]);

function requireTask(response: Awaited<ReturnType<OrchestratorTaskClient["request"]>>): SubagentTask {
	if (!response.ok) throw new Error(response.error);
	if (response.type !== "task_result") throw new Error(`Unexpected orchestrator response: ${response.type}`);
	return response.task;
}

function taskText(task: SubagentTask): string {
	const lines = [`Task ${task.id}: ${task.status}`, `Attempt ${task.attempt}/${task.maxAttempts}`];
	if (task.result?.summary) lines.push(`Summary: ${task.result.summary}`);
	if (task.result?.artifacts.length) {
		lines.push(
			"Artifacts:",
			...task.result.artifacts.map((artifact) => `- ${artifact.label ?? "artifact"}: ${artifact.path}`),
		);
	}
	if (task.error) lines.push(`Error: ${task.error}`);
	return lines.join("\n");
}

function renderTaskCall(name: string, args: Record<string, unknown>, theme: Theme): Text {
	const taskId = typeof args.taskId === "string" ? ` ${args.taskId}` : "";
	const label = typeof args.label === "string" ? ` ${args.label}` : "";
	return new Text(`${theme.fg("toolTitle", theme.bold(name))}${theme.fg("accent", taskId || label)}`, 0, 0);
}

function formatTaskResult(details: SubagentToolDetails | undefined, theme: Theme): string {
	const content = details?.task
		? taskText(details.task)
		: (details?.tasks ?? []).map((task) => taskText(task)).join("\n\n") || "No tasks";
	return `\n${theme.fg("toolOutput", content)}`;
}

function waitForDelay(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) return reject(new Error("Operation aborted"));
		const timer = setTimeout(resolve, ms);
		signal?.addEventListener(
			"abort",
			() => {
				clearTimeout(timer);
				reject(new Error("Operation aborted"));
			},
			{ once: true },
		);
	});
}

export function createSubagentToolDefinitions(
	cwd: string,
	options: SubagentToolOptions = {},
): Record<
	"spawn_agent" | "wait_agent" | "cancel_agent" | "retry_agent" | "list_agents",
	ToolDefinition<TSchema, SubagentToolDetails>
> {
	const client = options.client ?? new OrchestratorTaskClient(cwd);
	const renderers = (name: string) => ({
		renderCall(args: unknown, theme: Theme, context: ToolRenderContext) {
			const values = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
			return context.lastComponent instanceof Text ? context.lastComponent : renderTaskCall(name, values, theme);
		},
		renderResult(
			result: AgentToolResult<SubagentToolDetails>,
			_options: ToolRenderResultOptions,
			theme: Theme,
			context: ToolRenderContext,
		) {
			const text = context.lastComponent instanceof Text ? context.lastComponent : new Text("", 0, 0);
			text.setText(formatTaskResult(result.details, theme));
			return text;
		},
	});

	return {
		spawn_agent: {
			name: "spawn_agent",
			label: "spawn agent",
			description: "Spawn a durable background child-agent task. Returns immediately with a task id.",
			promptSnippet: "Spawn a durable background child agent",
			promptGuidelines: ["Use wait_agent when the child result is required before continuing."],
			parameters: spawnSchema,
			policy: {
				risk: "high",
				resources: [
					{ kind: "orchestrator", access: "manage" },
					{ kind: "process", access: "execute" },
				],
			},
			executionMode: "sequential",
			async execute(_id, rawParams, _signal, onUpdate) {
				const params = rawParams as Static<typeof spawnSchema>;
				const task = requireTask(
					await client.request({
						type: "spawn_task",
						prompt: params.task,
						cwd,
						label: params.label,
						parentTaskId: params.parentTaskId,
						dependencies: params.dependencies,
						budget: params.timeoutMs ? { timeoutMs: params.timeoutMs } : undefined,
						maxAttempts: params.maxAttempts,
						skillDataDir: options.skillDataDir,
					}),
				);
				onUpdate?.({ content: [{ type: "text", text: taskText(task) }], details: { task } });
				return { content: [{ type: "text", text: taskText(task) }], details: { task } };
			},
			...renderers("spawn_agent"),
		},
		wait_agent: {
			name: "wait_agent",
			label: "wait agent",
			description: "Wait for a child-agent task and stream its durable status until completion.",
			promptSnippet: "Wait for a child-agent result",
			parameters: waitSchema,
			policy: { risk: "low", resources: [{ kind: "orchestrator", access: "read" }] },
			async execute(_id, rawParams, signal, onUpdate) {
				const params = rawParams as Static<typeof waitSchema>;
				const startedAt = Date.now();
				for (;;) {
					const task = requireTask(await client.request({ type: "task_status", taskId: params.taskId }));
					onUpdate?.({ content: [{ type: "text", text: taskText(task) }], details: { task } });
					if (terminalStatuses.has(task.status)) {
						return { content: [{ type: "text", text: taskText(task) }], details: { task } };
					}
					if (params.timeoutMs !== undefined && Date.now() - startedAt >= params.timeoutMs) {
						throw new Error(`Timed out waiting for task ${params.taskId}`);
					}
					await waitForDelay(500, signal);
				}
			},
			...renderers("wait_agent"),
		},
		cancel_agent: {
			name: "cancel_agent",
			label: "cancel agent",
			description: "Cancel a queued or running child-agent task.",
			parameters: taskIdSchema,
			policy: { risk: "medium", resources: [{ kind: "orchestrator", access: "manage" }] },
			async execute(_id, rawParams) {
				const params = rawParams as Static<typeof taskIdSchema>;
				const task = requireTask(await client.request({ type: "cancel_task", taskId: params.taskId }));
				return { content: [{ type: "text", text: taskText(task) }], details: { task } };
			},
			...renderers("cancel_agent"),
		},
		retry_agent: {
			name: "retry_agent",
			label: "retry agent",
			description: "Retry a failed, cancelled, or timed-out child-agent task.",
			parameters: taskIdSchema,
			policy: { risk: "medium", resources: [{ kind: "orchestrator", access: "manage" }] },
			async execute(_id, rawParams) {
				const params = rawParams as Static<typeof taskIdSchema>;
				const task = requireTask(await client.request({ type: "retry_task", taskId: params.taskId }));
				return { content: [{ type: "text", text: taskText(task) }], details: { task } };
			},
			...renderers("retry_agent"),
		},
		list_agents: {
			name: "list_agents",
			label: "list agents",
			description: "List all durable child-agent tasks and their current status.",
			parameters: listSchema,
			policy: { risk: "low", resources: [{ kind: "orchestrator", access: "read" }] },
			async execute() {
				const response = await client.request({ type: "list_tasks" });
				if (!response.ok) throw new Error(response.error);
				if (response.type !== "task_list_result")
					throw new Error(`Unexpected orchestrator response: ${response.type}`);
				const text = response.tasks.map((task) => taskText(task)).join("\n\n") || "No child-agent tasks";
				return { content: [{ type: "text", text }], details: { tasks: response.tasks } };
			},
			...renderers("list_agents"),
		},
	};
}

export function createSubagentTool(
	name: "spawn_agent" | "wait_agent" | "cancel_agent" | "retry_agent" | "list_agents",
	cwd: string,
	options?: SubagentToolOptions,
): AgentTool {
	return wrapToolDefinition(createSubagentToolDefinitions(cwd, options)[name]);
}
