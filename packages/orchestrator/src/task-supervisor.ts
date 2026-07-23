import { randomUUID } from "node:crypto";
import { basename, dirname, extname, join } from "node:path";
import type { AgentSessionEvent, RpcResponse } from "@enterprise-agent/coding-agent";
import { createRpcProcessInstance } from "./rpc-process.ts";
import { FileTaskRepository, type TaskRepository } from "./storage.ts";
import type { SpawnTaskOptions, TaskEvent, TaskRecord, TaskResult, TaskStatus } from "./types.ts";

const TERMINAL_STATUSES: ReadonlySet<TaskStatus> = new Set(["completed", "failed", "cancelled", "timed_out"]);

export interface TaskExecutor {
	run(task: TaskRecord, signal: AbortSignal, onProgress: (message: string) => void): Promise<TaskResult>;
}

function responseData<T extends RpcResponse["command"]>(response: RpcResponse, command: T): unknown {
	if (!response.success || response.command !== command || !("data" in response)) {
		throw new Error(response.success ? `Unexpected RPC response for ${command}` : response.error);
	}
	return response.data;
}

export class RpcTaskExecutor implements TaskExecutor {
	async run(task: TaskRecord, signal: AbortSignal, onProgress: (message: string) => void): Promise<TaskResult> {
		const rpc = createRpcProcessInstance({ cwd: task.cwd });
		let settle: (() => void) | undefined;
		const settled = new Promise<void>((resolve) => {
			settle = resolve;
		});
		const unsubscribe = rpc.onEvent((event: AgentSessionEvent) => {
			if (event.type === "tool_execution_start") onProgress(`tool:${event.toolName}`);
			if (event.type === "agent_settled") settle?.();
		});
		rpc.setUiRequestHandler((request) => {
			if (request.method === "confirm") {
				rpc.handleUiResponse({ type: "extension_ui_response", id: request.id, confirmed: false });
			} else {
				rpc.handleUiResponse({ type: "extension_ui_response", id: request.id, cancelled: true });
			}
		});
		const abort = () => {
			void rpc.send({ type: "abort" }).catch(() => undefined);
		};
		signal.addEventListener("abort", abort, { once: true });

		try {
			const promptResponse = await rpc.send({ type: "prompt", message: task.prompt });
			if (!promptResponse.success) throw new Error(promptResponse.error);
			await settled;
			if (signal.aborted) throw signal.reason instanceof Error ? signal.reason : new Error("Task aborted");

			const textResponse = await rpc.send({ type: "get_last_assistant_text" });
			const text = responseData(textResponse, "get_last_assistant_text") as { text: string | null };
			const stateResponse = await rpc.send({ type: "get_state" });
			const state = responseData(stateResponse, "get_state") as { sessionId: string; sessionFile?: string };
			const artifacts = state.sessionFile
				? [
						{ path: state.sessionFile, mediaType: "application/x-ndjson", label: "Session" },
						{
							path: join(
								dirname(state.sessionFile),
								"traces",
								`${basename(state.sessionFile, extname(state.sessionFile))}.trace.jsonl`,
							),
							mediaType: "application/x-ndjson",
							label: "Trace",
						},
					]
				: [];
			return {
				summary: text.text ?? "Task completed without an assistant text result",
				artifacts,
				sessionId: state.sessionId,
				sessionFile: state.sessionFile,
			};
		} finally {
			signal.removeEventListener("abort", abort);
			unsubscribe();
			await rpc.dispose();
		}
	}
}

interface RunningTask {
	controller: AbortController;
	promise: Promise<void>;
}

export interface TaskSupervisorOptions {
	maxConcurrent?: number;
	repository?: TaskRepository;
	executor?: TaskExecutor;
}

export class TaskSupervisor {
	private readonly maxConcurrent: number;
	private readonly repository: TaskRepository;
	private readonly executor: TaskExecutor;
	private readonly tasks = new Map<string, TaskRecord>();
	private readonly running = new Map<string, RunningTask>();
	private readonly listeners = new Set<(event: TaskEvent) => void>();
	private readonly waiters = new Map<string, Set<(task: TaskRecord) => void>>();
	private pumpQueued = false;
	private shuttingDown = false;

