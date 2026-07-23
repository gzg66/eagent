import type {
	AgentSessionEvent,
	RpcCommand,
	RpcExtensionUIRequest,
	RpcExtensionUIResponse,
	RpcResponse,
} from "@enterprise-agent/coding-agent";
import type { InstanceStatus, SpawnTaskOptions, TaskRecord } from "../types.ts";

export interface SpawnRequest {
	type: "spawn";
	cwd: string;
	label?: string;
	provider?: string;
	model?: string;
}

export interface ListRequest {
	type: "list";
}

export interface StopRequest {
	type: "stop";
	instanceId: string;
}

export interface StatusRequest {
	type: "status";
	instanceId: string;
}

export interface RpcRequest {
	type: "rpc";
	instanceId: string;
	command: RpcCommand;
}

export interface RpcStreamRequest {
	type: "rpc_stream";
	instanceId: string;
}

export interface SpawnTaskRequest extends SpawnTaskOptions {
	type: "spawn_task";
}

export interface ListTasksRequest {
	type: "list_tasks";
}

export interface TaskStatusRequest {
	type: "task_status";
	taskId: string;
}

export interface CancelTaskRequest {
	type: "cancel_task";
	taskId: string;
}

export interface RetryTaskRequest {
	type: "retry_task";
	taskId: string;
}

export interface WaitTaskRequest {
	type: "wait_task";
	taskId: string;
	timeoutMs?: number;
}

export interface RequestMap {
	spawn: SpawnRequest;
	list: ListRequest;
	stop: StopRequest;
	status: StatusRequest;
	rpc: RpcRequest;
	rpc_stream: RpcStreamRequest;
	spawn_task: SpawnTaskRequest;
	list_tasks: ListTasksRequest;
	task_status: TaskStatusRequest;
	cancel_task: CancelTaskRequest;
	retry_task: RetryTaskRequest;
	wait_task: WaitTaskRequest;
}

export type OrchestratorRequest = RequestMap[keyof RequestMap];

export interface InstanceSummary {
	id: string;
	status: InstanceStatus;
	cwd: string;
	label?: string;
	sessionId?: string;
	sessionFile?: string;
}

export interface ResponseBase {
	ok: boolean;
	error?: string;
}

export interface SpawnResponse extends ResponseBase {
	type: "spawn_result";
	instance?: InstanceSummary;
}

export interface ListResponse extends ResponseBase {
	type: "list_result";
	instances?: InstanceSummary[];
}

export interface StopResponse extends ResponseBase {
	type: "stop_result";
	instanceId?: string;
}

export interface StatusResponse extends ResponseBase {
	type: "status_result";
	instance?: InstanceSummary;
}

export interface RpcBridgeResponse extends ResponseBase {
	type: "rpc_result";
	response: RpcResponse;
}

export interface RpcReadyResponse extends ResponseBase {
	type: "rpc_ready";
	instance?: InstanceSummary;
}

export interface TaskResponse extends ResponseBase {
	type: "task_result";
	task?: TaskRecord;
}

export interface TaskListResponse extends ResponseBase {
	type: "task_list_result";
	tasks?: TaskRecord[];
}

export interface ErrorResponse extends ResponseBase {
	type: "error";
	ok: false;
	error: string;
}

export interface ResponseMap {
	spawn: SpawnResponse;
	list: ListResponse;
	stop: StopResponse;
	status: StatusResponse;
	rpc: RpcBridgeResponse;
	rpc_stream: RpcReadyResponse;
	spawn_task: TaskResponse;
	list_tasks: TaskListResponse;
	task_status: TaskResponse;
	cancel_task: TaskResponse;
	retry_task: TaskResponse;
	wait_task: TaskResponse;
}

export type OrchestratorResponse = ResponseMap[keyof ResponseMap] | ErrorResponse;
export type RpcClientMessage = RpcCommand | RpcExtensionUIResponse;
export type RpcServerMessage =
	| RpcReadyResponse
	| RpcResponse
	| AgentSessionEvent
	| RpcExtensionUIRequest
	| ErrorResponse;
export type ProtocolMessage = OrchestratorRequest | OrchestratorResponse | RpcClientMessage | RpcServerMessage;

export type ResponseFor<T extends OrchestratorRequest> = T extends { type: infer K }
	? K extends keyof ResponseMap
		? ResponseMap[K] | ErrorResponse
		: ErrorResponse
	: ErrorResponse;

export function encodeMessage(message: ProtocolMessage): string {
	return `${JSON.stringify(message)}\n`;
}

export function parseRequestLine(line: string): OrchestratorRequest {
	const value = JSON.parse(line) as OrchestratorRequest;
	return value;
}

export function parseResponseLine(line: string): OrchestratorResponse {
	const value = JSON.parse(line) as OrchestratorResponse;
	return value;
}
