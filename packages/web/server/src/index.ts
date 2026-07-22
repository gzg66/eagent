import express from "express";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SessionManager } from "./session-manager.ts";
import { addClient } from "./sse-handler.ts";

const app = express();
const PORT = Number(process.env.PORT) || 3001;

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
  idleTimeoutMs: 30 * 60 * 1000,
  maxSessions: 10,
});

// ============================================================================
// Session APIs
// ============================================================================

app.get("/api/sessions", (_req, res) => {
  res.json({ sessions: sessionManager.listSessions() });
});

app.post("/api/sessions", (req, res) => {
  try {
    const { cwd } = req.body ?? {};
    const session = sessionManager.createSession(cwd);
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

app.patch("/api/sessions/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  const { label } = req.body ?? {};
  if (!label) {
    res.status(400).json({ error: "label is required" });
    return;
  }
  const updated = sessionManager.setSessionLabel(sessionId, String(label));
  if (!updated) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.json({ success: true });
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
    const session = sessionManager.createSession();
    effectiveSessionId = session.id;
  }

  const process = sessionManager.getProcess(effectiveSessionId);
  if (!process) {
    res.status(404).json({ error: "Session not found or expired" });
    return;
  }

  try {
    await process.send({ type: "prompt", message });
    res.json({ sessionId: effectiveSessionId, accepted: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post("/api/chat/:sessionId/abort", async (req, res) => {
  const { sessionId } = req.params;
  const process = sessionManager.getProcess(sessionId);
  if (!process) {
    res.status(404).json({ error: "Session not found or expired" });
    return;
  }

  try {
    await process.send({ type: "abort" });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// ============================================================================
// SSE Stream
// ============================================================================

app.get("/api/stream", (req, res) => {
  const sessionId = req.query.sessionId as string;

  if (!sessionId) {
    res.status(400).json({ error: "sessionId query parameter is required" });
    return;
  }

  const process = sessionManager.getProcess(sessionId);
  if (!process) {
    res.status(404).json({ error: "Session not found or expired" });
    return;
  }

  addClient(sessionId, res, process, sessionManager);
});

// ============================================================================
// State API (get current state for reconnection)
// ============================================================================

app.get("/api/state/:sessionId", async (req, res) => {
  const { sessionId } = req.params;
  const process = sessionManager.getProcess(sessionId);
  if (!process) {
    res.status(404).json({ error: "Session not found or expired" });
    return;
  }

  try {
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
  const process = sessionManager.getProcess(sessionId);
  if (!process) {
    res.status(404).json({ error: "Session not found or expired" });
    return;
  }

  try {
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
