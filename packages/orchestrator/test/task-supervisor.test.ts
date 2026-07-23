import { afterEach, describe, expect, it } from "vitest";
import type { TaskRepository } from "../src/storage.ts";
import { type TaskExecutor, TaskSupervisor } from "../src/task-supervisor.ts";
import type { TaskEvent, TaskRecord, TaskResult } from "../src/types.ts";

class MemoryTaskRepository implements TaskRepository {
	tasks: TaskRecord[];
	readonly events: TaskEvent[] = [];

	constructor(tasks: TaskRecord[] = []) {
		this.tasks = structuredClone(tasks);
	}

	load(): TaskRecord[] {
		return structuredClone(this.tasks);
	}

	save(tasks: TaskRecord[]): void {
		this.tasks = structuredClone(tasks);
	}

	appendEvent(event: TaskEvent): void {
		this.events.push(structuredClone(event));
	}
}

const supervisors: TaskSupervisor[] = [];

afterEach(async () => {
	await Promise.all(supervisors.splice(0).map((supervisor) => supervisor.shutdown()));
});

function result(summary: string): TaskResult {
	return { summary, artifacts: [] };
}

describe("TaskSupervisor", () => {
	it("runs dependency graphs and records parent/child relationships", async () => {
		const order: string[] = [];
		const executor: TaskExecutor = {
			async run(task) {
				order.push(task.prompt);
				return result(task.prompt);
			},
		};
		const supervisor = new TaskSupervisor({ repository: new MemoryTaskRepository(), executor, maxConcurrent: 2 });
		supervisors.push(supervisor);
		await supervisor.recoverAfterRestart();
		const parent = supervisor.spawnTask({ prompt: "parent", cwd: process.cwd() });
		const child = supervisor.spawnTask({
			prompt: "child",
			cwd: process.cwd(),
			skillDataDir: "D:/sessions/parent/skills",
			parentTaskId: parent.id,
			dependencies: [parent.id],
		});

		expect((await supervisor.waitForTask(child.id)).status).toBe("completed");
		expect(order).toEqual(["parent", "child"]);
		expect(supervisor.getTask(parent.id)?.childTaskIds).toEqual([child.id]);
		expect(supervisor.getTask(child.id)?.skillDataDir).toBe("D:/sessions/parent/skills");
	});

	it("enforces concurrency and automatically retries failures", async () => {
		let active = 0;
		let maximum = 0;
		const attempts = new Map<string, number>();
		const executor: TaskExecutor = {
			async run(task) {
				active++;
				maximum = Math.max(maximum, active);
				await new Promise((resolve) => setTimeout(resolve, 10));
				active--;
				const attempt = (attempts.get(task.id) ?? 0) + 1;
				attempts.set(task.id, attempt);
				if (task.prompt === "retry" && attempt === 1) throw new Error("transient");
				return result(task.prompt);
			},
		};
		const supervisor = new TaskSupervisor({ repository: new MemoryTaskRepository(), executor, maxConcurrent: 1 });
		supervisors.push(supervisor);
		await supervisor.recoverAfterRestart();
		const retry = supervisor.spawnTask({ prompt: "retry", cwd: process.cwd(), maxAttempts: 2 });
		const second = supervisor.spawnTask({ prompt: "second", cwd: process.cwd() });

		expect((await supervisor.waitForTask(retry.id)).status).toBe("completed");
		expect((await supervisor.waitForTask(second.id)).status).toBe("completed");
		expect(supervisor.getTask(retry.id)?.attempt).toBe(2);
		expect(maximum).toBe(1);
	});

	it("supports cancellation and timeout", async () => {
		const executor: TaskExecutor = {
			async run(_task, signal) {
				return await new Promise<TaskResult>((_resolve, reject) => {
					signal.addEventListener("abort", () => reject(signal.reason), { once: true });
				});
			},
		};
		const supervisor = new TaskSupervisor({ repository: new MemoryTaskRepository(), executor, maxConcurrent: 2 });
		supervisors.push(supervisor);
		await supervisor.recoverAfterRestart();
		const cancelled = supervisor.spawnTask({ prompt: "cancel", cwd: process.cwd() });
		const timedOut = supervisor.spawnTask({ prompt: "timeout", cwd: process.cwd(), budget: { timeoutMs: 10 } });
		await new Promise((resolve) => setTimeout(resolve, 0));
		supervisor.cancelTask(cancelled.id);

		expect((await supervisor.waitForTask(cancelled.id)).status).toBe("cancelled");
		expect((await supervisor.waitForTask(timedOut.id)).status).toBe("timed_out");
	});

	it("recovers running tasks after restart instead of marking them stopped", async () => {
		const now = new Date().toISOString();
		const repository = new MemoryTaskRepository([
			{
				id: "recover-me",
				childTaskIds: [],
				dependencies: [],
				status: "running",
				prompt: "resume",
				cwd: process.cwd(),
				budget: {},
				attempt: 1,
				maxAttempts: 2,
				createdAt: now,
				updatedAt: now,
			},
		]);
		const supervisor = new TaskSupervisor({
			repository,
			executor: {
				async run() {
					return result("recovered");
				},
			},
		});
		supervisors.push(supervisor);
		await supervisor.recoverAfterRestart();

		expect((await supervisor.waitForTask("recover-me")).status).toBe("completed");
		expect(repository.events.some((event) => event.eventType === "recovered")).toBe(true);
	});
});
