import { describe, expect, it } from "vitest";
import type {
	OrchestratorTaskRequest,
	OrchestratorTaskResponse,
	SubagentTask,
} from "../src/core/orchestrator-client.ts";
import { createSubagentToolDefinitions } from "../src/core/tools/subagent.ts";

function task(status: SubagentTask["status"], overrides: Partial<SubagentTask> = {}): SubagentTask {
	return {
		id: "task-1",
		childTaskIds: [],
		dependencies: [],
		status,
		prompt: "work",
		cwd: process.cwd(),
		attempt: status === "queued" ? 0 : 1,
		maxAttempts: 2,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		...overrides,
	};
}

describe("official subagent tools", () => {
	it("declares and registers the full durable task lifecycle", () => {
		const definitions = createSubagentToolDefinitions(process.cwd(), {
			client: {
				async request() {
					return { type: "task_list_result", ok: true, tasks: [] };
				},
			},
		});
		expect(Object.keys(definitions)).toEqual([
			"spawn_agent",
			"wait_agent",
			"cancel_agent",
			"retry_agent",
			"list_agents",
		]);
		expect(definitions.spawn_agent.policy?.risk).toBe("high");
		expect(definitions.wait_agent.policy?.resources[0]?.kind).toBe("orchestrator");
	});

	it("spawns a task and returns its durable id", async () => {
		let request: OrchestratorTaskRequest | undefined;
		const definitions = createSubagentToolDefinitions("D:/workspace", {
			client: {
				async request(next): Promise<OrchestratorTaskResponse> {
					request = next;
					return { type: "task_result", ok: true, task: task("queued") };
				},
			},
		});
		const result = await definitions.spawn_agent.execute(
			"call-1",
			{ task: "work", label: "child", timeoutMs: 1000 },
			undefined,
			undefined,
			undefined as never,
		);
		expect(request).toMatchObject({
			type: "spawn_task",
			prompt: "work",
			label: "child",
			budget: { timeoutMs: 1000 },
		});
		expect(result.details.task?.id).toBe("task-1");
	});

	it("streams task progress and returns summary with artifact references", async () => {
		const responses = [
			task("running"),
			task("completed", {
				result: { summary: "done", artifacts: [{ path: "trace.jsonl", label: "Trace" }] },
			}),
		];
		const definitions = createSubagentToolDefinitions(process.cwd(), {
			client: {
				async request(): Promise<OrchestratorTaskResponse> {
					return { type: "task_result", ok: true, task: responses.shift() ?? task("completed") };
				},
			},
		});
		const updates: string[] = [];
		const result = await definitions.wait_agent.execute(
			"call-2",
			{ taskId: "task-1", timeoutMs: 2_000 },
			undefined,
			(update) => updates.push(update.content[0]?.type === "text" ? update.content[0].text : ""),
			undefined as never,
		);
		expect(updates).toHaveLength(2);
		expect(result.content[0]?.type === "text" ? result.content[0].text : "").toContain("Trace: trace.jsonl");
	});
});