	constructor(options: TaskSupervisorOptions = {}) {
		this.maxConcurrent = Math.max(1, options.maxConcurrent ?? 4);
		this.repository = options.repository ?? new FileTaskRepository();
		this.executor = options.executor ?? new RpcTaskExecutor();
		for (const task of this.repository.load()) this.tasks.set(task.id, task);
	}

	async recoverAfterRestart(): Promise<void> {
		this.shuttingDown = false;
		for (const task of this.tasks.values()) {
			if (task.status !== "running") continue;
			task.status = "queued";
			task.updatedAt = new Date().toISOString();
			task.error = undefined;
			this.emit(task, "recovered", "Recovered after orchestrator restart");
		}
		this.persist();
		this.schedulePump();
	}

	spawnTask(options: SpawnTaskOptions): TaskRecord {
		if (options.parentTaskId && !this.tasks.has(options.parentTaskId)) {
			throw new Error(`Unknown parent task: ${options.parentTaskId}`);
		}
		for (const dependency of options.dependencies ?? []) {
			if (!this.tasks.has(dependency)) throw new Error(`Unknown dependency task: ${dependency}`);
		}
		const now = new Date().toISOString();
		const task: TaskRecord = {
			id: randomUUID(),
			parentTaskId: options.parentTaskId,
			childTaskIds: [],
			dependencies: [...(options.dependencies ?? [])],
			status: "queued",
			prompt: options.prompt,
			cwd: options.cwd,
			label: options.label,
			budget: { ...options.budget },
			attempt: 0,
			maxAttempts: Math.max(1, options.maxAttempts ?? 1),
			createdAt: now,
			updatedAt: now,
		};
		this.tasks.set(task.id, task);
		if (task.parentTaskId) {
			const parent = this.tasks.get(task.parentTaskId);
			if (parent) parent.childTaskIds = [...parent.childTaskIds, task.id];
		}
		this.persist();
		this.emit(task, "created");
		this.schedulePump();
		return this.clone(task);
	}

	listTasks(): TaskRecord[] {
		return [...this.tasks.values()].map((task) => this.clone(task));
	}

	getTask(taskId: string): TaskRecord | undefined {
		const task = this.tasks.get(taskId);
		return task ? this.clone(task) : undefined;
	}

	cancelTask(taskId: string): TaskRecord | undefined {
		const task = this.tasks.get(taskId);
		if (!task || TERMINAL_STATUSES.has(task.status)) return task ? this.clone(task) : undefined;
		if (task.status === "running") {
			this.running.get(taskId)?.controller.abort(new Error("Task cancelled"));
		} else {
			this.transition(task, "cancelled", { error: "Task cancelled" });
			this.emit(task, "cancelled");
			this.notifyWaiters(task);
		}
		return this.clone(task);
	}

	retryTask(taskId: string): TaskRecord | undefined {
		const task = this.tasks.get(taskId);
		if (!task || !TERMINAL_STATUSES.has(task.status) || task.status === "completed") {
			return task ? this.clone(task) : undefined;
		}
		task.maxAttempts = Math.max(task.maxAttempts, task.attempt + 1);
		this.transition(task, "queued", { error: undefined, completedAt: undefined });
		this.emit(task, "retrying", "Explicit retry requested");
		this.schedulePump();
		return this.clone(task);
	}

	waitForTask(taskId: string, timeoutMs?: number): Promise<TaskRecord> {
		const task = this.tasks.get(taskId);
		if (!task) return Promise.reject(new Error(`Unknown task: ${taskId}`));
		if (TERMINAL_STATUSES.has(task.status)) return Promise.resolve(this.clone(task));
		return new Promise<TaskRecord>((resolve, reject) => {
			let timer: NodeJS.Timeout | undefined;
			const complete = (completed: TaskRecord) => {
				if (timer) clearTimeout(timer);
				resolve(this.clone(completed));
			};
			const taskWaiters = this.waiters.get(taskId) ?? new Set();
			taskWaiters.add(complete);
			this.waiters.set(taskId, taskWaiters);
			if (timeoutMs !== undefined) {
				timer = setTimeout(() => {
					taskWaiters.delete(complete);
					reject(new Error(`Timed out waiting for task ${taskId}`));
				}, timeoutMs);
			}
		});
	}

