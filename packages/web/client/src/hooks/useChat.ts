import { useState, useCallback } from "react";
import type { AgentSessionEvent, SessionInfo, UserMessage } from "./types.ts";

interface ChatState {
  messages: AgentSessionEvent[];
  isStreaming: boolean;
  sessionId: string | null;
  sessions: SessionInfo[];
}

export function useChat() {
  const [state, setState] = useState<ChatState>({
    messages: [],
    isStreaming: false,
    sessionId: null,
    sessions: [],
  });

  const handleEvent = useCallback((event: AgentSessionEvent) => {
    setState((prev) => {
      let isStreaming = prev.isStreaming;
      switch (event.type) {
        case "agent_start":
          isStreaming = true;
          break;
        case "agent_end":
        case "agent_settled":
          isStreaming = false;
          break;
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
    setState((prev) => ({
      ...prev,
      sessionId,
      messages: [],
      isStreaming: false,
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

      // Optimistically add user message to the list immediately
      const userEvent: AgentSessionEvent = {
        type: "message_start",
        message: {
          role: "user",
          content: message,
          timestamp: Date.now(),
        } as UserMessage,
      };

      setState((prev) => ({
        ...prev,
        sessionId: sid,
        messages: [...prev.messages, userEvent],
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
        setState((prev) => ({
          ...prev,
          isStreaming: false,
        }));
      }
    },
    [createSession],
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
    try {
      await fetch(`/api/chat/${encodeURIComponent(sid)}/abort`, {
        method: "POST",
      });
    } catch {
      // continue
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
  };
}
