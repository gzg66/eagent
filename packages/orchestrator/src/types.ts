export type InstanceStatus = "starting" | "online" | "stopping" | "stopped" | "error";

export interface InstanceRecord {
	id: string;
	status: InstanceStatus;
	cwd: string;
	createdAt: string;
	lastSeenAt?: string;
	label?: string;
	sessionId?: string;
	sessionFile?: string;
}

export type TaskStatus = "queued" | "waiting" | "running" | "completed" | "failed" | "cancelled" | "timed_out";

export interface TaskBudget {
	maxTokens?: number;
	maxCostUsd?: number;
	timeoutMs?: number;
}

export interface TaskArtifact {
	path: string;
	mediaType?: string;
	label?: string;
}

export interface TaskResult {
	summary: string;
	artifacts: TaskArtifact[];
	sessionId?: string;
	sessionFile?: string;
}

export interface TaskRecord {
	id: string;
	parentTaskId?: string;
	childTaskIds: string[];
	dependencies: string[];
	status: TaskStatus;
	prompt: string;
	cwd: string;
	skillDataDir?: string;
	label?: string;
	budget: TaskBudget;
	attempt: number;
	maxAttempts: number;
	createdAt: string;
	updatedAt: string;
	startedAt?: string;
	completedAt?: string;
	result?: TaskResult;
	error?: string;
}

export type TaskEventType =
	| "created"
	| "queued"
	| "started"
	| "progress"
	| "completed"
	| "failed"
	| "cancelled"
	| "retrying"
	| "recovered";

export interface TaskEvent {
	type: "task_event";
	eventType: TaskEventType;
	taskId: string;
	timestamp: string;
	status: TaskStatus;
	message?: string;
	attempt: number;
}

export interface SpawnTaskOptions {
	prompt: string;
	cwd: string;
	skillDataDir?: string;
	label?: string;
	parentTaskId?: string;
	dependencies?: string[];
	budget?: TaskBudget;
	maxAttempts?: number;
}
