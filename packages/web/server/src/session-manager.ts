import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import type {
  AgentSessionEvent,
  RpcExtensionUIRequest,
  RpcResponse,
  TraceEvent,
} from "@enterprise-agent/coding-agent";
import {
  getTraceFilePath,
  SessionManager as CoreSessionManager,
} from "@enterprise-agent/coding-agent";
import { AgentProcess } from "./agent-process.ts";

export interface SessionInfo {
  id: string;
  label: string;
  createdAt: number;
  lastActivityAt: number;
}

export type WebStreamEvent =
  | AgentSessionEvent
  | { type: "approval_request"; request: RpcExtensionUIRequest };

export interface BufferedWebStreamEvent {
  cursor: number;
  event: WebStreamEvent;
}

export interface SessionHistory {
  events: AgentSessionEvent[];
  isStreaming: boolean;
  cursor: number;
}

interface SessionEntry {
  id: string;
  label: string;
  sessionFile: string;
  cwd: string;
  createdAt: number;
  lastActivityAt: number;
  process?: AgentProcess;
  startingProcess?: Promise<AgentProcess>;
  nextCursor: number;
  eventBuffer: BufferedWebStreamEvent[];
  listeners: Set<(item: BufferedWebStreamEvent) => void>;
}

const MAX_BUFFER = 10_000;

function responseData(response: RpcResponse, command: RpcResponse["command"]): unknown {
  if (!response.success || response.command !== command || !("data" in response)) {
    throw new Error(response.success ? `Unexpected RPC response for ${command}` : response.error);
  }
  return response.data;
}

function messageText(message: unknown): string {
  if (!message || typeof message !== "object" || !("content" in message)) return "";
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (part): part is { type: "text"; text: string } =>
        Boolean(
          part &&
            typeof part === "object" &&
            "type" in part &&
            part.type === "text" &&
            "text" in part &&
            typeof part.text === "string",
        ),
    )
    .map((part) => part.text)
    .join("\n");
}

function historyEventsFromMessages(messages: unknown[]): AgentSessionEvent[] {
  const events: AgentSessionEvent[] = [];
  for (const message of messages) {
    if (!message || typeof message !== "object" || !("role" in message)) continue;
    const role = message.role;
    if (role === "user" || role === "assistant") {
      events.push({ type: "message_start", message } as AgentSessionEvent);
      events.push({ type: "message_end", message } as AgentSessionEvent);
      if (role === "assistant" && "content" in message && Array.isArray(message.content)) {
        for (const part of message.content) {
          if (
            !part ||
            typeof part !== "object" ||
            !("type" in part) ||
            part.type !== "toolCall" ||
            !("id" in part) ||
            typeof part.id !== "string" ||
            !("name" in part) ||
            typeof part.name !== "string"
          ) {
            continue;
          }
          events.push({
            type: "tool_execution_start",
            toolCallId: part.id,
            toolName: part.name,
            args: "arguments" in part ? part.arguments : {},
          });
        }
      }
      continue;
    }

    if (
      role === "toolResult" &&
      "toolCallId" in message &&
      typeof message.toolCallId === "string" &&
      "toolName" in message &&
      typeof message.toolName === "string"
    ) {
      events.push({
        type: "tool_execution_end",
        toolCallId: message.toolCallId,
        toolName: message.toolName,
        result: {
          content: "content" in message ? message.content : [],
          details: "details" in message ? message.details : undefined,
        },
        isError: "isError" in message && message.isError === true,
      });
    }
  }
  return events;
}

function readTraceEvents(sessionFile: string): AgentSessionEvent[] {
  const traceFile = getTraceFilePath(sessionFile);
  if (!traceFile || !existsSync(traceFile)) return [];
  try {
    return readFileSync(traceFile, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [{ type: "trace_event", event: JSON.parse(line) as TraceEvent } satisfies AgentSessionEvent];
        } catch {
          return [];
        }
      });
  } catch (error) {
    console.warn(`Unable to read trace history from ${traceFile}: ${String(error)}`);
    return [];
  }
}

