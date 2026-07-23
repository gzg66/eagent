import express from "express";
import { OrchestratorTaskClient } from "@enterprise-agent/coding-agent";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SessionManager } from "./session-manager.ts";
import { addClient } from "./sse-handler.ts";

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const taskClient = new OrchestratorTaskClient(process.cwd());

app.use(express.json());

// Chrome DevTools noise — suppress .well-known requests early
app.use("/.well-known", (_req, res) => {
  res.status(404).end();
});

// Security headers
app.use((_req, res, next) => {
  res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'");
  next();
});

// Serve pre-built client static files (avoids needing Vite dev server at runtime)
const __dirname = dirname(fileURLToPath(import.meta.url));
const clientDist = join(__dirname, "..", "..", "..", "client", "dist");
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // SPA fallback: serve index.html for non-API, non-static routes
  // Express v5 requires named wildcard: /{*path} instead of *
  app.get("/{*path}", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    if (req.path.startsWith("/.")) return next(); // well-known, hidden paths
    if (req.path.includes(".")) return next();    // explicit file requests
    res.sendFile(join(clientDist, "index.html"));
  });
  console.log(`Serving static files from ${clientDist}`);
}

const sessionManager = new SessionManager({
  cwd: process.cwd(),
  idleTimeoutMs: 30 * 60 * 1000,
  maxProcesses: 10,
});
await sessionManager.initialize();

// ============================================================================
// Session APIs
// ============================================================================

app.get("/api/sessions", (_req, res) => {
  res.json({ sessions: sessionManager.listSessions() });
});

app.post("/api/sessions", async (req, res) => {
  try {
    const { cwd } = req.body ?? {};
    const session = await sessionManager.createSession(cwd);
    res.status(201).json(session);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.delete("/api/sessions/:sessionId", async (req, res) => {
  const { sessionId } = req.params;
  const deleted = await sessionManager.deleteSession(sessionId);
  if (!deleted) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.json({ success: true });
});

app.patch("/api/sessions/:sessionId", async (req, res) => {
  const { sessionId } = req.params;
  const { label } = req.body ?? {};
  if (!label) {
    res.status(400).json({ error: "label is required" });
    return;
  }
  try {
    const updated = await sessionManager.setSessionLabel(sessionId, String(label));
    if (!updated) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get("/api/sessions/:sessionId/history", async (req, res) => {
  try {
    const history = await sessionManager.getHistory(req.params.sessionId);
    if (!history) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// ============================================================================
// Chat API
// ============================================================================

app.post("/api/chat", async (req, res) => {
  const { sessionId, message } = req.body ?? {};

  if (!message) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  // Create a session if not specified
  let effectiveSessionId = sessionId;
  if (!effectiveSessionId) {
    const session = await sessionManager.createSession();
    effectiveSessionId = session.id;
  }

  try {
    const process = await sessionManager.getProcess(effectiveSessionId);
    if (!process) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    await process.send({ type: "prompt", message });
    res.json({ sessionId: effectiveSessionId, accepted: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post("/api/chat/:sessionId/abort", async (req, res) => {
  const { sessionId } = req.params;

  try {
    const process = await sessionManager.getProcess(sessionId);
    if (!process) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    await process.send({ type: "abort" });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post("/api/approval/:sessionId", async (req, res) => {
  const { sessionId } = req.params;
  const process = await sessionManager.getProcess(sessionId);
  if (!process) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const { id, value, confirmed, cancelled } = req.body ?? {};
  if (typeof id !== "string") {
    res.status(400).json({ error: "id is required" });
    return;
  }
  const response = cancelled
    ? { type: "extension_ui_response" as const, id, cancelled: true as const }
    : typeof confirmed === "boolean"
      ? { type: "extension_ui_response" as const, id, confirmed }
      : typeof value === "string"
        ? { type: "extension_ui_response" as const, id, value }
        : undefined;
  if (!response) {
    res.status(400).json({ error: "value, confirmed, or cancelled is required" });
    return;
  }
  if (!process.respondUi(response)) {
    res.status(409).json({ error: "Approval request is no longer pending" });
    return;
  }
  res.json({ success: true });
});

// ============================================================================
// SSE Stream
// ============================================================================

app.get("/api/stream", async (req, res) => {
  const sessionId = req.query.sessionId as string;

  if (!sessionId) {
    res.status(400).json({ error: "sessionId query parameter is required" });
    return;
  }

  try {
    const process = await sessionManager.getProcess(sessionId);
    if (!process) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    const requestedCursor = Number(
      req.query.after ?? req.header("Last-Event-ID") ?? 0,
    );
    const afterCursor =
      Number.isSafeInteger(requestedCursor) && requestedCursor >= 0
        ? requestedCursor
        : 0;
    addClient(sessionId, afterCursor, res, sessionManager);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// ============================================================================
// State API (get current state for reconnection)
// ============================================================================

app.get("/api/state/:sessionId", async (req, res) => {
  const { sessionId } = req.params;

  try {
    const process = await sessionManager.getProcess(sessionId);
    if (!process) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    const response = await process.send({ type: "get_state" });
    if (response.success) {
      res.json((response as { data: unknown }).data);
    } else {
      res.status(500).json({ error: response.error });
    }
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get("/api/messages/:sessionId", async (req, res) => {
  const { sessionId } = req.params;

  try {
    const process = await sessionManager.getProcess(sessionId);
    if (!process) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    const response = await process.send({ type: "get_messages" });
    if (response.success) {
      res.json((response as { data: unknown }).data);
    } else {
      res.status(500).json({ error: response.error });
    }
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get("/api/tasks", async (_req, res) => {
  try {
    const response = await taskClient.request({ type: "list_tasks" });
    if (!response.ok) {
      res.status(503).json({ error: response.error });
      return;
    }
    res.json({ tasks: response.type === "task_list_result" ? response.tasks : [] });
  } catch (error) {
    res.status(503).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// ============================================================================
// Health
// ============================================================================

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", sessions: sessionManager.sessionCount });
});

// ============================================================================
// Graceful shutdown
// ============================================================================

process.on("SIGTERM", async () => {
  console.log("Shutting down...");
  await sessionManager.shutdown();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("Shutting down...");
  await sessionManager.shutdown();
  process.exit(0);
});

// ============================================================================
// Start
// ============================================================================

app.listen(PORT, () => {
  console.log(`Enterprise Agent Web Server listening on http://localhost:${PORT}`);
});
