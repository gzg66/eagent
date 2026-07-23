import type { Server } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { sendIpcRequest } from "../src/ipc/client.ts";
import type { OrchestratorRequest, OrchestratorResponse } from "../src/ipc/protocol.ts";
import type { IpcRequestHandler } from "../src/ipc/server.ts";
import { startIpcServer } from "../src/ipc/server.ts";
import type { TaskRepository } from "../src/storage.ts";
import { TaskSupervisor } from "../src/task-supervisor.ts";
import type { TaskEvent, TaskRecord } from "../src/types.ts";

class MemoryRepository implements TaskRepository {
	private tasks: TaskRecord[] = [];
	load(): TaskRecord[] {
		return structuredClone(this.tasks);
	}
	save(tasks: TaskRecord[]): void {
		this.tasks = structuredClone(tasks);
	}
	appendEvent(_event: TaskEvent): void {}
}

let server: Server | undefined;
let supervisor: TaskSupervisor | undefined;

afterEach(async () => {
	if (server) await new Promise<void>((resolve) => server?.close(() => resolve()));
	await supervisor?.shutdown();
	server = undefined;
	supervisor = undefined;
});

describe("orchestrator task IPC", () => {
	it("spawns, lists, and waits for a durable task over the socket protocol", async () => {
		supervisor = new TaskSupervisor({
			repository: new MemoryRepository(),
			executor: {
				async run(task) {
					return { summary: `done:${task.prompt}`, artifacts: [] };
				},
			},
		});
		await supervisor.recoverAfterRestart();
		const requestHandler = async (request: OrchestratorRequest): Promise<OrchestratorResponse> => {
			switch (request.type) {
				case "spawn_task":
					return { type: "task_result", ok: true, task: supervisor?.spawnTask(request) };
				case "list_tasks":
					return { type: "task_list_result", ok: true, tasks: supervisor?.listTasks() };
				case "wait_task":
					return { type: "task_result", ok: true, task: await supervisor?.waitForTask(request.taskId) };
				default:
					return { type: "error", ok: false, error: "unsupported in test" };
			}
		};
		const handler = Object.assign(requestHandler, { openRpcStream: () => undefined }) as IpcRequestHandler;
		server = await startIpcServer(handler);

		const spawned = await sendIpcRequest({ type: "spawn_task", prompt: "work", cwd: process.cwd() });
		expect(spawned.type).toBe("task_result");
		if (spawned.type !== "task_result" || !spawned.task) throw new Error("Task was not created");
		const waited = await sendIpcRequest({ type: "wait_task", taskId: spawned.task.id });
		expect(waited.type === "task_result" ? waited.task?.result?.summary : undefined).toBe("done:work");
		const listed = await sendIpcRequest({ type: "list_tasks" });
		expect(listed.type === "task_list_result" ? listed.tasks?.length : 0).toBe(1);
	});
});
