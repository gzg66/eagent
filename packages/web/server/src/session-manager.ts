import { randomUUID } from "node:crypto";
import type { AgentSessionEvent } from "@enterprise-agent/coding-agent";
import { AgentProcess } from "./agent-process.ts";

export interface SessionInfo {
  id: string;
  label: string;
  createdAt: number;
  lastActivityAt: number;
}

interface SessionEntry {
  id: string;
  label: string;
  process: AgentProcess;
  createdAt: number;
  lastActivityAt: number;
  /** Buffered events for late-connecting SSE clients */
  eventBuffer: AgentSessionEvent[];
}

const MAX_BUFFER = 200;

export class SessionManager {
  private sessions = new Map<string, SessionEntry>();
  private idleTimeoutMs: number;
  private maxSessions: number;
  private idleTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: { idleTimeoutMs?: number; maxSessions?: number } = {}) {
    this.idleTimeoutMs = options.idleTimeoutMs ?? 30 * 60 * 1000;
    this.maxSessions = options.maxSessions ?? 10;
  }

  createSession(cwd?: string): SessionInfo {
    if (this.sessions.size >= this.maxSessions) {
      throw new Error(`Maximum sessions (${this.maxSessions}) reached`);
    }

    const id = randomUUID();
    const label = `Session ${this.sessions.size + 1}`;
    const now = Date.now();
    const eventBuffer: AgentSessionEvent[] = [];

    const process = new AgentProcess(id, {
      cwd,
      onStderr: (data) => {
        console.error(`[session:${id.slice(0, 8)}] ${data.trim()}`);
      },
      onExit: (error) => {
        if (error) {
          console.error(`[session:${id.slice(0, 8)}] Process exited with error: ${error.message}`);
        }
        this.sessions.delete(id);
      },
    });

    // Start buffering events immediately — before any SSE client connects
    process.onEvent((event) => {
      eventBuffer.push(event);
      if (eventBuffer.length > MAX_BUFFER) eventBuffer.shift();
    });

    const entry: SessionEntry = { id, label, process, createdAt: now, lastActivityAt: now, eventBuffer };
    this.sessions.set(id, entry);

    if (!this.idleTimer) {
      this.startIdleReaper();
    }

    return { id, label, createdAt: now, lastActivityAt: now };
  }

  getProcess(sessionId: string): AgentProcess | undefined {
    const entry = this.sessions.get(sessionId);
    if (entry) {
      entry.lastActivityAt = Date.now();
    }
    return entry?.process;
  }

  getEventBuffer(sessionId: string): AgentSessionEvent[] {
    const entry = this.sessions.get(sessionId);
    return entry?.eventBuffer ?? [];
  }

  getSession(sessionId: string): SessionInfo | undefined {
    const entry = this.sessions.get(sessionId);
    if (!entry) return undefined;
    return {
      id: entry.id,
      label: entry.label,
      createdAt: entry.createdAt,
      lastActivityAt: entry.lastActivityAt,
    };
  }

  listSessions(): SessionInfo[] {
    return Array.from(this.sessions.values()).map((e) => ({
      id: e.id,
      label: e.label,
      createdAt: e.createdAt,
      lastActivityAt: e.lastActivityAt,
    }));
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const entry = this.sessions.get(sessionId);
    if (!entry) return false;
    this.sessions.delete(sessionId);
    await entry.process.dispose();
    if (this.sessions.size === 0 && this.idleTimer) {
      clearInterval(this.idleTimer);
      this.idleTimer = null;
    }
    return true;
  }

  setSessionLabel(sessionId: string, label: string): boolean {
    const entry = this.sessions.get(sessionId);
    if (!entry) return false;
    entry.label = label;
    return true;
  }

  private startIdleReaper(): void {
    this.idleTimer = setInterval(() => {
      const now = Date.now();
      const cutoff = now - this.idleTimeoutMs;
      for (const [id, entry] of this.sessions) {
        if (entry.lastActivityAt < cutoff) {
          console.log(`[session:${id.slice(0, 8)}] Idle timeout, disposing...`);
          entry.process.dispose();
          this.sessions.delete(id);
        }
      }
      if (this.sessions.size === 0 && this.idleTimer) {
        clearInterval(this.idleTimer);
        this.idleTimer = null;
      }
    }, 60_000);
  }

  get sessionCount(): number {
    return this.sessions.size;
  }

  async shutdown(): Promise<void> {
    if (this.idleTimer) {
      clearInterval(this.idleTimer);
      this.idleTimer = null;
    }
    const disposals = Array.from(this.sessions.values()).map((e) => e.process.dispose());
    this.sessions.clear();
    await Promise.all(disposals);
  }
}
