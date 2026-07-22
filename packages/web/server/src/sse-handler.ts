import { randomUUID } from "node:crypto";
import type { Response } from "express";
import type { AgentSessionEvent } from "@enterprise-agent/coding-agent";
import type { AgentProcess } from "./agent-process.ts";
import type { SessionManager } from "./session-manager.ts";

export interface SSEClient {
  id: string;
  sessionId: string;
  response: Response;
}

const clients = new Map<string, SSEClient>();

export function addClient(
  sessionId: string,
  res: Response,
  process: AgentProcess,
  sessionManager: SessionManager,
): SSEClient {
  const id = randomUUID();
  const client: SSEClient = { id, sessionId, response: res };

  // SSE setup
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(":ok\n\n");

  // Replay buffered events (captured since session creation, before SSE connected)
  const buffer = sessionManager.getEventBuffer(sessionId);
  for (const event of buffer) {
    sendEvent(client, event);
  }

  // Subscribe to future events
  const unsubscribe = process.onEvent((event) => {
    for (const c of getClientsForSession(sessionId)) {
      sendEvent(c, event);
    }
  });

  // Cleanup on disconnect
  res.on("close", () => {
    unsubscribe();
    clients.delete(id);
  });

  clients.set(id, client);
  return client;
}

export function sendEvent(client: SSEClient, event: AgentSessionEvent): void {
  const data = JSON.stringify(event);
  client.response.write(`event: ${event.type}\ndata: ${data}\n\n`);
}

export function getClientsForSession(sessionId: string): SSEClient[] {
  return Array.from(clients.values()).filter((c) => c.sessionId === sessionId);
}
