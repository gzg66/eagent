import { randomUUID } from "node:crypto";
import type { Response } from "express";
import type {
  BufferedWebStreamEvent,
  SessionManager,
} from "./session-manager.ts";

export interface SSEClient {
  id: string;
  sessionId: string;
  response: Response;
  lastCursor: number;
}

const clients = new Map<string, SSEClient>();

export function addClient(
  sessionId: string,
  afterCursor: number,
  res: Response,
  sessionManager: SessionManager,
): SSEClient {
  const id = randomUUID();
  const client: SSEClient = {
    id,
    sessionId,
    response: res,
    lastCursor: afterCursor,
  };

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(":ok\n\n");

  let replaying = true;
  const pending: BufferedWebStreamEvent[] = [];
  const unsubscribe = sessionManager.subscribe(sessionId, (item) => {
    if (replaying) {
      pending.push(item);
      return;
    }
    sendEvent(client, item);
  });
  if (!unsubscribe) {
    res.end();
    return client;
  }

  for (const item of sessionManager.getEventBuffer(sessionId, afterCursor)) {
    sendEvent(client, item);
  }
  replaying = false;
  for (const item of pending) {
    sendEvent(client, item);
  }

  res.on("close", () => {
    unsubscribe();
    clients.delete(id);
  });

  clients.set(id, client);
  return client;
}

export function sendEvent(
  client: SSEClient,
  item: BufferedWebStreamEvent,
): void {
  if (item.cursor <= client.lastCursor) return;
  client.lastCursor = item.cursor;
  const data = JSON.stringify(item.event);
  client.response.write(
    `id: ${item.cursor}\nevent: ${item.event.type}\ndata: ${data}\n\n`,
  );
}

export function getClientsForSession(sessionId: string): SSEClient[] {
  return [...clients.values()].filter((client) => client.sessionId === sessionId);
}
