import { useState, useCallback, useRef } from "react";
import type { AgentSessionEvent, ApprovalRequest, SessionInfo, WebStreamEvent } from "./types.ts";

interface ChatState {
  messages: AgentSessionEvent[];
  isStreaming: boolean;
  sessionId: string | null;
  sessions: SessionInfo[];
  approvals: ApprovalRequest[];
}

export function useChat() {
  const [state, setState] = useState<ChatState>({
    messages: [],
    isStreaming: false,
    sessionId: null,
    sessions: [],
    approvals: [],
  });

  // Safety timer ref — cleared when agent_end / error trace arrives,
  // fires after 90s to prevent UI stuck on "thinking" forever.
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSafetyTimer = useCallback(() => {
    if (safetyTimerRef.current) {
      clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
  }, []);

  const handleEvent = useCallback((event: WebStreamEvent) => {
    setState((prev) => {
      if (event.type === "approval_request") {
        return { ...prev, approvals: [...prev.approvals.filter((item) => item.id !== event.request.id), event.request] };
      }
      let isStreaming = prev.isStreaming;
      switch (event.type) {
        case "agent_start":
        case "turn_start":
          isStreaming = true;
          break;
        case "agent_end":
        case "agent_settled":
          isStreaming = false;
          clearSafetyTimer();
          break;
        case "trace_event": {
          // When agent turn fails before agent_start (e.g. auth error),
          // the only signal we get is a trace event with status=error.
          // Reset streaming so the UI doesn't show "thinking" forever.
          const evt = event.event as { name?: string; phase?: string; status?: string } | undefined;
          if (evt?.name === "agent.session.turn" && evt?.phase === "end" && evt?.status === "error") {
            isStreaming = false;
            clearSafetyTimer();
          }
          break;
        }
      }
      return {
        ...prev,
        messages: [...prev.messages, event],
        isStreaming,
      };
    });
  }, []);

  const loadSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/sessions");
      const data = (await res.json()) as { sessions: SessionInfo[] };
      const sessions = data.sessions ?? [];
      setState((prev) => ({ ...prev, sessions }));
      return sessions;
    } catch {
      return [];
    }
  }, []);

  const createSession = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        console.error("Failed to create session:", res.status);
        return null;
      }
      const session = (await res.json()) as SessionInfo;
      setState((prev) => ({
        ...prev,
        sessions: [...prev.sessions, session],
      }));
      return session.id;
    } catch (err) {
      console.error("Failed to create session:", err);
      return null;
    }
  }, []);

  const selectSession = useCallback(async (sessionId: string) => {
    clearSafetyTimer();
    setState((prev) => ({
      ...prev,
      sessionId,
      messages: [],
      isStreaming: false,
      approvals: [],
    }));
  }, []);

  const sendMessage = useCallback(
    async (message: string) => {
      // Resolve sessionId: use current state, or create one
      let sid: string | null = null;

      setState((prev) => {
        sid = prev.sessionId;
        return prev;
      });

      if (!sid) {
        sid = await createSession();
        if (!sid) return;
      }

      // User message will arrive via SSE; just mark streaming.
      // Safety timeout: if no agent_end / error trace arrives within 90s,
      // reset streaming so the UI doesn't show "thinking" forever.
      if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = setTimeout(() => {
        setState((prev) => {
          if (!prev.isStreaming) return prev;
          return { ...prev, isStreaming: false };
        });
      }, 90_000);

      setState((prev) => ({
        ...prev,
        sessionId: sid,
        isStreaming: true,
      }));

      // Send to backend
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: sid, message }),
        });
        if (!res.ok) {
          console.error("Chat API error:", res.status);
        }
      } catch (err) {
        console.error("Failed to send message:", err);
        clearSafetyTimer();
        setState((prev) => ({
          ...prev,
          isStreaming: false,
        }));
      }
    },
    [createSession, clearSafetyTimer],
  );

  const deleteSession = useCallback(
    async (sessionId: string) => {
      try {
        await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
          method: "DELETE",
        });
      } catch {
        // continue
      }
      setState((prev) => ({
        ...prev,
        sessions: prev.sessions.filter((s) => s.id !== sessionId),
        sessionId: prev.sessionId === sessionId ? null : prev.sessionId,
        messages: prev.sessionId === sessionId ? [] : prev.messages,
      }));
    },
    [],
  );

  const abort = useCallback(async () => {
    const sid = state.sessionId;
    if (!sid) return;
    clearSafetyTimer();
    try {
      await fetch(`/api/chat/${encodeURIComponent(sid)}/abort`, {
        method: "POST",
      });
    } catch {
      // continue
    }
  }, [state.sessionId, clearSafetyTimer]);

  const respondApproval = useCallback(async (id: string, response: { value?: string; confirmed?: boolean; cancelled?: boolean }) => {
    const sid = state.sessionId;
    if (!sid) return;
    const res = await fetch(`/api/approval/${encodeURIComponent(sid)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...response }),
    });
    if (res.ok) {
      setState((prev) => ({ ...prev, approvals: prev.approvals.filter((item) => item.id !== id) }));
    }
  }, [state.sessionId]);

  return {
    ...state,
    handleEvent,
    loadSessions,
    createSession,
    selectSession,
    sendMessage,
    deleteSession,
    abort,
    respondApproval,
  };
}