	subscribe(listener: (event: TaskEvent) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	async shutdown(): Promise<void> {
		this.shuttingDown = true;
		for (const running of this.running.values()) running.controller.abort(new Error("Orchestrator shutting down"));
		await Promise.allSettled([...this.running.values()].map((running) => running.promise));
		this.persist();
	}

	private schedulePump(): void {
		if (this.pumpQueued || this.shuttingDown) return;
		this.pumpQueued = true;
		queueMicrotask(() => {
			this.pumpQueued = false;
			this.pump();
		});
	}

	private pump(): void {
		if (this.shuttingDown) return;
		for (const task of this.tasks.values()) {
			if (this.running.size >= this.maxConcurrent) break;
			if (task.status !== "queued" && task.status !== "waiting") continue;
			const dependencies = task.dependencies.map((id) => this.tasks.get(id));
			if (
				dependencies.some(
					(dependency) =>
						!dependency || (TERMINAL_STATUSES.has(dependency.status) && dependency.status !== "completed"),
				)
			) {
				this.transition(task, "failed", { error: "A dependency did not complete successfully" });
				this.emit(task, "failed", task.error);
				this.notifyWaiters(task);
				continue;
			}
			if (dependencies.some((dependency) => dependency?.status !== "completed")) {
				if (task.status !== "waiting") this.transition(task, "waiting");
				continue;
			}
			this.startTask(task);
		}
	}

	private startTask(task: TaskRecord): void {
		const controller = new AbortController();
		const promise = this.executeTask(task, controller).finally(() => {
			this.running.delete(task.id);
			this.schedulePump();
		});
		this.running.set(task.id, { controller, promise });
	}

	private async executeTask(task: TaskRecord, controller: AbortController): Promise<void> {
		task.attempt++;
		this.transition(task, "running", {
			startedAt: new Date().toISOString(),
			completedAt: undefined,
			error: undefined,
		});
		this.emit(task, "started");
		const timeoutMs = task.budget.timeoutMs;
		const timer = timeoutMs
			? setTimeout(() => controller.abort(new Error(`Task timed out after ${timeoutMs}ms`)), timeoutMs)
			: undefined;
		try {
			const result = await this.executor.run(task, controller.signal, (message) =>
				this.emit(task, "progress", message),
			);
			this.transition(task, "completed", { result, completedAt: new Date().toISOString() });
			this.emit(task, "completed", result.summary);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (this.shuttingDown) {
				this.transition(task, "queued", { error: undefined, startedAt: undefined });
				this.emit(task, "recovered", "Queued for restart recovery");
			} else if (controller.signal.aborted && message.includes("timed out")) {
				this.handleFailure(task, "timed_out", message);
			} else if (controller.signal.aborted) {
				this.transition(task, "cancelled", { error: message, completedAt: new Date().toISOString() });
				this.emit(task, "cancelled", message);
			} else {
				this.handleFailure(task, "failed", message);
			}
		} finally {
			if (timer) clearTimeout(timer);
			if (TERMINAL_STATUSES.has(task.status)) this.notifyWaiters(task);
		}
	}

	private handleFailure(task: TaskRecord, status: "failed" | "timed_out", message: string): void {
		if (task.attempt < task.maxAttempts) {
			this.transition(task, "queued", { error: message, startedAt: undefined });
			this.emit(task, "retrying", message);
			return;
		}
		this.transition(task, status, { error: message, completedAt: new Date().toISOString() });
		this.emit(task, "failed", message);
	}

	private transition(task: TaskRecord, status: TaskStatus, updates: Partial<TaskRecord> = {}): void {
		Object.assign(task, updates, { status, updatedAt: new Date().toISOString() });
		this.persist();
	}

	private persist(): void {
		this.repository.save([...this.tasks.values()]);
	}

	private emit(task: TaskRecord, eventType: TaskEvent["eventType"], message?: string): void {
		const event: TaskEvent = {
			type: "task_event",
			eventType,
			taskId: task.id,
			timestamp: new Date().toISOString(),
			status: task.status,
			message,
			attempt: task.attempt,
		};
		this.repository.appendEvent(event);
		for (const listener of this.listeners) listener(event);
	}

	private notifyWaiters(task: TaskRecord): void {
		const taskWaiters = this.waiters.get(task.id);
		if (!taskWaiters) return;
		this.waiters.delete(task.id);
		for (const waiter of taskWaiters) waiter(task);
	}

	private clone(task: TaskRecord): TaskRecord {
		return structuredClone(task);
	}
}

export const taskSupervisor = new TaskSupervisor();
