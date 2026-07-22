import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import type { AgentEvent, AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage } from "@earendil-works/pi-ai/compat";

export const TRACE_SCHEMA_VERSION = 1;

export type TraceSpanKind = "session" | "agent" | "turn" | "skill" | "tool";
export type TraceEventPhase = "start" | "update" | "end";
export type TraceStatus = "ok" | "error" | "aborted";
export type TraceAttributeValue = string | number | boolean | null;
export type TraceAttributes = Record<string, TraceAttributeValue>;

export interface TraceEvent {
	type: "trace";
	schemaVersion: typeof TRACE_SCHEMA_VERSION;
	eventId: string;
	sequence: number;
	timestamp: string;
	sessionId: string;
	traceId: string;
	spanId: string;
	parentSpanId?: string;
	name: string;
	kind: TraceSpanKind;
	phase: TraceEventPhase;
	status?: TraceStatus;
	durationMs?: number;
	attributes: TraceAttributes;
}

export interface TraceSpan {
	traceId: string;
	spanId: string;
	parentSpanId?: string;
	name: string;
	kind: TraceSpanKind;
	startedAt: number;
}

interface ActiveTrace {
	root: TraceSpan;
	agent?: TraceSpan;
	turn?: TraceSpan;
	tools: Map<string, TraceSpan>;
	status: TraceStatus;
}

export interface SessionTraceOptions {
	sessionId: string;
	sessionFile?: string;
	onEvent?: (event: TraceEvent) => void;
}

function statusPriority(status: TraceStatus): number {
	if (status === "error") return 2;
	if (status === "aborted") return 1;
	return 0;
}

function assistantStatus(message: AgentMessage | undefined): TraceStatus {
	if (message?.role !== "assistant") return "ok";
	const stopReason = (message as AssistantMessage).stopReason;
	if (stopReason === "error") return "error";
	if (stopReason === "aborted") return "aborted";
	return "ok";
}

function assistantAttributes(message: AgentMessage | undefined): TraceAttributes {
	if (message?.role !== "assistant") return {};
	const assistant = message as AssistantMessage;
	const usage = assistant.usage;
	return {
		stopReason: assistant.stopReason,
		inputTokens: usage.input,
		outputTokens: usage.output,
		cacheReadTokens: usage.cacheRead,
		cacheWriteTokens: usage.cacheWrite,
		cost: usage.cost.total,
	};
}

function lastAssistantMessage(messages: AgentMessage[]): AgentMessage | undefined {
	for (let index = messages.length - 1; index >= 0; index--) {
		if (messages[index]?.role === "assistant") return messages[index];
	}
	return undefined;
}

export function getTraceFilePath(sessionFile: string | undefined): string | undefined {
	if (!sessionFile) return undefined;
	const extension = extname(sessionFile);
	const stem = extension ? basename(sessionFile, extension) : basename(sessionFile);
	return join(dirname(sessionFile), "traces", `${stem}.trace.jsonl`);
}

/**
 * Records a safe, append-only causal trace for one AgentSession.
 * Subscriber and filesystem failures are isolated from agent execution.
 */
export class SessionTrace {
	private readonly sessionId: string;
	private readonly onEvent?: (event: TraceEvent) => void;
	private readonly events: TraceEvent[] = [];
	private readonly filePath: string | undefined;
	private active?: ActiveTrace;
	private sequence = 0;
	private writeError?: Error;

	constructor(options: SessionTraceOptions) {
		this.sessionId = options.sessionId;
		this.filePath = getTraceFilePath(options.sessionFile);
		this.onEvent = options.onEvent;
	}

	get isActive(): boolean {
		return this.active !== undefined;
	}

	get traceFile(): string | undefined {
		return this.filePath;
	}

	get lastWriteError(): Error | undefined {
		return this.writeError;
	}

	getEvents(): readonly TraceEvent[] {
		return [...this.events];
	}

	start(attributes: TraceAttributes): TraceSpan {
		if (this.active) this.finish("aborted");
		const traceId = randomUUID();
		const root = this.startSpan(traceId, undefined, "pi.session.turn", "session", attributes);
		this.active = { root, tools: new Map(), status: "ok" };
		return root;
	}

	markStatus(status: TraceStatus): void {
		if (!this.active || statusPriority(status) <= statusPriority(this.active.status)) return;
		this.active.status = status;
	}

	traceSkill<T>(name: string, operation: () => T): T {
		const active = this.active;
		if (!active) return operation();
		const span = this.startSpan(active.root.traceId, active.root.spanId, "pi.agent.skill", "skill", {
			skillName: name,
		});
		try {
			const result = operation();
			this.endSpan(span, "ok");
			return result;
		} catch (error) {
			this.endSpan(span, "error", {
				errorName: error instanceof Error ? error.name : "Error",
			});
			this.markStatus("error");
			throw error;
		}
	}

	startTool(name: string, attributes: TraceAttributes = {}): TraceSpan | undefined {
		const active = this.active;
		if (!active) return undefined;
		return this.startSpan(
			active.root.traceId,
			active.turn?.spanId ?? active.agent?.spanId ?? active.root.spanId,
			name,
			"tool",
			attributes,
		);
	}

