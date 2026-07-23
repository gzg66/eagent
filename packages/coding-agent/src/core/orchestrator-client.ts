import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { createConnection } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type SubagentTaskStatus = "queued" | "waiting" | "running" | "completed" | "failed" | "cancelled" | "timed_out";

export interface SubagentArtifact {
	path: string;
	mediaType?: string;
	label?: string;
}

export interface SubagentTask {
	id: string;
	parentTaskId?: string;
	childTaskIds: string[];
	dependencies: string[];
	status: SubagentTaskStatus;
	prompt: string;
	cwd: string;
	label?: string;
	attempt: number;
	maxAttempts: number;
	createdAt: string;
	updatedAt: string;
	result?: {
		summary: string;
		artifacts: SubagentArtifact[];
		sessionId?: string;
		sessionFile?: string;
	};
	error?: string;
}

export type OrchestratorTaskRequest =
	| {
			type: "spawn_task";
			prompt: string;
			cwd: string;
			label?: string;
			parentTaskId?: string;
			dependencies?: string[];
			budget?: { maxTokens?: number; maxCostUsd?: number; timeoutMs?: number };
			maxAttempts?: number;
			skillDataDir?: string;
	  }
	| { type: "list_tasks" }
	| { type: "task_status" | "cancel_task" | "retry_task"; taskId: string }
	| { type: "wait_task"; taskId: string; timeoutMs?: number };

export type OrchestratorTaskResponse =
	| { type: "task_result"; ok: true; task: SubagentTask }
	| { type: "task_list_result"; ok: true; tasks: SubagentTask[] }
	| { type: "error"; ok: false; error: string };

function getOrchestratorDir(cwd: string): string {
	return (
		process.env.EAGENT_ORCHESTRATOR_DIR ?? join(process.env.EAGENT_CONFIG_DIR ?? join(cwd, ".eagent"), "orchestrator")
	);
}

function getSocketPath(cwd: string): string {
	const dir = getOrchestratorDir(cwd);
	if (process.platform === "win32") {
		const suffix = createHash("sha256").update(dir).digest("hex").slice(0, 16);
		return `\\\\.\\pipe\\eagent-orchestrator-${suffix}`;
	}
	return join(dir, "orchestrator.sock");
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

const daemonStartPromises = new Map<string, Promise<void>>();

async function ensureDaemon(cwd: string, socketPath: string): Promise<void> {
	let daemonStartPromise = daemonStartPromises.get(socketPath);
	if (!daemonStartPromise) {
		daemonStartPromise = (async () => {
			const localCli = join(dirname(fileURLToPath(import.meta.url)), "../../../orchestrator/dist/cli.js");
			const configuredCommand = process.env.EAGENT_ORCHESTRATOR_BIN;
			const command =
				configuredCommand ??
				(existsSync(localCli)
					? process.execPath
					: process.platform === "win32"
						? "orchestrator.cmd"
						: "orchestrator");
			const args = configuredCommand || !existsSync(localCli) ? ["serve"] : [localCli, "serve"];
			const child = spawn(command, args, {
				cwd,
				detached: true,
				stdio: "ignore",
				shell: Boolean(configuredCommand) && process.platform === "win32",
				windowsHide: true,
			});
			child.unref();
			await delay(250);
		})();
		daemonStartPromises.set(socketPath, daemonStartPromise);
	}
	return daemonStartPromise;
}

function requestOnce(socketPath: string, request: OrchestratorTaskRequest): Promise<OrchestratorTaskResponse> {
	return new Promise((resolve, reject) => {
		const socket = createConnection(socketPath);
		let buffer = "";
		let settled = false;
		const finish = (error?: Error, response?: OrchestratorTaskResponse) => {
			if (settled) return;
			settled = true;
			socket.removeAllListeners();
			socket.destroy();
			if (error) reject(error);
			else if (response) resolve(response);
		};
		socket.on("connect", () => socket.write(`${JSON.stringify(request)}\n`));
		socket.on("data", (chunk: Buffer | string) => {
			buffer += chunk.toString();
			const newline = buffer.indexOf("\n");
			if (newline === -1) return;
			try {
				finish(undefined, JSON.parse(buffer.slice(0, newline)) as OrchestratorTaskResponse);
			} catch (error) {
				finish(error instanceof Error ? error : new Error(String(error)));
			}
		});
		socket.on("error", (error) => finish(error));
		socket.on("end", () => finish(new Error("Orchestrator closed the connection before responding")));
	});
}

export class OrchestratorTaskClient {
	private readonly cwd: string;

	constructor(cwd: string) {
		this.cwd = cwd;
	}

	async request(request: OrchestratorTaskRequest): Promise<OrchestratorTaskResponse> {
		const socketPath = getSocketPath(this.cwd);
		try {
			return await requestOnce(socketPath, request);
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (code !== "ENOENT" && code !== "ECONNREFUSED" && code !== "EPIPE") throw error;
		}
		await ensureDaemon(this.cwd, socketPath);
		let lastError: unknown;
		for (let attempt = 0; attempt < 20; attempt++) {
			try {
				return await requestOnce(socketPath, request);
			} catch (error) {
				lastError = error;
				await delay(100);
			}
		}
		throw lastError instanceof Error ? lastError : new Error("Unable to start orchestrator daemon");
	}
}
