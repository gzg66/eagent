import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { getInstancesPath, getOrchestratorDir, getTaskEventsPath, getTasksPath } from "./config.ts";
import type { InstanceRecord, TaskEvent, TaskRecord } from "./types.ts";

function ensureOrchestratorDir(): void {
	const orchestratorDir = getOrchestratorDir();
	if (!existsSync(orchestratorDir)) {
		mkdirSync(orchestratorDir, { recursive: true });
	}
}

export function loadInstances(): InstanceRecord[] {
	const instancesPath = getInstancesPath();
	if (!existsSync(instancesPath)) {
		return [];
	}

	const data = readFileSync(instancesPath, "utf-8");
	return JSON.parse(data) as InstanceRecord[];
}

export function saveInstances(instances: InstanceRecord[]): void {
	ensureOrchestratorDir();
	writeJsonAtomically(getInstancesPath(), instances);
}

function writeJsonAtomically(path: string, value: unknown): void {
	const temporaryPath = `${path}.${process.pid}.tmp`;
	writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
	renameSync(temporaryPath, path);
}

export function getInstance(instanceId: string): InstanceRecord | undefined {
	return loadInstances().find((instance) => instance.id === instanceId);
}

export function upsertInstance(instance: InstanceRecord): void {
	const instances = loadInstances();
	const index = instances.findIndex((existing) => existing.id === instance.id);
	if (index === -1) {
		instances.push(instance);
		saveInstances(instances);
		return;
	}

	instances[index] = instance;
	saveInstances(instances);
}

export function removeInstance(instanceId: string): void {
	const instances = loadInstances().filter((instance) => instance.id !== instanceId);
	saveInstances(instances);
}

export interface TaskRepository {
	load(): TaskRecord[];
	save(tasks: TaskRecord[]): void;
	appendEvent(event: TaskEvent): void;
}

export class FileTaskRepository implements TaskRepository {
	load(): TaskRecord[] {
		const path = getTasksPath();
		if (!existsSync(path)) return [];
		return JSON.parse(readFileSync(path, "utf-8")) as TaskRecord[];
	}

	save(tasks: TaskRecord[]): void {
		ensureOrchestratorDir();
		writeJsonAtomically(getTasksPath(), tasks);
	}

	appendEvent(event: TaskEvent): void {
		ensureOrchestratorDir();
		appendFileSync(getTaskEventsPath(), `${JSON.stringify(event)}\n`, "utf-8");
	}
}