	endTool(span: TraceSpan | undefined, status: TraceStatus, attributes: TraceAttributes = {}): void {
		if (!span) return;
		this.endSpan(span, status, attributes);
		this.markStatus(status);
	}

	handleAgentEvent(event: AgentEvent, attributes: TraceAttributes = {}): void {
		const active = this.active;
		if (!active) return;

		if (event.type === "agent_start") {
			if (active.agent) this.closeAgent("aborted");
			active.agent = this.startSpan(active.root.traceId, active.root.spanId, "pi.agent.run", "agent", attributes);
			return;
		}

		if (event.type === "turn_start") {
			if (active.turn) this.closeTurn("aborted");
			active.turn = this.startSpan(
				active.root.traceId,
				active.agent?.spanId ?? active.root.spanId,
				"pi.agent.turn",
				"turn",
				attributes,
			);
			return;
		}

		if (event.type === "tool_execution_start") {
			const existing = active.tools.get(event.toolCallId);
			if (existing) this.endSpan(existing, "aborted");
			const span = this.startSpan(
				active.root.traceId,
				active.turn?.spanId ?? active.agent?.spanId ?? active.root.spanId,
				"pi.agent.tool_call",
				"tool",
				{ toolName: event.toolName, toolCallId: event.toolCallId },
			);
			active.tools.set(event.toolCallId, span);
			return;
		}

		if (event.type === "tool_execution_update") {
			const span = active.tools.get(event.toolCallId);
			if (span) this.updateSpan(span, { toolName: event.toolName, toolCallId: event.toolCallId });
			return;
		}

		if (event.type === "tool_execution_end") {
			const span = active.tools.get(event.toolCallId);
			if (!span) return;
			const status = event.isError ? "error" : "ok";
			this.endSpan(span, status, { toolName: event.toolName, toolCallId: event.toolCallId });
			active.tools.delete(event.toolCallId);
			return;
		}

		if (event.type === "turn_end") {
			const status = assistantStatus(event.message);
			this.closeTurn(status, assistantAttributes(event.message));
			return;
		}

		if (event.type === "agent_end") {
			const message = lastAssistantMessage(event.messages);
			const status = assistantStatus(message);
			this.closeAgent(status, assistantAttributes(message));
			active.status = status;
		}
	}

	finish(status?: TraceStatus, attributes: TraceAttributes = {}): void {
		const active = this.active;
		if (!active) return;
		if (status) this.markStatus(status);
		for (const span of active.tools.values()) this.endSpan(span, status ?? "aborted");
		active.tools.clear();
		if (active.turn) this.closeTurn(status ?? "aborted");
		if (active.agent) this.closeAgent(status ?? active.status);
		this.endSpan(active.root, active.status, attributes);
		this.active = undefined;
	}

	private closeTurn(status: TraceStatus, attributes: TraceAttributes = {}): void {
		const active = this.active;
		if (!active?.turn) return;
		for (const [toolCallId, span] of active.tools) {
			this.endSpan(span, "aborted");
			active.tools.delete(toolCallId);
		}
		this.endSpan(active.turn, status, attributes);
		active.turn = undefined;
	}

	private closeAgent(status: TraceStatus, attributes: TraceAttributes = {}): void {
		const active = this.active;
		if (!active?.agent) return;
		if (active.turn) this.closeTurn(status);
		this.endSpan(active.agent, status, attributes);
		active.agent = undefined;
	}

	private startSpan(
		traceId: string,
		parentSpanId: string | undefined,
		name: string,
		kind: TraceSpanKind,
		attributes: TraceAttributes,
	): TraceSpan {
		const span: TraceSpan = {
			traceId,
			spanId: randomUUID(),
			parentSpanId,
			name,
			kind,
			startedAt: Date.now(),
		};
		this.publish(span, "start", attributes);
		return span;
	}

	private updateSpan(span: TraceSpan, attributes: TraceAttributes): void {
		this.publish(span, "update", attributes);
	}

	private endSpan(span: TraceSpan, status: TraceStatus, attributes: TraceAttributes = {}): void {
		this.publish(span, "end", attributes, status, Math.max(0, Date.now() - span.startedAt));
	}

	private publish(
		span: TraceSpan,
		phase: TraceEventPhase,
		attributes: TraceAttributes,
		status?: TraceStatus,
		durationMs?: number,
	): void {
		const event: TraceEvent = {
			type: "trace",
			schemaVersion: TRACE_SCHEMA_VERSION,
			eventId: randomUUID(),
			sequence: ++this.sequence,
			timestamp: new Date().toISOString(),
			sessionId: this.sessionId,
			traceId: span.traceId,
			spanId: span.spanId,
			parentSpanId: span.parentSpanId,
			name: span.name,
			kind: span.kind,
			phase,
			status,
			durationMs,
			attributes,
		};
		this.events.push(event);

		if (this.filePath && !this.writeError) {
			try {
				mkdirSync(dirname(this.filePath), { recursive: true });
				appendFileSync(this.filePath, `${JSON.stringify(event)}\n`, "utf-8");
			} catch (error) {
				this.writeError = error instanceof Error ? error : new Error(String(error));
			}
		}

		try {
			this.onEvent?.(event);
		} catch {
			// Trace subscribers are passive and must never affect agent execution.
		}
	}
}
