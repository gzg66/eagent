import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type {
  AgentSessionEvent,
  RpcCommand,
  RpcExtensionUIRequest,
  RpcExtensionUIResponse,
  RpcResponse,
} from "@enterprise-agent/coding-agent";

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export interface AgentProcessOptions {
  cwd?: string;
  sessionFile?: string;
  onStderr?: (data: string) => void;
  onExit?: (error?: Error) => void;
}

export class AgentProcess {
  readonly sessionId: string;
  private process: ChildProcess;
  private exited = false;
  private nextRequestId = 0;
  private stdoutBuffer = "";
  private stderrBuffer = "";
  private readonly pendingRequests = new Map<string, PendingRequest>();
  private readonly eventListeners = new Set<(event: AgentSessionEvent) => void>();
  private readonly exitListeners = new Set<(error?: Error) => void>();
  private readonly uiRequestListeners = new Set<(request: RpcExtensionUIRequest) => void>();
  private readonly pendingUiRequests = new Set<string>();

  constructor(sessionId: string, options: AgentProcessOptions = {}) {
    this.sessionId = sessionId;

    // Use import.meta.resolve for ESM-based resolution (coding-agent exports only has "import" condition)
    const rpcUrl = import.meta.resolve("@enterprise-agent/coding-agent/rpc-entry");
    const rpcPath = fileURLToPath(rpcUrl);
    const args = [rpcPath];
    if (options.sessionFile) {
      args.push("--session", options.sessionFile);
    } else {
      args.push("--session-id", sessionId);
    }
    this.process = spawn(process.execPath, args, {
      cwd: options.cwd ?? process.cwd(),
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    if (!this.process.stdin || !this.process.stdout) {
      throw new Error("Failed to create agent process stdio");
    }

    this.process.stdout.setEncoding("utf8");
    this.process.stdout.on("data", (chunk: string) => {
      this.stdoutBuffer += chunk;
      while (true) {
        const newlineIndex = this.stdoutBuffer.indexOf("\n");
        if (newlineIndex === -1) break;
        const line = this.stdoutBuffer.slice(0, newlineIndex).trim();
        this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
        if (!line) continue;
        this.handleLine(line);
      }
    });

    this.process.stderr?.setEncoding("utf8");
    this.process.stderr?.on("data", (chunk: string) => {
      this.stderrBuffer += chunk;
      options.onStderr?.(chunk);
    });

    this.process.once("error", (error) => {
      this.exited = true;
      const wrapped = new Error(`Agent process error: ${error.message}. Stderr: ${this.stderrBuffer}`);
      this.rejectAllPending(wrapped);
      this.notifyExit(wrapped);
    });

    this.process.once("exit", (code, signal) => {
      this.exited = true;
      const error = new Error(`Agent process exited (code=${code} signal=${signal}). Stderr: ${this.stderrBuffer}`);
      this.rejectAllPending(error);
      this.notifyExit(error);
    });
  }

  private handleLine(line: string): void {
    let parsed: { type?: string; id?: string };
    try {
      parsed = JSON.parse(line);
    } catch {
      return;
    }

    if (parsed.type === "response") {
      if (parsed.id) {
        const pending = this.pendingRequests.get(parsed.id);
        if (pending) {
          this.pendingRequests.delete(parsed.id);
          pending.resolve(parsed as RpcResponse);
        }
      }
      return;
    }

    if (parsed.type === "extension_ui_request") {
      const request = parsed as RpcExtensionUIRequest;
      this.pendingUiRequests.add(request.id);
      for (const listener of this.uiRequestListeners) listener(request);
      return;
    }

    // Otherwise treat as AgentSessionEvent
    for (const listener of this.eventListeners) {
      listener(parsed as AgentSessionEvent);
    }
  }

  private rejectAllPending(error: Error): void {
    for (const [id, pending] of this.pendingRequests) {
      this.pendingRequests.delete(id);
      pending.reject(error);
    }
  }

  private notifyExit(error?: Error): void {
    for (const listener of this.exitListeners) {
      listener(error);
    }
  }

  send(command: RpcCommand): Promise<RpcResponse> {
    if (this.exited) {
      throw new Error("Agent process is not running");
    }
    const id = command.id ?? `web_${++this.nextRequestId}_${randomUUID()}`;
    const fullCommand = { ...command, id };
    return new Promise<RpcResponse>((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.process.stdin?.write(`${JSON.stringify(fullCommand)}\n`, (error) => {
        if (error) {
          this.pendingRequests.delete(id);
          reject(toError(error));
        }
      });
    });
  }

  onEvent(listener: (event: AgentSessionEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  onExit(listener: (error?: Error) => void): () => void {
    this.exitListeners.add(listener);
    return () => {
      this.exitListeners.delete(listener);
    };
  }

  onUiRequest(listener: (request: RpcExtensionUIRequest) => void): () => void {
    this.uiRequestListeners.add(listener);
    return () => this.uiRequestListeners.delete(listener);
  }

  respondUi(response: RpcExtensionUIResponse): boolean {
    if (this.exited || !this.pendingUiRequests.delete(response.id)) return false;
    this.process.stdin?.write(`${JSON.stringify(response)}\n`);
    return true;
  }

  get isRunning(): boolean {
    return !this.exited;
  }

  get stderr(): string {
    return this.stderrBuffer;
  }

  async dispose(): Promise<void> {
    this.pendingUiRequests.clear();
    this.rejectAllPending(new Error("Agent process disposed"));
    if (this.exited) return;
    this.process.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      this.process.once("exit", () => resolve());
    });
  }
}

interface PendingRequest {
  resolve(response: RpcResponse): void;
  reject(error: Error): void;
}