function sessionLabel(info: {
  name?: string;
  firstMessage: string;
  id: string;
}): string {
  return info.name?.trim() || info.firstMessage.trim().slice(0, 80) || `Session ${info.id.slice(0, 8)}`;
}

export class SessionManager {
  private readonly sessions = new Map<string, SessionEntry>();
	private readonly cwd: string;
	private readonly sessionDir: string | undefined;
  private readonly idleTimeoutMs: number;
  private readonly maxProcesses: number;
  private idleTimer: ReturnType<typeof setInterval> | undefined;

  constructor(
    options: {
			cwd?: string;
			sessionDir?: string;
      idleTimeoutMs?: number;
      maxProcesses?: number;
    } = {},
  ) {
		this.cwd = options.cwd ?? process.cwd();
		this.sessionDir = options.sessionDir;
    this.idleTimeoutMs = options.idleTimeoutMs ?? 30 * 60 * 1000;
    this.maxProcesses = options.maxProcesses ?? 10;
  }

  async initialize(): Promise<void> {
		const persisted = await CoreSessionManager.list(this.cwd, this.sessionDir);
    for (const info of persisted) {
      this.sessions.set(info.id, {
        id: info.id,
        label: sessionLabel(info),
        sessionFile: info.path,
        cwd: info.cwd || this.cwd,
        createdAt: info.created.getTime(),
        lastActivityAt: info.modified.getTime(),
        nextCursor: 0,
        eventBuffer: [],
        listeners: new Set(),
      });
    }
    this.startIdleReaper();
  }

  async createSession(cwd?: string): Promise<SessionInfo> {
    const id = randomUUID();
    const effectiveCwd = cwd ?? this.cwd;
		const coreSession = CoreSessionManager.create(effectiveCwd, this.sessionDir, { id });
    const sessionFile = coreSession.ensureSessionFile();
    if (!sessionFile) throw new Error("Failed to allocate a persistent session file");
    coreSession.getSkillDataDir();
    const now = Date.now();
    const entry: SessionEntry = {
      id,
      label: `Session ${this.sessions.size + 1}`,
      sessionFile,
      cwd: effectiveCwd,
      createdAt: now,
      lastActivityAt: now,
      nextCursor: 0,
      eventBuffer: [],
      listeners: new Set(),
    };
    this.sessions.set(id, entry);
    return this.toSessionInfo(entry);
  }

  async getProcess(sessionId: string): Promise<AgentProcess | undefined> {
    const entry = this.sessions.get(sessionId);
    if (!entry) return undefined;
    entry.lastActivityAt = Date.now();
    if (entry.process?.isRunning) return entry.process;
    if (entry.startingProcess) return entry.startingProcess;

    const activeProcesses = [...this.sessions.values()].filter((candidate) => candidate.process?.isRunning).length;
    if (activeProcesses >= this.maxProcesses) {
      throw new Error(`Maximum active sessions (${this.maxProcesses}) reached`);
    }

    const start = Promise.resolve().then(() => {
      const agentProcess = new AgentProcess(entry.id, {
        cwd: entry.cwd,
        sessionFile: entry.sessionFile,
        onStderr: (data) => {
          console.error(`[session:${entry.id.slice(0, 8)}] ${data.trim()}`);
        },
        onExit: (error) => {
          if (entry.process !== agentProcess) return;
          entry.process = undefined;
          if (error) {
            console.error(`[session:${entry.id.slice(0, 8)}] Process exited: ${error.message}`);
          }
        },
      });
      agentProcess.onEvent((event) => {
        entry.lastActivityAt = Date.now();
        if (event.type === "session_info_changed" && event.name?.trim()) {
          entry.label = event.name.trim();
        } else if (event.type === "message_end" && event.message.role === "user") {
          const label = messageText(event.message).trim().slice(0, 80);
          if (label && entry.label.startsWith("Session ")) entry.label = label;
        }
        this.appendEvent(entry, event);
      });
      agentProcess.onUiRequest((request) => {
        this.appendEvent(entry, { type: "approval_request", request });
      });
      entry.process = agentProcess;
      return agentProcess;
    });
    entry.startingProcess = start;
    try {
      return await start;
    } finally {
      entry.startingProcess = undefined;
    }
  }

  getEventBuffer(sessionId: string, afterCursor = 0): BufferedWebStreamEvent[] {
    const entry = this.sessions.get(sessionId);
    return entry?.eventBuffer.filter((item) => item.cursor > afterCursor) ?? [];
  }

  subscribe(
    sessionId: string,
    listener: (item: BufferedWebStreamEvent) => void,
  ): (() => void) | undefined {
    const entry = this.sessions.get(sessionId);
    if (!entry) return undefined;
    entry.listeners.add(listener);
    return () => entry.listeners.delete(listener);
  }

  getSession(sessionId: string): SessionInfo | undefined {
    const entry = this.sessions.get(sessionId);
    return entry ? this.toSessionInfo(entry) : undefined;
  }

  listSessions(): SessionInfo[] {
    return [...this.sessions.values()]
      .sort((a, b) => b.lastActivityAt - a.lastActivityAt)
      .map((entry) => this.toSessionInfo(entry));
  }

  async getHistory(sessionId: string): Promise<SessionHistory | undefined> {
    const entry = this.sessions.get(sessionId);
    if (!entry) return undefined;
    const agentProcess = await this.getProcess(sessionId);
    if (!agentProcess) return undefined;

    const messagesResponse = await agentProcess.send({ type: "get_messages" });
    const messagesData = responseData(messagesResponse, "get_messages") as { messages?: unknown[] };
    const stateResponse = await agentProcess.send({ type: "get_state" });
    const state = responseData(stateResponse, "get_state") as { isStreaming?: boolean };
    return {
      events: [
        ...historyEventsFromMessages(messagesData.messages ?? []),
        ...readTraceEvents(entry.sessionFile),
      ],
      isStreaming: state.isStreaming === true,
      cursor: entry.nextCursor,
    };
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const entry = this.sessions.get(sessionId);
    if (!entry) return false;
    this.sessions.delete(sessionId);
    if (entry.process) await entry.process.dispose();
    CoreSessionManager.deleteSessionFile(entry.sessionFile);
    return true;
  }

  async setSessionLabel(sessionId: string, label: string): Promise<boolean> {
    const entry = this.sessions.get(sessionId);
    if (!entry) return false;
    const agentProcess = await this.getProcess(sessionId);
    if (!agentProcess) return false;
    const response = await agentProcess.send({ type: "set_session_name", name: label });
    if (!response.success) throw new Error(response.error);
    entry.label = label;
    entry.lastActivityAt = Date.now();
    return true;
  }

  private appendEvent(entry: SessionEntry, event: WebStreamEvent): void {
    const item = { cursor: ++entry.nextCursor, event };
    entry.eventBuffer.push(item);
    if (entry.eventBuffer.length > MAX_BUFFER) entry.eventBuffer.shift();
    for (const listener of entry.listeners) listener(item);
  }

  private toSessionInfo(entry: SessionEntry): SessionInfo {
    return {
      id: entry.id,
      label: entry.label,
      createdAt: entry.createdAt,
      lastActivityAt: entry.lastActivityAt,
    };
  }

  private startIdleReaper(): void {
    if (this.idleTimer) return;
    this.idleTimer = setInterval(() => {
      const cutoff = Date.now() - this.idleTimeoutMs;
      for (const entry of this.sessions.values()) {
        if (!entry.process || entry.lastActivityAt >= cutoff) continue;
        const processToDispose = entry.process;
        entry.process = undefined;
        console.log(`[session:${entry.id.slice(0, 8)}] Idle timeout, releasing runtime`);
        void processToDispose.dispose();
      }
    }, 60_000);
    this.idleTimer.unref();
  }

  get sessionCount(): number {
    return this.sessions.size;
  }

  async shutdown(): Promise<void> {
    if (this.idleTimer) {
      clearInterval(this.idleTimer);
      this.idleTimer = undefined;
    }
    const disposals = [...this.sessions.values()].flatMap((entry) =>
      entry.process ? [entry.process.dispose()] : [],
    );
    await Promise.allSettled(disposals);
    for (const entry of this.sessions.values()) entry.process = undefined;
  }
}
